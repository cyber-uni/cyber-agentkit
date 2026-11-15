---
"cyber-agentkit": minor
---

`skill test` runs each case on the harness's mid-tier model (`sonnet` on Claude Code) unless `--model` names a tier
(`small`, `mid`, `top`) or a model ID, so a full test no longer spends the most capable model on every case. A case in
`evals.yaml` can set its own `model:`, a tier or an ID, which wins over `--model`; the judge keeps `--judge`. The result
records the model the cases ran on and each case's own, `skill test` and `skill report` print them, and a comparison
with a result taken on another model warns which cases changed model. Codex has no known tiers, so its runs keep their
default and the test warns. Headless definitions gain `modelTiers`.
