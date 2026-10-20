---
spec-type: behavioral
---

# reference — an agent loads exactly the instructions a skill names, composed from tiers that hold them

## What

A skill often needs instructions it does not carry itself: how this repository tracks issues, or which house style to
follow. Today it has three ways to get them, and each costs context or control. It can inline them, so every run loads
all of them and no one can change them without forking the plugin. It can ship them as skills only the agent invokes, so
each one's name and description load into every session, needed or not. Or it can search for them by frontmatter or by
grepping text, which loads documents the task does not need and leaves each skill to decide for itself which
contribution to follow.

This capability lets a skill ask for instructions by name, such as `project-tracker.capabilities.github`, and get
exactly that. The skill depends on the name, not on a file. Whoever places a contribution for the name decides what it
says: a plugin ships one, and a repository, a user, or a machine-wide policy can each place their own. Each contribution
declares what it builds on and how it applies over it: it replaces it, combines with it, patches some of its sections,
or removes it. One rule, the same for every skill, puts the contributions in order. A team can then customize a
plugin's instructions without forking it, and two skills asking for one name read the same thing, unless each answers
from its own default. Contributions come from authors who never coordinate, so a fault in one never stops the rest:
each name is answered with what can be found, and every fault is reported as a warning.

**Non-goals:**

- N1 Installing, enabling, or removing plugins. That is [dependencies](../dependencies/README.md).
- N2 Finding references by meaning. Results are returned in a deterministic order.
- N3 Reading anything but Markdown by name, or any path. A name is never a path.

**Key terms** (shared terms: [glossary](../glossary.md)):

- K1 **tier**: where a contribution lives: `managed`, `project`, `user`, `plugin`, `default`. Their order is K17. A
  write goes to `project`, which reaches everyone working in the repository, or `user`, which reaches only you, in every
  repository.
- K2 **layer**: one folder read for contributions. A tier reads one or more: the plugin tier one per plugin, the project
  tier one per folder from the root (K18) up to the repository root, the managed tier one per detected harness, beside
  that harness's own managed settings.
- K10 **contribution**: a reference file for a name, in one layer. A name may have several.
- K13 **default contribution**: a skill's own contribution of a name, `references/<name>.default.md` in the skill's
  folder. It forms the `default` tier when that skill loads the name. A name ending `.default` is reserved for it.
- K4 **qualified name**: `<plugin>/<name>`. It makes that plugin, with what it builds on, the stack for one call.
- K5 **merge operation**: how a contribution applies over what is below it. `replace` puts mine in place of everything
  below. `patch` (the default) keeps what is below and puts my text in place of the text it matches by heading path.
  `combine` keeps what is below and adds my text after the text it matches. `remove` drops what is below. The same
  four apply to a whole contribution (frontmatter `merge`), to a step, and to one section (a `<!-- merge: ... -->`
  marker). A heading path is read from each document's own top heading level, so `# Review` and `## Review` match.
- K6 **status of a name**: `found`, `missing`, `ambiguous`, or `invalid` (not built).
- K7 **outcome of a layer** (in the trace): `used`, `shadowed`, `ambiguous`, `missing`, or `not read` or `not used`
  with a reason.
- K8 **interface**: a contract declared in a `<id>.interface` reference. An **implementation** declares
  `implements: <id>@<version>`.
- K9 **consumer**: a plugin or skill that loads references through this capability, by skill, command, or library.
- K14 **stack**: the plugin and default contributions under the managed, project, and user tiers, bottom first.
  Frontmatter `extends` lists it.
- K15 **step**: one entry of `extends`: a plugin or `default`, optionally with the keys (`merge`, `extends`) to use for
  that contribution in place of its own.
