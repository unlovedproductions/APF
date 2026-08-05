# Source 09 — youtube-transcript-api

- **Type:** OSS
- **Credibility:** 5
- **URL:** https://github.com/jdepoix/youtube-transcript-api
- **Maps to:** Way 3

## Verbatim quotes

> This is a python API which allows you to get the transcript/subtitles for a given YouTube video. It also works for automatically generated subtitles and it does not require an API key nor a headless browser

## Why it matters

Review videos often have empty HTML but dense captions. SERP → video ID → transcript → multi-paragraph `content_text`. APF already has a YouTube path in `enrichSourceContent`; harden with reliable caption fetch (`TRANSCRIPT_API_KEY` or equivalent OSS approach via a thin Node wrapper / sidecar — no new paid SaaS required).
