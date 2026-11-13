---
"cyber-agentkit": minor
---

`/skill vet <source>` vets a third-party skill before it is installed. It takes `owner/repo`, `owner/repo/<path>`, a
GitHub URL, or an `https://` git URL, clones it shallow to a temporary folder outside the working copy (no hooks,
submodules, or links followed), runs every Security check on each skill in it, and removes the folder. A critical
finding blocks the install and exits 1; a warning is reported without blocking. It also reports who publishes the
source (and whether that publisher is on the `--trust` list), whether it is maintained (last commit and latest
release), its license, and the install count skills.sh reports from the `skills` CLI's opt-in telemetry, shown only
for an exact match and never replaced by GitHub stars.