- K16 **selection**: a contribution with `extends` and no body. It picks the stack and changes nothing else.
- K17 **above and below**: the order contributions apply in, bottom first: the stack (its plugins and `default` in
  `extends` order, the first listed lowest; with no written `extends`, `default` lowest), then `user`, then `project`
  from the repository root down to the root (K18), then `managed` (each detected harness's managed folder). Each
  contribution applies over the result of everything below it, so a higher one wins where they conflict. Lower and
  higher mean below and above.
- K18 **root**: the folder the project tier starts from (default the current directory). The project tier reads it and
  each folder above it up to the repository root, and a project write goes to its `.agents/references/`.

## Use Cases

**Actors and goals.** A4 and A7 are affected by the outcome without invoking it.

| ID | Actor | Goal |
| --- | --- | --- |
| A1.1 | A1 consumer (a skill, or the agent running it) | Load exactly the instructions it names, composed as their contributions declare |
| A1.2 | A1 | When a name can't be answered, know the reason, since each needs a different next step, and carry on |
| A2.1 | A2 inspector (anyone) | Know what an agent reads for a name, and why |
| A3.1 | A3 finder (anyone) | Find the names that exist, to load one or customize one |
| A4.1 | A4 admin | Have a managed contribution reach every repository on the machine, above project and user ones |
| A5.1 | A5 customizer (a team for its repository, or a user for themselves) | Change what a skill reads without forking the plugin: replace, patch, combine with, or remove a plugin's contribution, and choose which plugins it builds on and in what order |
| A5.2 | A5 | Remove a customization, and learn what answers afterwards |
| A6.1 | A6 plugin author | Ship skills that load references by name, with defaults others can customize |
| A6.2 | A6 | Build on another plugin's contribution, or on the loading skill's default, as its author wrote it |
| A6.3 | A6 | Publish an interface, and know an implementation meets it |
| A7.1 | A7 agent user | Be told when the agent ran without instructions it asked for, or without the customizations placed for it |

### UC1 — Resolve names (A1.1)

- **Trigger:** a consumer's instructions name one or more references to load.
- **Entry points:** Skill: the `reference` skill's Load mode, which runs the command. Code: `reference show <name>...`;
  `loadReference(name, options)`.
- **Inputs:** one or more names; the root (default the current directory); the calling skill's folder, for the
  `default` tier (not built); the detected harness.
- **Outcome:** for each name, in the order asked, the document composed from its contributions as their `extends` and
  `merge` declare, with status `found`. The document is the composed bodies; no contribution's frontmatter is part of
  it.
- **Extensions:** each name resolves on its own; a fault in one never stops the others.
  - UC1.1 No contribution answers: status `missing`, with the reason: no tier holds the name (`default` included);
    the plugin a qualified name asks for is not installed; or (not built) a `merge: remove` contribution leaves nothing
    and no contribution above it has a body, naming that contribution.
  - UC1.2 Its contributions cannot be put in one order: status `ambiguous`. The error names the contributions in
    conflict, the cause (no written `extends` orders the plugins, a cycle in the plugins' own `extends`, or an
    `extends` listing one plugin at two separate places), and the options.
  - UC1.3 It is not a name (it ends `.md` or `.default`, is a path, or has a bad
    character): status `invalid`, and nothing is read
    for it. (Not built: today the whole call is rejected, and the library throws.)
  - UC1.5 A contribution has malformed frontmatter, an unknown `merge`, or a bad `extends`: it still answers, with a
    warning and the documented default. A `merge: remove` contribution with a body: the body is ignored, with a
    warning, and the remove still applies (not built).
  - UC1.6 Two files in one folder answer one name (`<name>.md` and `<name>/README.md`): the first answers; the other is
    ignored with a warning.
  - UC1.7 No name given: error.
  - UC1.8 The document fails its interface check: still answered, with a warning.
  - UC1.9 (not built) The skill folder does not exist: a warning, and the name resolves without the `default` tier.
  - UC1.10 (not built) A plugin's contribution answers over the default contribution, and no selection names it: still
    answered, with a warning naming the plugin and `reference select <name>` (UC9). The warning stops once a written
    `extends`, whether a selection (UC9) or a customization, names the plugin or the default.
  - UC1.12 (not built) A step in `extends` cannot be used. A step not installed, or not holding the name, is skipped
    with whatever only it brings in, with a warning. When every step is missing, the `extends` counts as not written,
    with a warning, and the stack falls to the next written `extends`. A plugin listing itself has that entry ignored,
    with a warning. A lower contribution's `extends` that builds a different stack is not used, with a warning. A
    `default` step with nothing there is skipped with no warning; the trace shows it.
  - UC1.13 A section matches no section below: with an explicit `<!-- merge: ... -->` marker, a warning, and its text
    goes at the end (nothing, for `remove`); unmarked, it goes at the end with no warning. A document repeating a
    heading: the first is matched, with a warning. (Not built: an explicit `replace` marker that matches nothing does
    not warn yet.)

### UC2 — Explain a resolution (A2.1)

- **Trigger:** someone asks what an agent reads for a name and why, or where a customization of it would go.
- **Entry points:** Skill: the `reference` skill's Inspect mode. Code: `reference show <name> --trace`;
  `reference where <name> [--default <skill folder>]`; `resolveReference`, `whereReference`.
- **Inputs:** a name; the root (default the current directory); the calling skill's folder, for the `default` tier;
  the detected harness.
- **Outcome:** the trace gives the name's status; the stack and what built it (the contribution whose `extends` was
  used, the plugins' own `extends`, or none); for each section of the composed document, by heading path, the
  contributions that supplied its text and the operation each applied; and every layer checked, in K17 order highest
  first, with its path, the file that matched, its frontmatter as written, the operation it applied and whether that
  came from the contribution or from a step, and its outcome (K7). The composed document itself is unchanged. `where`
  gives the same layers with their outcomes; the project and user `<name>.md` files a customization or a selection is
  written to, each with who it reaches and the default operation, `patch`; and the heading paths of the document below
  each, which a section operation can target.
- **Extensions:**
  - UC2.1 A layer or step cannot be read (policy held in MDM, a plugin with no install folder, a step not installed, a
    `default` step with nothing there): it appears with the reason, such as `not read (not installed)` or
    `not read (no default)`.
  - UC2.2 A `replace` or `remove` above drops a contribution: `shadowed by <contribution> (replace|remove)`. A section a
    `remove` dropped appears with the contribution that dropped it.
  - UC2.3 A plugin left out of the stack: `not used (not in extends)`. A plugin a step's own `extends` left out:
    `not used (<step>'s extends replaced by <contribution>)`.
  - UC2.4 An `extends` that did not build the stack: `not used (<contribution>'s extends builds the stack)`, or
    `not used (qualified name)`. The contribution's body still applies.
  - UC2.5 `where` on an ambiguous name: it lists each `<plugin>/<name>` and the default as options, and the project and
    user files a selection goes to. It is not an error.
  - UC2.6 `where` on a plugin's contribution or a default contribution: reported read-only, never offered as a place to
    write.

### UC3 — List and search (A3.1)

- **Trigger:** someone wants the names that exist, to load one or customize one.
- **Entry points:** Skill: the `reference` skill's Find mode. Code: `reference list [pattern]`;
  `reference search <query>`; `listReferences`, `searchReferences`.
- **Inputs:** a pattern or a query; the root (default the current directory); the detected harness.
- **Outcome:** `list` gives one row per name per layer holding it, and one per installed skill holding a default
  contribution of it (a harness's machine-wide admin skills included), with tier, plugin or skill, path, description,
  and the outcome (K7) that contribution gets; a default's is the one it gets when its skill loads the name, and its row
  notes that the `default` step reaches it then; a default has no qualified name. A selection's row is marked as one. A
  pattern keeps exactly the names it matches. `search` resolves each name as `show` would, and each default as its skill
  loads it, then gives matches best first.
- **Extensions:**
  - UC3.1 Nothing matches: the output says zero explicitly. It is not an error.
  - UC3.2 `search` with an empty query: error.
  - UC3.3 A name that no written `extends` orders: `list` marks it ambiguous with the options (each `<plugin>/<name>`,
    and each skill's default); `search` returns it once per plugin.
  - UC3.4 A name a `remove` turned off: `list` shows the `remove` row and each row below it as
    `shadowed by <contribution> (remove)`; `search` leaves the name out.
  - UC3.5 The detected harness's skill folders are not verified (Q12): `list` and `search` show no defaults, with a
    warning saying why.

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

### UC5 — Customize a plugin's instructions (A5.1)

- **Trigger:** a customizer wants to change what a skill reads for a name: replace, patch, combine with, or remove
  what is below.
- **Entry points:** Skill: the `reference` skill's Create and Update modes; Update edits the file, then checks the
  trace. Code: `reference create <name> [--scope user] [--merge <operation>] [--template <file> | --implements <id>]
  [--dry-run]`.
- **Inputs:** a bare name; the tier written to (`project` by default, or `user`); the operation (default `patch`); a
  template or an interface; the root.
- **Outcome:** `create` writes `<name>.md` in that tier's folder with `merge: <operation>`, and reports the path and
  the resulting trace, in which the new file applies over everything below it (K17), with a hint that `show <name>`
  gives the composed document. The skill shows the user where each section came from and offers the full document.
- **Extensions:**
  - UC5.1 The file exists with a body: error, and nothing is written. `create` never overwrites; Update edits it.
  - UC5.2 The file holds only a selection: `create` adds the body and `merge`, and keeps its `extends`.
  - UC5.3 A qualified name: error naming the bare name to use.
  - UC5.4 A `replace` or `remove` above would hide the new file: error naming that contribution.
  - UC5.5 `--implements <id>`: the interface's sections are written with `merge: replace`, and a warning says the
    file replaces what is below.
  - UC5.6 `--merge remove`: no body is written. With `--template`: error.
  - UC5.7 Both `--template` and `--implements`, an unreadable template, a template whose frontmatter is not a mapping,
    or an unknown interface: error.
  - UC5.8 A template whose top level is a single heading holding all the others (a title, so `patch` would add the
    whole document instead of patching its sections), or with no `description` (`list` and `search` show it blank):
    warning.
  - UC5.9 `--dry-run`: the path and the content are printed, and nothing is written.

### UC6 — Publish and check interfaces (A6.3)

- **Trigger:** a plugin author publishes an interface, or wants to know a contribution meets the interface it
  declares; or a consumer wants the implementations it can pin.
- **Entry points:** Skill: the `reference` skill's Create mode (an interface document), Inspect mode (check), and Find
  mode (implementations). Code: `reference check [name...]`; `reference implementations <id> [--accept <versions>]`;
  `checkReferences`, `referenceImplementations`.
- **Inputs:** an interface document, `<id>.interface.md` in the plugin's `references/`; names, or none; an interface
  id and the versions it accepts; the root; the detected harness.
- **Outcome:** an interface document is valid when its `interface` block meets the format (Interfaces criteria).
  `check` validates each document, composed as UC1 composes it, against the interface it declares, or an interface
  document against its own shape; any failure fails the result. `implementations` lists the ones that pass, with pin,
  tier, version, description, and unsupported sections, and the ones left out, each with its reason.
- **Extensions:**
  - UC6.1 A named reference is `missing`, `ambiguous`, or `invalid`: reported with that status, as a failure.
  - UC6.2 A reference declares no `implements` and is not an interface: failure.
  - UC6.3 `implements` is malformed, lists more than one interface, or names an interface that is missing, ambiguous,
    or malformed: failure.
  - UC6.4 No names: every interface document and every implementation is checked. A name several plugins hold is
    also checked as each `<plugin>/<name>`, so each author sees their own result. Each skill's default is checked as
    its skill loads it, subject to UC3.5.
  - UC6.5 `implementations` of an unknown interface: error.
  - UC6.6 A skill's default is never listed by `implementations`: it has no qualified name to pin.

### UC7 — Build on other contributions (A5.1, A6.2)

- **Trigger:** an author (a plugin author, or a customizer in the project or user folder) wants a contribution to
  build on other plugins' contributions, or on the loading skill's default, in a chosen order and way.
- **Entry points:** Skill: the `reference` skill's Create and Update modes. Code: the contribution's frontmatter
  `extends` and `merge`.
- **Inputs:** `extends`, steps bottom first, each a `<plugin>` or `default`, optionally with its own `merge` and
  `extends` (`- house-style: {merge: combine, extends: []}`; `house-style: patch` is short for `{merge: patch}`); the
  contribution's own `merge`.
- **Outcome:** each step brings its own `extends` beneath it, recursively; a plugin both listed and brought in appears
  once, at its listed place. Each step applies with its own operation: the step's key, else the plugin's own `merge`,
  else `patch`. The contribution's body applies on top with its own `merge`. The highest written `extends` builds the
  stack, and managed, project, and user contributions apply over it in K17 order. Anything left out of that `extends`,
  a plugin or `default`, is `not used`. So a house-style plugin changes what a generic skill reads without forking it.
- **Extensions:**
  - UC7.1 A step cannot be used, a lower `extends` differs, or a plugin lists itself: as UC1.12 says.
  - UC7.2 The steps cannot be put in one order: as UC1.2 says. Under a written list, bringing in stops at a plugin
    already in the stack, silently; an adjacent repeat collapses (`[a, a, b]` is `[a, b]`); two steps bringing one
    plugin put it once, beneath the first.
  - UC7.3 A malformed `extends`: as UC1.5 says; it counts as not written.
  - UC7.4 A qualified name builds that plugin's own stack; a written `extends` is not used (UC2.4).
  - UC7.5 `extends` or `merge` on an interface document: ignored with a warning. An interface is never composed.

### UC8 — Consumers read a stable output (A1.1)

- **Trigger:** a consumer's code (a skill's script, or a program using the library) needs fields from a result, not
  prose.
- **Entry points:** Code: `--format json` on `show`, `where`, `list`, `search`, `check`, `implementations`, `create`,
  `select`, and `delete`; the library functions return the same records.
- **Inputs:** a command and its arguments; the output format.
- **Outcome:** each result carries the same fields in every adapter, so a consumer reads status, metadata, and codes
  instead of prose (repobuddy reads `metadata.contract` from `show` and `match` from `search`). Removing or renaming a
  field is a breaking change. Each failure and warning carries a stable code; the human wording is not a contract.
  `metadata` is the composed frontmatter, key by key with the higher contribution winning, without `merge` and
  `extends`: those say how one contribution applies, and the trace carries each as written (UC2).
- **Extensions:**
  - UC8.1 A name not `found`: its entry carries the status and code, and the other names still resolve.
  - UC8.2 A warning in structured output goes in the entry's `warnings`, so a consumer reads every fault from one
    place.

### UC9 — Select what a name builds on (A5.1)

- **Trigger:** a name is ambiguous, or a customizer wants to choose which plugins, or the default, a name builds on
  and in what order.
- **Entry points:** Skill: Load mode asks (UC4.2); otherwise the skill runs the command. Code:
  `reference select <name> <option>... [--scope user] [--clear]`.
- **Inputs:** a bare name; one or more options, bottom first, each a `<plugin>` or `default`; the tier written to
  (`project` by default, or `user`); the root.
- **Outcome:** `<name>.md` in that tier's folder holds an `extends` listing the options. An existing file keeps its
  body and other keys; only its `extends` changes. The name then resolves through that stack (K14), with managed,
  project, and user contributions applied over it in K17 order. A selection is a contribution, so `list` marks it and
  `--trace` explains it.
- **Extensions:**
  - UC9.1 A selected plugin is no longer installed: it is skipped with a warning (UC1.12). When every option is gone,
    the selection counts as not written and the stack falls through; a name left ambiguous is asked again (UC4.2).
  - UC9.2 An option that is neither `default` nor a plugin holding the name: error, and nothing is written.
  - UC9.3 The project and user folders select differently: the project's builds the stack; the user's is `not used`,
    with a warning (UC1.12).
  - UC9.4 A qualified name: error naming the bare name to use.
  - UC9.5 `--clear`: `extends` is removed from the file, and a file left with nothing in it is deleted. With no
    selection in that tier: error stating what answers the name now.

### UC10 — Confirm a managed contribution is in effect (A4.1)

- **Trigger:** an admin has placed `<name>.md` in a harness's managed folder, by hand or through device management,
  and wants to confirm it is in effect.
- **Entry points:** Skill: the `reference` skill's Inspect mode. Code: `reference show <name> --trace`.
- **Inputs:** a name; the root of a repository to check from; the detected harness.
- **Outcome:** the trace shows the managed contribution with its outcome, above project and user contributions, and
  what it changed in each section (UC2). Placing the file is outside this capability: it is written like any other
  contribution, in the managed folder that harness detection finds for each harness.
- **Extensions:**
  - UC10.1 The harness keeps its managed content where it cannot be read locally (an MDM domain, or a server): the
    trace shows that layer not read, with the reason.
  - UC10.2 The file sits in the managed folder of a harness that is not detected: that folder is not read, and the
    trace names the detected harnesses, so the admin sees why.

### UC11 — Remove a customization (A5.2)

- **Trigger:** a customizer wants a project or user contribution gone.
- **Entry points:** Skill: the `reference` skill's Delete mode. Code: `reference delete <name> [--scope user]
  [--dry-run]`.
- **Inputs:** a bare name; the tier deleted from (`project` by default, or `user`); the root.
- **Outcome:** `delete` removes only that file, and reports what answers the name afterwards: its status, and the stack
  with what built it. The status can be `ambiguous`, with the options, when the file held the selection that ordered
  the plugins.
- **Extensions:**
  - UC11.1 No contribution in that tier: error stating what answers the name now. A plugin's or managed contribution
    is never deleted.
  - UC11.2 A qualified name: error naming the bare name to use.
  - UC11.3 `--dry-run`: the path and the answer afterwards are printed, and nothing is deleted.
  - UC11.4 The file also holds a selection (`extends`): both go, and the report says the selection went too, naming
    `reference select` to restore it.

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

**Surface trace.** `show`, `--trace`, `--default` (UC1, UC2, UC10, UC12); `--root` (all); `where`, `--default`
(UC2); `list`, pattern (UC3); `search` (UC3); `create` with `--merge`, `--template`, `--implements`, `--scope`,
`--dry-run` (UC5); `select` with `--scope`, `--clear` (UC9); `delete` with `--scope`, `--dry-run` (UC11); `check`
(UC6); `implementations`, `--accept` (UC6); `--format` (UC8). Frontmatter keys `merge`, `extends`, `implements`,
`interface`, `description`, `tags` serve UC1, UC5, UC6, UC7, UC9; the section marker `<!-- merge: ... -->` serves
UC1 and UC7. File names `<name>.md` and `<name>.default.md` serve UC5, UC9, UC11 and UC3, UC12. Informational, no
contract: the trace's keys beyond those the Adapters group names.

## Criteria

Edge IDs are in [graph.md](./graph.md). An unmarked criterion is how 0.7.1 behaves. "(not built)" marks a decided
criterion the code does not meet yet; each has an issue or an answer recorded in Open questions.

**Adapters**

- R43 (UC1, UC6, UC8, E12): The command exits 0 when it did what was asked: every name `found`, or `where` on an
  ambiguous name. It exits 1 when a name is not `found`, a check fails, or a write is refused, and 2 on a usage error
  (no name, an unknown flag).
- R44 (UC1): In text, one name prints its document; several print each as `<reference name="...">...</reference>` in
  the order asked; a name not `found` prints `<reference name="..." status="..." />` in its place.
- R45 (UC1, UC8, E13): In text, a failure is an `error: <code>: <message>` line and a warning a
  `warning: <code>: <message>` line, both on stderr. Neither changes stdout, and a warning never changes the exit code.
- R46 (UC2): `--trace` in text writes to stderr a summary line (status, stack, what built it), then each section's
  heading path with its contributions and operations, then each layer; stdout stays the plain document.
- R47 (UC8): `--format json` writes one JSON document to stdout. Each entry carries its status, code, `metadata`, and
  `warnings`; a warning goes only in `warnings`, not on stderr.
- R48 (UC1, UC8): Each library function returns the same records as the JSON output. A name not `found`, `invalid`
  included, is a status in its record, never a thrown error. Warnings go in the record's `warnings` and are never
  printed.

**Names**

- R1 (UC1, E1): A name is `invalid` when it ends `.md`, or `.default` (that suffix names a default's file, K13), has a
  path separator other than one `<plugin>/` prefix, or a character other than letters, digits, `-` and `.`. Nothing is
  read for it, and the other names still resolve.
- R51 (UC1, E1): A `<name>.default.md` in a tier folder is ignored, with a warning that a default goes in a skill's
  `references/` folder.
- R2 (UC1, UC7, E2): `<plugin>/<name>` builds the stack from that plugin's contribution and what its own `extends`
  brings in; managed, project, and user contributions still apply over it. A written `extends` is not used, and a
  plugin extending the named one is left out.

**Composition**

- R3 (UC1, E3): Contributions apply bottom first in K17 order, each over the result of everything below it with its
  own operation. With no `merge` written anywhere, every contribution patches. Within the project tier, the nearer
  folder is higher.
- R6 (UC1, E6): `patch` keeps what is below and puts each section's text in place of the text it matches by heading
  path, unless that text is empty. Unmarked subsections replace. A section that matches nothing is added at the end. A
  heading path is read from each document's own top heading level.
- R5 (UC1, E5): `combine` keeps what is below and adds each section's text after the text it matches, lower first.
  Unmarked subsections combine. When combined text was joined, the output says once that where they conflict, the
  later text wins.
- R4 (UC1, E4): `replace` drops everything below; each contribution below is `shadowed by <contribution> (replace)`.
- R49 (UC1, E45): `remove` drops everything below, and its body is ignored with a warning. When no contribution above
  it has a body, the name is `missing`, naming that contribution.
- R42 (UC1, E44): A `<!-- merge: <operation> -->` marker under a heading applies that operation to that section alone;
  a section with no marker takes its document's operation.
- R50 (UC1, E46): A contribution with no body changes nothing, except with `remove`.
- R7 (UC1, E7): An unknown `merge` value or marker is read as `patch`, with a warning. An explicit marker that matches
  nothing below warns, and its text goes at the end (nothing, for `remove`); an unmarked section that matches nothing
  does not warn. A document repeating a heading warns, and the first is matched.

**Stack**

- R8 (UC1, UC7, E8–E10): The highest written `extends` builds the stack: its steps apply bottom first, each bringing
  its own `extends` beneath it, recursively; a plugin both listed and brought in appears once, at its listed place.
  With no written `extends` in the managed, project, or user tiers, the plugins' own `extends` order them. A plugin
  left unordered makes the name `ambiguous`, with each `<plugin>/<name>` and the default as options.
- R52 (UC7, E8): A step applies with its own `merge` key, else the plugin's own `merge`, else `patch`. A step's own
  `extends` key replaces the plugin's. `<plugin>: <operation>` is short for `{merge: <operation>}`.
- R53 (UC1, UC7, E9): A plugin or `default` left out of the highest written `extends` is `not used (not in extends)`
  and does not make the name `ambiguous`. A lower contribution's `extends` that builds a different stack is
  `not used`, with a warning.
- R54 (UC1, UC7, E10): A cycle only plugins wrote makes the name `ambiguous`, cause `cycle`. Under a written list,
  bringing in stops at a plugin already in the stack, silently. An adjacent repeat collapses. A plugin listed at two
  separate places makes the name `ambiguous`. Two steps bringing one plugin put it once, beneath the first. A plugin
  listing itself has that entry ignored, with a warning.
- R55 (UC1, UC9, E47): A step not installed, or not holding the name, is skipped with what only it brings in, with a
  warning. When every step is missing, the `extends` counts as not written, with a warning, and the stack falls
  through. A `default` step with nothing there is skipped with no warning; the trace shows `not read (no default)`.
- R56 (UC1, UC4, E42): A plugin's contribution answering over the loading skill's default, when no written `extends`
  names the plugin or the default, still answers, with a warning naming the plugin and `reference select <name>`.

**Reporting**

- R9 (UC2, E11): The trace reports, for every layer checked, tier, plugin or skill, path, the file matched, its
  frontmatter as written, the operation applied and where it came from, and the outcome: `used`;
  `shadowed by <contribution> (replace|remove)`; `not used (not in extends)`,
  `not used (<step>'s extends replaced by <contribution>)`, `not used (<contribution>'s extends builds the stack)`, or
  `not used (qualified name)`; `not read (<reason>)`; `ambiguous`; `missing`. It names the detected harnesses.
- R57 (UC2, E11): `where` gives the layers with their outcomes, the project and user `<name>.md` with who each reaches
  and the default operation, `patch`, and the heading paths below each. On an ambiguous name it lists the options and
  the files a selection goes to.

**Layers**

- R12 (UC1, E14): The project tier reads `.agents/references/` in the root and each folder above it up to the
  repository root (a `.git`, `pnpm-workspace.yaml`, or a `package.json` with `workspaces`); with no repository root
  above, the root alone. The user tier reads `~/.agents/references/`. The managed tier reads `references/` in each
  detected harness's managed folder; the library keeps no managed folder of its own.
- R13 (UC1, E15): The plugin tier holds, for the detected harness, each enabled plugin's `references/`, and the declared
  `dependencies` and `devDependencies` of the nearest `package.json` that ship one; never a transitive package. The
  plugin running the command is read once.
- R14 (UC1, E16): An interface document is never composed: `extends` and `merge` on it are ignored with a warning, a
  higher contribution of it is ignored with a warning, and the lowest answers; two plugins holding it make it
  `ambiguous`.
- R15 (UC2, E17): A layer skipped for a reason appears in the trace with that reason and adds no contribution.
- R20 (UC1, UC2, E22): No `governances/` folder is read, in any tier or skill folder.
- R41 (UC1, UC2, UC4, E43): `--default <skill folder>` reads `<skill folder>/references/<name>.default.md` as the
  `default` tier; the old `references/<name>.md` copy is not read as a default. `where` takes `--default`.

**Finding**

- R16 (UC3, E18): `list` has one row per name per layer holding it, and one per installed skill holding a default of
  it, naming the skill and noting that the `default` step reaches it; a selection's row is marked as one.
  `list '<pattern>'` keeps exactly the names matching, where `*` is any run of characters and everything else is
  literal and case-sensitive.
- R17 (UC3, E19): `search` ranks match kinds in the order `name`, `prefix`, `close name`, `description`, `heading`,
  `body`, then by name. A name resolves as `show` would, and each default as its skill loads it, before it is
  searched; a name a `remove` turned off is left out.
- R18 (UC3, E20): `list` and `search` with no match print an explicit zero; it is not an error.
- R58 (UC3, E48): Defaults are found in the skill folders the detected harness reads: its project and user skill
  folders, its machine-wide admin skill folders, and each enabled plugin's skills. On a harness whose skill folders are
  not verified, no defaults are listed, with a warning.

**Fallback (UC4)**

- R21 (UC4, E23): The skill reads its own `references/<name>.default.md` only when the command did not run, never for
  a name the command reported, whatever its status.
- R59 (UC4, E49): With a user present, an `ambiguous` name lists every option, the skill's default included, even
  when one is left; the pick is written with `reference select`, and the name loads from it. With no user, it is not
  loaded, and the user is told to settle it.
- R22 (UC4, E24): Every name read from a fallback, and every name not loaded, is reported to the user with the
  reason, except a name a `remove` turned off; nothing is reported when every name came from the command.
- R23 (UC4, E25): An `invalid` name's path is never read.

**Writing (UC5, UC9, UC11)**

- R24 (UC5, UC9, E26): `create` and `select` write only `<name>.md`, in the root's `.agents/references/` (`project`,
  the default) or in `~/.agents/references/` (`user`, with `--scope user`); never in the managed tier, a plugin, or a
  skill folder.
- R25 (UC5, UC9, UC11, E27): `create`, `select`, and `delete` reject a qualified name and say which bare name to use.
- R60 (UC5, E26): `create` never overwrites a file with a body. On a file holding only a selection, it adds the body
  and `merge` and keeps the `extends`.
- R26 (UC5, E28): `create` refuses when a `replace` or `remove` above would hide the new file, and names that
  contribution.
- R27 (UC5, E29): `create` writes `merge` from `--merge`, else the template's `merge`, else `patch`. `--implements`
  writes `merge: replace` and warns that the file replaces what is below. `--merge remove` writes no body, and fails
  with `--template`.
- R28 (UC5, E30): `create --implements <id>` writes the interface's sections as `##` headings in order and
  `implements: <id>@<version>`, each section stubbed `**Unsupported.**`; it fails for an unknown interface and with
  `--template`.
- R61 (UC9, E50): `select <name> <option>...` writes `extends` listing the options bottom first, leaving the body and
  other keys unchanged. An option that is neither `default` nor a plugin holding the name fails, and nothing is
  written.
- R62 (UC9, E51): `select --clear` removes `extends` and deletes a file left with nothing in it; with no selection in
  that tier, it fails stating what answers the name now.
- R30 (UC11, E32): `delete` removes only the file in the chosen tier, never a plugin's, managed, or skill default
  contribution, and reports the status and stack afterwards; when the file held a selection, the report says so and
  names `reference select`. With no file in that tier, it fails stating what answers the name now.
- R29 (UC5, UC11, E31): `--dry-run` prints the path and the exact content (`create`) or the path and the answer
  afterwards (`delete`), and changes no file.
- R31 (UC5, E33): After a `create` write, the trace shows the new file `used`, and the report points to `show <name>`
  for the composed document.
- R32 (UC5, E34): `create` warns for a template whose top level is a single heading holding the others (a title), and
  for a missing `description`.

**Interfaces (UC6)**

- R63 (UC6, E52): An interface document is the reference `<id>.interface`; its body is prose for implementers. Its
  frontmatter `interface` block holds `cardinality` (`one`: the implementation is named `<id>`; `many`: each is named
  `<id>.<key>`), `version` (a positive integer), `versions` (the versions its consumers accept, positive integers,
  default `[version]`), and `sections` (the implementation's top-level sections in order, each listed once). A missing
  or malformed key fails the `interface` check, naming each problem; any other key is ignored.
- R64 (UC6, E36): Every section is optional; a `required` mark on a listed section is ignored. An implementation may
  hold sections the interface does not list, anywhere; `order` compares only the listed ones, each at most once.
- R33 (UC6, E35): `check` runs these checks on an implementation's composed document, each named in the output:
  `interface found` (`implements` is one `<id>@<version>` naming a found, valid interface), `version`, `name`, and
  `order`; an interface document gets the `interface` check (R63). Any failure fails the result.
- R34 (UC6, E36): A listed section left out, or whose first line is `**Unsupported.**`, is listed `unsupported`.
- R35 (UC6, E37): `implementations <id>` lists an implementation only when it passes `check` for that interface; every
  other candidate is under `excluded` with each reason. A skill's default is never listed. `--accept` replaces the
  interface's accepted versions.
- R36 (UC6, E38): `check` with no names covers every interface document and implementation found. A name several
  plugins hold is also checked as each `<plugin>/<name>`, and each skill's default as its skill loads it.
- R37 (UC1, E39): `show` prints a document that fails its interface check, with a warning naming the failed check.

**Consumers (UC8)**

- R38 (UC8, E40) (not built): In `--format json`, `show` entries carry `name`, `status`, `tier`, `plugin`, `path`,
  `merge`, `metadata`, `content`, `warnings`, `plugins`; `search` matches carry `name`, `tier`, `match`, `description`;
  `implementations` carries `pin`, `name`, `tier`, `version`, `description`, `unsupported`. Removing or renaming one is
  a breaking change.
- R39 (UC8, E41) (not built): Every failure that makes a name unresolved carries a stable `code`
  (`reference-missing`, `reference-ambiguous`, `name-rejected`); the human wording is not a contract.

**Read-only reads**

- R19 (UC1–UC3, UC6, E21): `show`, `where`, `list`, `search`, `check`, `implementations` create, change, or delete no
  file.

## Open questions

- **Q1.** `merge: combine` has no consumer in universal-plugin, cyberplace, or repobuddy; all use `merge-sections` or
  the default. Keep it, or deprecate it? Specified as built meanwhile.
- **Q2.** `devDependencies` count as plugin sources (R13) because the code reads them. Is that intended for a published
  consumer?
- **Q3.** `search` ignores tier in its order. Intended?
- **Q4.** Which error `code` names, and whether `--format json` fields are final (R38, R39). Needs the owner and a
  check with repobuddy, which parses them today.
- **Q5.** repobuddy's docs say a team overrides a tracker "under the qualified name"; `create` rejects a qualified name
  (R25). Which is right? This decides whether an override of one plugin's contribution among several has a home before
  #110.
- **Q6.** UC4 is behavior of skill text, so it cannot be a deterministic unit test (C5). How is it checked: a skill
  eval, or a fixture run of the Load steps?
- **Q7.** Vocabulary: cyberfleet and cyberlegion call a name-only skill a "governance"; buddy-agent-harness defines a
  governance as a version-pinned rule set; universal-plugin ADR 0002 named a tier `local` and `package`. Which words
  does the glossary fix, and do the stale `governance show` lines in cyberfleet and cyberlegion `AGENTS.md` get a
  separate fix?
- **Q10.** How does a contribution name what it builds on, and how (override, combine, or extend)? This replaces
  `overrides: [<plugin>]` (UC7, R8) and may replace #110's default marker and pin file (UC9). The main case is a
  project contribution over a plugin's; plugin over plugin is secondary.
- **Q11.** Is a plugin-root `references/` folder part of the Agent Plugins spec, or a convention of ours?
- **Q12.** For each harness: where a plugin's skills sit in its folder, how an installed plugin maps to its folder
  beyond the three in `.research/harness-detection` R7, which copy of a skill runs when several folders hold it, and
  whether the harness gives a running skill its own folder. Machine-wide admin skill folders are known for Claude Code,
  Codex, and OpenCode (`.research/machine-wide-content`). It blocks building the `default` tier and UC3's defaults, not
  the spec.
- **Q13.** Interface composition (traits, mixins): an interface that includes others, and a document that implements
  several. A name fits one interface's namespace, so these need implementations found by what a document declares,
  not by its name. Parked: `implements` names one interface (UC6.3).
- **Q14.** Required sections: every section is optional for now (R64). When an interface needs to require one, what
  does `check` do, and does adding the mark raise the version?

## References

- Interfaces design: issue #97 (closed). Overrides, dependencies, pin: #107, #110. Name-pattern listing: #79.
- Harness facts for enabled-plugin layers and managed folders: `.research/harness-detection`.
- Machine-wide and managed content, including admin skill folders: `.research/machine-wide-content`.
- The agent-facing procedure: `skills/reference/SKILL.md` and `skills/reference/references/load.md`.
- Consumers surveyed: universal-plugin ADR 0017, cyberplace `skill-design`, repobuddy `project-tracker`, cynapse ADR
  0008, cyberfleet ADR 0024.
- Why rationale is linked, not inlined: `.research/design-spec-criteria`.
