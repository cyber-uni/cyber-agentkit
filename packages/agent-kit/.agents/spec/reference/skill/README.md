---
spec-type: behavioral
---

# reference/skill — a skill loads the references it names, and carries on when one is not answered

Part of [reference](../README.md). Its What, key terms, actors, adapters, names, and output contract apply here;
IDs are shared across the parent and its children.

## Use Cases

### UC4 — Act on an unanswered name (A1.2, A7.1)

- **Trigger:** a name comes back with a status other than `found`, or the command does not run.
- **Entry points:** Skill: the `reference` skill's Load mode. This use case is behavior of the skill's instructions.
- **Outcome:** the consumer takes the step the reason calls for and carries on; the agent user is told what the agent
  runs without.
- **Extensions:**
  - UC4.1 `missing`: the consumer carries on without it, and the user is told the name was not loaded. No substitute
    is searched for, and the skill does not read its own default instead: the command already included it. When a
    `remove` turned the name off, nothing is said; the trace explains it.
  - UC4.2 `ambiguous`: with a user present, the options are listed (each `<plugin>/<name>`, and the skill's default
    if it has one), the user picks one even when only one is left, the pick is written as a selection contribution
    (UC9), and the name loads from it. With no user, the consumer carries on without it, and the user is told to
    settle it.
  - UC4.3 `invalid`: the consumer carries on without it, and the user is told the skill's load line names something
    that is not a reference name, a fault to report to the skill's author.
  - UC4.4 The command does not run: each name is read from the skill's own `references/<name>.default.md`, and the
    user is told no customization applied and why the command did not run. A name with no default contribution is not
    loaded.
  - UC4.5 Every name is `found`: nothing is said.

### UC12 — Wire a skill to load references (A6.1)

- **Trigger:** a skill author wants a skill to load references by name, with defaults others can customize.
- **Entry points:** Skill: the `reference` skill's Wire a skill mode, which gives the load line: "Load `<name>` and
  `<name>` with the `reference` skill of `uni-agent-kit`." Code: none directly; Load runs
  `show <name>... --default <the caller's folder>` (UC1).
- **Inputs:** the names; the harness the skill is written for, if only one; the defaults the author ships.
- **Outcome:** the skill carries one load line naming the references and the `reference` skill with its package, in
  words every harness reads. The author ships each default as `<skill>/references/<name>.default.md`. When the skill
  runs, Load resolves the names with the skill's folder as the `default` tier (UC1) and acts on an unanswered name
  (UC4); a customizer finds the defaults with `list` (UC3) and builds on them (UC5, UC7).
- **Extensions:**
  - UC12.1 A skill written for one harness: the line may add that harness's typed form of the skill
    (`.research/harness-detection` R4). A harness with no typed form recorded gets the words only.
  - UC12.2 The skill uses an interface: the line names the interface ("Load the implementations of the `<id>`
    interface ..."); Load lists the implementations (UC6), and the skill loads each by its pin.
  - UC12.3 The agent cannot tell the caller's folder: the names resolve without the `default` tier, and the user is
    told.
  - UC12.4 The `reference` skill is not installed: the line names the package, so the agent tells the user what to
    install.
  - UC12.5 A skill ships its copy as `references/<name>.md` (the old layout): it is not read as a default. A name no
    other contribution holds is then `missing`, and UC4.1 tells the user.

## Criteria

Edge IDs are in [graph.md](./graph.md).

**Fallback (UC4)**

- R21 (UC4, E23): The skill reads its own `references/<name>.default.md` only when the command did not run, never for
  a name the command reported, whatever its status.
- R59 (UC4, E49): With a user present, an `ambiguous` name lists every option, the skill's default included, even
  when one is left; the pick is written with `reference select`, and the name loads from it. With no user, it is not
  loaded, and the user is told to settle it.
- R22 (UC4, E24): Every name read from a fallback, and every name not loaded, is reported to the user with the
  reason, except a name a `remove` turned off; nothing is reported when every name came from the command.
- R23 (UC4, E25): An `invalid` name's path is never read.

## Open questions

- **Q6.** UC4 is behavior of skill text, so it cannot be a deterministic unit test (C5). How is it checked: a skill
  eval, or a fixture run of the Load steps?
