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
| `create` | drafts Intent, Criteria, Shape, and Trigger, builds the skill, checks it, then tests it within the test budget; also what `/skill <description>` runs |
| `check` | reads the skill against every aspect; changes nothing |
| `test` | runs the evals and saves the result; changes nothing |
| `fix` | repairs what check or test found |
| `enhance` | suggests improvements one at a time, from use or a request |
| `vet` | fetches a third-party skill, runs every Security check, and gives an install verdict with supply-chain signals |
| `customize` | shows which implementation each aspect uses and each command's autonomy, and changes them through the `reference` skill |

Every run behaves the same way, whether a person is watching or an agent was dispatched; the leash decides where it
stops. `create`, `fix`, and `enhance` each start by stating their autonomy level and why: `ask` (propose each item),
`apply-safe` (apply what `check` and `test` show is safe), or `apply` (apply everything and report it). The author's
request or a `skill-design.autonomy` customization sets it; by default `create` applies, `fix` applies what is safe,
and `enhance` asks, and work that adds or edits a skill, such as implementing an issue, applies. The same reference
holds a test budget, `$10 or 60 runs` by default: `skill test --estimate` prices a test from its last saved result
(or $0.18 a run with none), and a test within the budget runs without asking. A test over the budget, or a decision
that is the author's alone, such as changing a skill's Intent, stops the run: the work so far is kept and reported,
and the reply ends with the question and its options.

Every skill needs a `## Done when` section, the last section of its `SKILL.md`, listing the checkable outcomes
`- **C1.** <statement>` the agent checks before it reports done. This holds for a skill that only another skill loads
too. `check` fails a skill without one (CRI-1, critical), so a repository adopting `/skill check` adds the section to
each of its skills. The failure shows the section to add.

It ships in the `cyber-agentkit` plugin:

```text
/plugin marketplace add cyber-uni/marketplace
/plugin install cyber-agentkit@cyber-uni
```
