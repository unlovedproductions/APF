# APF Phase 11 — Live Promolinks (operator)

Automated code cannot complete this step. Requires GUI Firefox login to Digistore24.

1. `cd ~/APF && pnpm digistore24:login` (or documented Firefox login flow)
2. Run daemon with `--promote` to collect **approved** promolinks
3. Verify synthetic `status=generated` links are replaced in DB

See `IMPROVEMENTS.md` and `todo.md` Phase 11.
