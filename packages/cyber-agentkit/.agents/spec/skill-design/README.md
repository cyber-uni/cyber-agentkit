---
spec-type: behavioral
status: draft
---

# skill-design: a skill author designs a skill through aspects they can swap one at a time

**Outcome:** an author, human or agent, creates, checks, tests, fixes, and enhances a skill by running `/skill`, and
turns work already done into one by running `/skillify`. Each
step of that work is an aspect whose default ships with `cyber-agentkit`, and any plugin can replace a swappable aspect without
editing the others.

## What

A skill author, human or agent, has no one way to design a skill. The skill-writing tools that exist today (aced's
`define-skill` and `skillify`, Anthropic's `skill-creator`, `plugin-dev`) each walk their own steps and tie them to their
own rules. A team that wants a different rule for one step, such as how a trigger description is checked, has to copy
the whole tool and keep the copy current. None of them asks the author what a different team would want to choose
differently, so choices like the output template end up written into the skill. Anyone who must trust a skill before
sharing it has no common bar to check it against.

`skill-design` splits the work of designing a skill into **aspects**: intent, criteria, shape, trigger, verification, and others.
Each aspect states what it receives and what it must produce. `cyber-agentkit` ships a default for every aspect and a
front door, `/skill`, with five commands: create a skill, check it without running it, test it by running its evals,
fix what check or test found, and enhance it beyond that. A second skill, `/skillify`, turns work already done into
the description `create` needs and runs it. A team or plugin replaces one
aspect with its own and keeps the rest.

## Non-goals

- **N1.** Defining what a valid skill is. The Agent Skills specification is the floor, and every aspect works within it.
- **N2.** Generating plugin manifests, or distributing skills or plugins, such as through `npx skills`.
  `universal-plugin` does the plugin part.
- **N3.** Deciding when the process runs: a schedule, or a trigger from session events. The steps are in scope, and the
  loop that calls them is not.
- **N4.** Designing artifacts other than skills (agents, commands, plugins, references), and deciding which one a
  request needs.
- **N5.** A general way to compose any group of references. Only a family of aspects needs the wildcard in customize and
  in the implementations listing.
- **N6.** Building an eval engine. The default Verification runs on an existing one.
- **N7.** Vetting a skill someone else wrote before using it: its source, whether it is maintained, its licence. A
  skill consumer, who uses a designed skill but never runs `/skill`, is left to a later spec.

## Key terms

- **K1. Aspect.** One step of designing a skill. Its contract is what it receives and the criteria its output meets.
  A **swappable aspect** is published as the reference interface `skill-design.aspects.<aspect>`, with one
  implementation chosen: Criteria, Verification, and every open aspect. Intent, Shape, and Trigger are written into
  `/skill` itself and are not swapped. Where a criterion speaks of an aspect's implementation, it means a swappable one.
- **K2. Core aspect.** Intent, Criteria, Shape, Trigger, or Verification. `create` walks the first four in that order,
  then builds the skill and runs Verification against the Criteria. **Open aspect:** any other. `enhance` reviews every
  aspect, core and open.
- **K3. Family.** The aspect interfaces under `skill-design.aspects`, addressed by a wildcard. No interface is named for
  the family.
- **K4. Front door.** The `/skill` skill with the commands create, check, test, fix, and enhance. `check`
  reads the skill against every aspect's criteria without running it, like a linter; `test` runs the Verification
  aspect's evals, both whether the skill fires on the right requests and whether its result meets the Criteria.
- **K5. Skillify.** Designing a skill from a source that already exists, such as a session, existing instructions, or
  another skill, instead of from the author's answers. The source shows what the skill does, not what it should do, so
  the author still decides.
- **K6. Rubric.** For one criterion, what a run's output is judged on, so that the run passes or fails it. The
  Verification aspect writes it during `create`, alongside the eval cases.
- **K7. Autonomy.** How much a command applies on its own: `ask` proposes each item and the author decides;
  `apply-safe` applies what passes `check` and `test` with no criterion worse and asks about the rest; `apply` applies
  everything and still reports it.
- **K8. Check script.** The part of an aspect implementation that a script runs without an agent. Its front matter
  names it, and the script reports which of the implementation's criteria it decides.

Default, implementation, extend, selection, and interface are as in [reference](../reference/README.md). Criterion is as
in the design-spec skill.

## Actors and goals

| ID | Actor | Goal |
| --- | --- | --- |
| A1.1 | Skill author | Gets a working skill for a job they describe, without knowing the aspects beforehand. |
| A1.2 | Skill author | Turns work already done (a session, existing instructions, another skill) into a skill whose behavior they chose, not one copied from the source. |
| A1.3 | Skill author | Knows, for each aspect, whether a skill as written meets that aspect's criteria, without running it and with the skill left unchanged. |
| A1.4 | Skill author | Has the failures that check or test found repaired. |
| A1.5 | Skill author | Gets suggestions to improve a skill that already passes, on any aspect, from reading the skill, from how it was used, or from their own request, and applies only the ones they accept. |
| A1.6 | Skill author | Knows whether the skill fires on the requests it should and not on near misses, and whether running it gives a result that meets its Criteria. |
| A2.1 | Agent improving a skill it uses | Makes the skill better from what happened while using it, keeping only changes the evals show help, within the autonomy the user allowed. |
| A3.1 | Team lead | Swaps or extends one aspect and keeps the rest. |
| A3.2 | Team lead | Chooses an implementation for every aspect in one pass, such as taking one plugin's whole set or mixing several, instead of changing aspects one at a time. |
| A3.3 | Team lead | Sets how much freedom each command has. |
| A3.4 | Team lead | Sees which implementation each aspect uses. |
| A3.5 | Team lead | Applies a choice to the whole repo, or only to themselves. |
| A4.1 | Plugin author | Ships an extension or a new open aspect without any change to `/skill`. |
| A4.2 | Plugin author | Knows their implementation meets the aspect's criteria. |

**Child specs.** Each use case lives in the child that owns it; UC11 stays here.

| Child | Use cases | Criteria |
| --- | --- | --- |
| [create](./create/README.md) | UC1 | Create |
| [skillify](./skillify/README.md) | UC2 | Skillify |
| [check](./check/README.md) | UC3 | Check |
| [test](./test/README.md) | UC6 | Test |
| [fix](./fix/README.md) | UC4 | Fix |
| [enhance](./enhance/README.md) | UC5, UC7 | Enhance and self-improvement |
| [customize](./customize/README.md) | UC8, UC9, UC10 | Autonomy, Aspects and implementations |

## Use cases

### UC11 — Ship a new open aspect or an implementation (A4.1, A4.2)

- **Trigger:** a plugin author wants to add an open aspect, or ship their own implementation of an existing aspect.
- **Entry points:** skill (primary): the `reference` skill's Create and Inspect modes. Code: `reference create`,
  `reference check`, `reference implementations`.
- **Inputs:** for a new aspect, an interface document named `skill-design.aspects.<aspect>`; for an implementation, a
  document that implements one; the plugin.
- **Success:** once the plugin is installed, `/skill` finds a new open aspect through the family wildcard, and
  `enhance` reviews it, with no change to `/skill`. An implementation is listed by `implementations` only when it
  passes the interface check, as in [reference UC6](../reference/interfaces/README.md) and UC15. The author can tell
  whether its output meets the aspect's criteria, not only its sections, by running `/skill`'s evals on the sample
  skills with the implementation picked: `/skill check` reports a pass or the problems it found, as a linter does,
  and `/skill test` reports its results beside the default's.
- **Extensions:**
  - **UC11.1** A new aspect is named `interface` or `default`. It is refused, because `skill-design.aspects.interface`
    and `skill-design.aspects.default` would collide with the name endings the `reference` spec gives interface
    documents and defaults (its K8 and K13).
  - **UC11.2** A plugin tries to add a core aspect. It becomes an open aspect; only `cyber-agentkit` defines the core
    five (K2).

## Criteria

**Every command (UC1 to UC6)**

- R1 (UC3.1, UC4.1, UC5.1, UC6.1): When the skill named cannot be found, the command stops, names what it looked for,
  and writes nothing.
- R2 (UC1.3, UC3.3, UC4.6, UC5.6, UC6.6): When an aspect's selected implementation cannot be found, the command uses
  that aspect's default and says which aspect fell back and which implementation was missing.
- R3 (UC1, UC2, UC4, UC5): A skill that `create` or `skillify` writes meets the Agent Skills specification.
- R78 (UC3, UC4, UC6): No judge runs unless the author names one.
- R4 (UC3, UC6): In an interactive run that found failures, `check` and `test` end by offering `fix`. Nothing changes
  unless the author accepts. With no author present, no offer is made.

**Aspects and implementations (UC11)**

- R67 (UC8, UC11): Each swappable aspect (K1) is the reference interface `skill-design.aspects.<aspect>`, and
  `cyber-agentkit` ships a default for every one it defines, including the open aspect Security.
- R71 (UC11): An open aspect that an installed plugin ships is checked by `check` and reviewed by `enhance`, with no
  change to `/skill`.
- R72 (UC11.1): An aspect named `interface` or `default` is refused.
- R73 (UC11.2): An aspect a plugin marks as core is treated as open.
- R75 (UC3, UC11): An aspect implementation names its check script (K8) in front matter, and the script run in CI
  runs the check script of each selected implementation. An implementation that extends another, and names none of
  its own, uses the one it extends, as the `reference` spec merges front matter.
- R79 (UC11): `cyber-agentkit` ships sample skills as the evals of `/skill` itself: one that passes every check, and
  one with known problems. Each eval case states what `check` must report on a sample, a pass or the problems it has;
  `check` saves nothing to compare with. A sample that passes keeps its expected `test` result, and with any
  implementation picked, `/skill test` on it reports that implementation's results beside the expected ones.

## Open questions

None.

## References

- Design record: issue #153. Why aspects, the ownership split between `cyber-agentkit`, aced, and `universal-plugin`,
  and the tools compared: `.research/skill-design-interface`.
- Interface, default, implementation, extend, selection, picks, and the `interface` and `default` name endings (K1,
  UC8, UC11.1): [reference](../reference/README.md), its [write](../reference/write/README.md) (UC9, UC18) and
  [interfaces](../reference/interfaces/README.md) (UC6, UC15) specs. The wildcard on `skill-design.aspects.*` (UC9,
  R69) is that spec's family (K39, UC24), which owns its behavior.
- The validity floor (N1, R3, R20): the [Agent Skills specification](https://agentskills.io/specification).
- Criterion, and how criteria are written: the `design-spec` skill and `.research/design-spec-criteria`.
- The eval system the default Verification builds on, rubrics as pass or fail per run, pass rates, isolation, and
  baselines (N6, K6, UC6, R22 to R35): `.research/skill-evals`.
- The split of `check` into a CI script part and an agent part (UC3, R19, R75): aced's `improve-skill` and its
  `validate.mjs`.
- Suggestions offered one at a time, only accepted ones written (UC5): `buddy-agent-harness` `enhance`.
- Self-improvement from use without hooks, repeat evidence before a rule, and eval-gated skill changes (UC7, R54 to
  R60): [`agent-self-improvement`](https://github.com/repobuddy/buddy-agent-harness/tree/main/.research/agent-self-improvement)
  in `buddy-agent-harness` (pull request repobuddy/buddy-agent-harness#309).
