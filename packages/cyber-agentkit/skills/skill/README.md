# Skill

Designs an agent skill through aspects a team can swap one at a time. `/skill` creates a skill from a described job, checks it without running it, tests it by running its evals, fixes what check
or test found, enhances it beyond that, and customizes which implementation each aspect uses. Intent, Shape, and Trigger are built in. Criteria, Verification, and every
open aspect, such as Security, are references (`skill-design.aspects.<aspect>`) that another plugin can replace through
the `reference` skill's Customize mode. The default Verification runs each case several times in a sandbox, on
promptfoo, beside a run without the skill. Type `/skill` to run it yourself. Installed as a Claude Code plugin, it is
`/cyber-agentkit:skill` (pnpm install: `pnpm-cyber-agentkit-skill`).

| Command | Does |
| --- | --- |
| `help` | lists and explains the commands; also what a bare `/skill` shows |
| `create` | drafts Intent, Criteria, Shape, and Trigger for approval, builds the skill, then checks and tests it |
| `check` | reads the skill against every aspect; changes nothing |
| `test` | runs the evals and saves the result; changes nothing |
| `fix` | repairs what check or test found |
| `enhance` | suggests improvements one at a time, from use or a request |
| `customize` | shows which implementation each aspect uses and each command's autonomy, and changes them through the `reference` skill |

It ships in the `cyber-agentkit` plugin:

```text
/plugin marketplace add cyber-uni/marketplace
/plugin install cyber-agentkit@cyber-uni
```
