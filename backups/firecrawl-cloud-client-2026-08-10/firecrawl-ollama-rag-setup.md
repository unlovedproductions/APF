# Self-Hosted Firecrawl + Local Ollama (Pop!_OS)

## 1. .env additions

On Linux, `host.docker.internal` doesn't resolve automatically like it does on
Mac/Windows Docker Desktop — you need `extra_hosts` in compose (below) or use
your Docker bridge IP. The current Firecrawl codebase talks to Ollama via its
**OpenAI-compatible** endpoint (`/v1`), not the native `/api` path. Older docs
mention `OLLAMA_BASE_URL` — leave it set too for forward-compat, but treat
`OPENAI_BASE_URL` as the one that actually works.

Append to `firecrawl/.env`:

```bash
# --- Local LLM via Ollama (OpenAI-compatible endpoint) ---
OPENAI_BASE_URL=http://host.docker.internal:11434/v1
OPENAI_API_KEY=ollama-dummy-key
MODEL_NAME=llama3.1:8b
MODEL_EMBEDDING_NAME=nomic-embed-text

# legacy var, harmless to keep set
OLLAMA_BASE_URL=http://host.docker.internal:11434/api
```

Swap `llama3.1:8b` for whatever model you're already running for inference on
the Razer/local stack. Pull the embedding model if you don't have it:

```bash
ollama pull nomic-embed-text
```

## 2. Make the container reach the host

Add this to `docker-compose.yaml` under the `api` service (and `worker` if
your compose file has one — check the pinned v2.11.162 file):

```yaml
services:
  api:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

If you're running Ollama itself in a container on the same machine instead of
natively, put both containers on the same Docker network and reference the
Ollama container name instead of `host.docker.internal`.

## 3. Rebuild and restart

```bash
docker compose down
docker compose up --build -d
docker compose logs --tail=100 api
```

Ignore warnings about missing `SUPABASE_*`, `SEARXNG_*`, `SLACK_*` — expected
in self-hosted mode.

## 4. Verify Ollama is reachable from inside the container

```bash
docker compose exec api curl -s http://host.docker.internal:11434/v1/models
```

A JSON model list back means you're good. A 404 or connection refused means
either Ollama isn't listening on `0.0.0.0` (check `OLLAMA_HOST=0.0.0.0` on the
Ollama service) or the `extra_hosts` entry didn't take — recheck step 2.

## 5. Test AI extraction end-to-end

```bash
curl -s -X POST http://localhost:3002/v2/extract \
  -H 'Content-Type: application/json' \
  -d '{
    "urls": ["https://example.com"],
    "prompt": "Extract the page title and main heading."
  }'
```

## 6. Minimal local RAG pipeline (Firecrawl scrape -> Ollama embed -> store)

```python
import requests
import ollama

FIRECRAWL_URL = "http://localhost:3002/v2/scrape"

def scrape(url: str) -> str:
    resp = requests.post(
        FIRECRAWL_URL,
        json={"url": url, "formats": ["markdown"], "timeout": 60000},
        timeout=75,
    )
    resp.raise_for_status()
    return resp.json()["data"]["markdown"]

def chunk(text: str, size: int = 800, overlap: int = 100):
    chunks = []
    i = 0
    while i < len(text):
        chunks.append(text[i:i + size])
        i += size - overlap
    return chunks

def embed(chunks: list[str]):
    vectors = []
    for c in chunks:
        r = ollama.embeddings(model="nomic-embed-text", prompt=c)
        vectors.append((c, r["embedding"]))
    return vectors

if __name__ == "__main__":
    md = scrape("https://example.com")
    chunks = chunk(md)
    vectors = embed(chunks)
    print(f"Scraped {len(md)} chars -> {len(chunks)} chunks -> {len(vectors)} embeddings")
    # next: push vectors into your vector store of choice (Chroma, pgvector, etc.)
```

Requires `pip install requests ollama` on the host (or wherever this script
runs — it just needs network access to both `localhost:3002` and Ollama).

## Notes specific to your setup

- If you're using Podman instead of Docker for other projects (Ollama/Open
  WebUI), Firecrawl's compose file is written for Docker Compose v2 syntax.
  `podman-compose` mostly works but `extra_hosts: host-gateway` support can be
  flaky — if you hit issues, run Firecrawl under real Docker and keep Podman
  for the rest, they can coexist.
- Crawl/batch jobs on a local LLM will be slow compared to cloud extraction —
  fine for a personal RAG index, not great for large-site crawls. Keep
  `MODEL_NAME` on something small/fast (8B class) unless you don't mind the wait.
