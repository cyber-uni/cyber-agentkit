---
"cyber-agentkit": minor
---

Requires clibuilder 12.2 and follows its AXI conventions. A bare `cyber-agentkit` shows live data (the detected harness and the commands, with next steps) instead of a `missing-command` error. Every `reference` command, `prose-update classify` and `retire`, and `asset list` carry `examples` in their help. `prose-update` failures are coded `CliError`s on stdout (`invalid-usage` with exit code 2, or the classifier's own code with exit code 1) instead of lines on stderr.
