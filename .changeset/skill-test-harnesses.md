---
"cyber-agentkit": minor
---

`skill test` runs on more than Claude Code. `--harness codex` drives each run through `codex exec`, and `--backend plugin-eval` runs the cases on Claude Code's own `claude plugin eval`. Both save the same result as a normal run. Where a run keeps its config, skills, plugins, and login now comes from the harness definition: `headlessInvocation()` declares it as `isolation` for Claude Code and Codex, and every run's environment is built from that. Claude Code runs are isolated as before. A Codex run still reads the global `AGENTS.md` in `CODEX_HOME`, and the test warns about it. `claude plugin eval` cannot run `script` checks, so a criterion that uses one is reported as not tested on that backend.
