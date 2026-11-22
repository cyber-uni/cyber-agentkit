---
'cyber-agentkit': minor
---

`skill test` grades `judge` checks on the harness the runs drive, with its mid-tier model, when no `--judge` is
named, so an unattended run no longer reports those criteria as not tested. Claude Code judges with `sonnet` through
the Agent SDK; Codex judges through its own CLI on its default model, since its tiers are not known, and the test
warns `harness-default-judge`. `--judge` still names another judge, and now takes a tier (`small`, `mid`, `top`) as
well as a model ID. `--no-judge` runs without a judge and reports those criteria as not tested. The result records
the judge as `judge` (`default` when the harness picked it), and the text report and `skill report` name it.
