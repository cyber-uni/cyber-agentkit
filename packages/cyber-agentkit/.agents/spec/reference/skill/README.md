---
spec-type: behavioral
---

# reference/skill — a skill loads the references it names, and carries on when one is not answered

Part of [reference](../README.md). Its What, key terms, actors, adapters, names, and output contract apply here;
IDs are shared across the parent and its children.

## Use Cases

### UC4 — Act on what a load reports (A1.2, A7.1, A7.2)

- **Trigger:** a name comes back with a status other than `found` or with a warning, or the command does not run.
- **Entry points:** Skill: the `reference` skill's Load mode. This use case is behavior of the skill's instructions.
- **Outcome:** the consumer takes the step the reason calls for and carries on; the agent user is told what the agent
  runs without, and what to revise.
- **Extensions:**
  - UC4.1 `missing`: the consumer carries on without it, and the user is told the name was not loaded. No substitute
    is searched for, and the skill does not read its own default instead: the command already included it. When a
    `remove` turned the name off, nothing is said; the trace explains it.
  - UC4.2 `ambiguous`: with a user present, the options are listed (each `<plugin>/<name>`, and the skill's default
    if it has one), the user picks one even when only one is left, and says whether the pick is for the repository
    (the default) or only for themselves. The pick is written with `reference customize <name> --extends <pick>`
    (UC9), and the name loads from it. With no user, the consumer carries on without it, and the user is told to
    settle it.
  - UC4.3 `invalid`: the consumer carries on without it, and the user is told the skill's load line names something
    that is not a reference name, a fault to report to the skill's author.
  - UC4.4 The command does not run: each name is read from the skill's own `references/<name>.default.md`, and the
    user is told that no customization applied, managed contributions and project sections included, and why the
    command did not run. A name with no default contribution is not loaded.
  - UC4.5 Every name is `found` with no warning: nothing is said.
  - UC4.6 A generated document is stale (UC1.14): the reference is used as loaded, and the user is told which
    plugins changed and that Customize mode revises it from its recorded request (UC20).
  - UC4.7 Any other warning: the reference is used as loaded, and the user is told the warning, one line each.

### UC12 — Wire a skill to load references (A6.1)

- **Trigger:** a skill author wants a skill to load references by name, with defaults others can customize.
- **Entry points:** Skill: the `reference` skill's Wire a skill mode, which gives the load line: "Load `<name>` and
  `<name>` with the `reference` skill of `cyber-agentkit`." Code: none directly; Load runs
  `load <name>... --default <the caller's folder>` (UC1), adding `--root` only when the working folder is not in the
  repository (K18).
- **Inputs:** the names; the harness the skill is written for, if only one; the defaults the author ships.
- **Outcome:** the skill carries one load line naming the references and the `reference` skill with its package, in
  words every harness reads. The author ships each default as `<skill>/references/<name>.default.md`. When the skill
  runs, Load resolves the names with the skill's folder as the `default` tier (UC1), acts on what the load reports
  (UC4), and follows the result in order of precedence (UC17); a customizer finds the defaults with `list` (UC3) and
  customizes them (UC18), and a plugin author implements or extends them (UC15, UC7).
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
  - UC12.6 The skill asks for the routing table: the load line says so, and Load passes the routing option to `load`,
    with `--in` naming the paths the task already names. Each project section is then listed as a route (K25). Nothing
    stores the choice; it is made at each load.

### UC17 — Follow the reference in order of precedence (A1.3)

- **Trigger:** an agent works from a resolved reference while it also holds instructions the command cannot load:
  company or team instructions a harness delivers (N13), or a single feature's own document that the consuming skill
  points it at (N7).
- **Entry points:** Skill: the `reference` skill's Load mode, which states the order along with the loaded references.
  This use case is behavior of the skill's instructions.
- **Inputs:** the resolved reference; the other instructions in the agent's context; the folder the work is in.
- **Outcome:** where instructions conflict, the agent follows them highest first: company and team instructions, then
  the feature's own document, then the resolved reference. Within the resolved reference, the project section for the
  folder the work is in ranks over the main document. A managed contribution needs no ranking: load already applied it
  over both (K27). The agent follows a project section whenever its work is in that folder.
- **Extensions:**
  - UC17.1 Nothing else applies: the resolved reference is followed as loaded.
  - UC17.2 The work moves into a folder with a project section partway through the task: the agent follows that
    section from then on, without loading again, and stops when the work leaves the folder.
  - UC17.3 Nested folders both hold a section, and the work is in the inner one: the agent follows both, and the inner
    one wins where they conflict.
  - UC17.4 With the routing table, the work enters a routed folder: the agent loads the name again with
    `--in <path>` and follows the section that comes back.
  - UC17.5 The command did not run (UC4.4): the default is followed in the same order.

## Criteria

Edge IDs are in [graph.md](./graph.md).

Every criterion here, and R85 in [write](../write/README.md), is behavior of the skill's text, which no deterministic
unit test reaches (C5). For now each is checked by a fixture run confirming the skill's text holds the instruction, not
by what an agent does.

**Fallback (UC4)**

- R21 (UC4, E23): The skill reads its own `references/<name>.default.md` only when the command did not run, never for
  a name the command reported, whatever its status.
- R59 (UC4, E49): With a user present, an `ambiguous` name lists every option, the skill's default included, even
  when one is left; the pick is written with `reference customize <name> --extends <pick>` at the scope the user
  chose, `repo` unless they say otherwise, and the name loads from it. With no user, it is not loaded, and the user is
  told to settle it.
- R22 (UC4, E24): Every name read from a fallback, and every name not loaded, is reported to the user with the
  reason, except a name a `remove` turned off; nothing is reported when every name came from the command.
- R23 (UC4, E25): An `invalid` name's path is never read.
- R88 (UC4, E61): Every warning a load returns is passed on to the user, one line each. A `reference-stale` warning
  also names the plugins that changed and says Customize mode revises the document from its recorded request.

**Load (UC12, UC17)**

- R89 (UC12, E62): The load line names the references and "the `reference` skill of `cyber-agentkit`", or, for an
  interface, "the implementations of the `<id>` interface". Load runs `load <name>... --default <the caller's
  folder>`, adding `--root` only when the working folder is not in the repository, and, when the load line asks for
  the routing table, the routing option with `--in` naming the paths the task already names.
- R90 (UC17, E63): With the loaded references, Load states the order to follow where instructions conflict: company and
  team instructions, then a single feature's own document, then the resolved reference; within it, the project section
  for the folder the work is in over the main document, and an inner folder's over an outer one's.
- R91 (UC17, E64): Load tells the agent to follow a project section whenever its work is in that folder, from the
  moment the work moves there; and, with routes, to load the name again with `--in <path>` when the work enters a
  routed folder.
