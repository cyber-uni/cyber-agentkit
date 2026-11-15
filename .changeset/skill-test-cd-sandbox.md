---
"cyber-agentkit": patch
---

`skill test`: a `cd` into the copied plugin folder no longer breaks every later shell command of a Claude Code run. Each command now starts back in the run's folder (`CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR`), so the sandbox no longer fails with `bwrap: Can't create file at …/.claude/launch.json: Read-only file system`.
