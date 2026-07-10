# Docs Automation Git Push Strategy

Use this workflow in every weekly docs automation run.

## Branching
1. `git fetch origin`
2. `git checkout main`
3. `git pull --ff-only origin main`
4. `git checkout -b chore/docs-weekly-YYYY-MM-DD`

## Allowed staged files only
- `docs/**`
- `README.md`
- `SETUP_GUIDE.md`
- `SETUP_POPOS.md`
- `LINUX_SETUP.md`

## Hard excludes
- `.env*`
- key/token files
- binaries and LFS payloads
- `node_modules/`
- `venv/`

## Commit
Message format:

`docs(weekly): refresh recovery and runbook YYYY-MM-DD`

## Push + PR
1. `git push -u origin HEAD`
2. If `main` is protected, open PR:
   - `gh pr create --base main --head chore/docs-weekly-YYYY-MM-DD --title "docs(weekly): refresh recovery and runbook YYYY-MM-DD" --body "Automated weekly docs update."`

## Failure behavior
- If push/PR fails, stop and report the error.
- Do not loop retries.
