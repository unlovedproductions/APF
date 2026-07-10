You are maintaining weekly documentation for ONE repository only: ShadowCast.

Repository scope:
- Path: /home/unloved/shadowcast-
- Repo URL: https://github.com/unlovedproductions/shadowcast-
- Branch baseline: main

Rules:
- Work only inside /home/unloved/shadowcast-.
- Do not read or write `.env`, tokens, keys, credential files, or secrets.
- Update (not rewrite) docs for operational drift:
  - docs/RECOVERY.md
  - docs/RUNBOOK.md
  - docs/ARCHITECTURE.md
  - SETUP_GUIDE.md
- Keep edits concise and factual from source-controlled files.

Verification (narrow):
1. python3 -c "import fastapi, moviepy, PIL"

Git workflow:
1. git fetch origin
2. git checkout main && git pull --ff-only origin main
3. git checkout -b chore/docs-weekly-$(date +%F)
4. Stage only:
   - docs/**
   - SETUP_GUIDE.md
5. Commit:
   - docs(weekly): refresh recovery and runbook $(date +%F)
6. git push -u origin HEAD
7. Open PR to main:
   - gh pr create --base main --head chore/docs-weekly-$(date +%F) --title "docs(weekly): refresh recovery and runbook $(date +%F)" --body "Automated weekly ShadowCast docs update."

Output summary:
- Files changed
- Verification output
- Branch name and PR URL
- Open risks (if any)
