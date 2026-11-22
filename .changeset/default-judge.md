---
'cyber-agentkit': minor
---

`skill test` grades `judge` checks with Claude Code's mid-tier model (`sonnet`) when no `--judge` is named, so an
unattended run no longer reports those criteria as not tested. `--judge` still names another judge, and now takes a
tier (`small`, `mid`, `top`) as well as a model ID. `--no-judge` runs without a judge and reports those criteria as not
tested. The result records the judge as `judge`, and the text report and `skill report` name it.
