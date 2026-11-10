---
'cyber-agentkit': minor
---

Add the `skill` skill (`/skill`) and the `cyber-agentkit skill` command. `/skill` creates, backfills, checks, tests,
fixes, and enhances an agent skill through aspects. Intent, Shape, and Trigger are built in. Criteria, Verification,
and Security ship as reference interfaces (`skill-design.aspects.<aspect>`) whose defaults another plugin can replace.
`skill check <folder>` checks a skill without running it, running each aspect's check script, and exits 1 on a
failure, so it can run in CI. `skill test <folder>` runs the skill's `evals/evals.yaml` on promptfoo through pinned
`npx`, several runs per case, each in a fresh folder with only that skill installed, beside a run without the skill,
and saves the result under `.agents/skill-design/results/`.
