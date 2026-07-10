# Weekly Documentation Automation

This directory is the implementation of the weekly docs/recovery automation plan.

## Target Worker
- Name: `~/APF (+3) @ pop-os`
- Workspace roots:
  - `/home/unloved/APF`
  - `/home/unloved/shadowcast-`
  - `/home/unloved/mission-control`
  - `/home/unloved/unlovedproductions.com`

## Split Automation Schedule
- Monday 18:00: APF
- Tuesday 18:00: ShadowCast
- Wednesday 18:00: Mission Control
- Thursday 18:00: unlovedproductions.com

## Why split runs
- Reduces timeout/credit risk versus one mega run.
- Keeps each PR focused on one repo.
- Makes failures diagnosable (repo-level blast radius).

## Files
- `automations.json` — ready-to-paste automation definitions.
- `prompts/*.md` — repo-specific prompt payloads.
- `git-push-strategy.md` — branch/commit/push/PR policy used by every run.

## Bridge Health Check (pre-schedule)
Confirm worker log is advancing and has no session errors:

```bash
rg "Received frame|Session state before connect|Auth token expired" \
  /home/unloved/.config/Cursor/User/globalStorage/anysphere.cursor-agent-worker/cursor-agent-worker-5a7fd81639.log
```
