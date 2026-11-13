# Skill

Designs an agent skill through aspects a team can swap one at a time. `/skill` creates a skill from a described job, checks it without running it, tests it by running its evals, fixes what check
or test found, enhances it beyond that, customizes which implementation each aspect uses, and vets a third-party skill before it is installed. Intent, Shape, and Trigger are built in. Criteria, Verification, and every
open aspect, such as Security, are references (`skill-design.aspects.<aspect>`) that another plugin can replace through
the `reference` skill's Customize mode. The default Verification runs each case several times in a sandbox, on
promptfoo, beside a run without the skill. Type `/skill` to run it yourself. Installed as a Claude Code plugin, it is
`/cyber-agentkit:skill` (pnpm install: `pnpm-cyber-agentkit-skill`).

| Command | Does |
| --- | --- |
| `help` | lists and explains the commands; also what a bare `/skill` shows |
| `create` | drafts Intent, Criteria, Shape, and Trigger, builds the skill, checks it, then tests it once you agree; also what `/skill <description>` runs |
| `check` | reads the skill against every aspect; changes nothing |
| `test` | runs the evals and saves the result; changes nothing |
| `fix` | repairs what check or test found |
| `enhance` | suggests improvements one at a time, from use or a request |
| `vet` | fetches a third-party skill, runs every Security check, and gives an install verdict with supply-chain signals |
| `customize` | shows which implementation each aspect uses and each command's autonomy, and changes them through the `reference` skill |

`create`, `fix`, and `enhance` each start by stating their autonomy level and why: `ask` (propose each item),
`apply-safe` (apply what `check` and `test` show is safe), or `apply` (apply everything and report it). The author's
request or a `skill-design.autonomy` customization sets it; otherwise the run derives it from the situation. With an
author present, `create` applies, `fix` applies what is safe, and `enhance` asks. With no author present, as in a
session dispatched to implement an issue, the command does the work and reports each decision it made. A decision that
is the author's alone, such as changing a skill's Intent, stops the run at every level.

Every skill needs a `## Done when` section, the last section of its `SKILL.md`, listing the checkable outcomes
`- **C1.** <statement>` the agent checks before it reports done. This holds for a skill that only another skill loads
too. `check` fails a skill without one (CRI-1, critical), so a repository adopting `/skill check` adds the section to
each of its skills. The failure shows the section to add.

It ships in the `cyber-agentkit` plugin:

```text
/plugin marketplace add cyber-uni/marketplace
/plugin install cyber-agentkit@cyber-uni
```
