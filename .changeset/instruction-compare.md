---
"cyber-agentkit": minor
---

Add the `instruction` skill and the `cyber-agentkit instruction compare` command. It compares two wordings of an always-loaded instruction, given as a file or as `<file>#<heading>` for one section. It runs the same outcome cases with each wording loaded as the harness's project instruction file (`CLAUDE.md` on Claude Code, `AGENTS.md` on Codex), then reports each criterion's pass rate for each wording and which wording wins. The result is saved the way `skill test` saves its own. `--plan` states the run count without starting, and the skill drafts cases for approval when none exist.
