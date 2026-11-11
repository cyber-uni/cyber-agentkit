---
'cyber-agentkit': minor
---

Add the `skill` skill (`/skill`), the `skillify` skill (`/skillify`), and the `cyber-agentkit skill` command. `/skill`
has seven commands: help, create, check, test, fix, enhance, and customize. Intent, Shape, and Trigger are built in.
Criteria, Verification, and Security ship as reference interfaces (`skill-design.aspects.<aspect>`) whose defaults
another plugin can replace; `/skill customize` shows which implementation each aspect uses and changes it through the
`reference` skill. `/skillify` turns work already done into a skill. `skill check <folder>` checks a skill without
running it and exits 1 on a failure, so it can run in CI. `skill test <folder>` runs the skill's `evals/evals.yaml` on
promptfoo through pinned `npx`, several runs per case, each in a fresh folder, beside a run without the skill, and
saves the result under `.agents/skill-design/results/`. It reports progress on stderr as runs finish, runs fewer than
half the machine's hardware threads at once, stops a runaway shell command after 30 seconds, and `--case <id>` runs
only the named cases.
