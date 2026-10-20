---
spec-type: behavioral
---

# reference/resolve — a name is answered with the document its contributions compose, and anyone can see why

Part of [reference](../README.md). Its What, key terms, actors, adapters, names, and output contract apply here;
IDs are shared across the parent and its children.

## Use Cases

### UC1 — Resolve names (A1.1)

- **Trigger:** a consumer's instructions name one or more references to load.
- **Entry points:** Skill: the `reference` skill's Load mode, which runs the command. Code: `reference show <name>...`;
  `loadReference(name, options)`.
- **Inputs:** one or more names; the root (default the current directory); the calling skill's folder, for the `default`
  tier; the detected harness.
- **Outcome:** for each name, in the order asked, the document composed from its contributions as their `extends` and
  `merge` declare, with status `found`. The document is the composed bodies; no contribution's frontmatter is part of
  it.
- **Extensions:** each name resolves on its own; a fault in one never stops the others.
  - UC1.1 No contribution answers: status `missing`, with the reason: no tier holds the name (`default` included); the
    plugin a qualified name asks for is not installed; or a `merge: remove` contribution leaves nothing and no
    contribution above it has a body, naming that contribution.
  - UC1.2 Its contributions cannot be put in one order: status `ambiguous`. The error names the contributions in
    conflict, the cause (no written `extends` orders the plugins, a cycle in the plugins' own `extends`, or an
    `extends` listing one plugin at two separate places), and the options.
  - UC1.3 It is not a name (it ends `.md` or `.default`, is a path, or has a bad character): status `invalid`, and
    nothing is read for it.
  - UC1.5 A contribution has malformed frontmatter, an unknown `merge`, or a bad `extends`: it still answers, with a
    warning and the documented default. A `merge: remove` contribution with a body: the body is ignored, with a warning,
    and the remove still applies.
  - UC1.6 Only `<name>.md` and `<name>/README.md` answer a name; no other file does. Both in one folder: the first
    answers, and the other is ignored with a warning.
  - UC1.7 No name given: error.
  - UC1.8 The document fails its interface check: still answered, with a warning.
  - UC1.9 The skill folder does not exist: a warning, and the name resolves without the `default` tier.
  - UC1.10 A plugin's contribution answers over the default contribution, and no selection names it: still answered,
    with a warning naming the plugin and `reference select <name>` (UC9). The warning stops once a written `extends`,
    whether a selection (UC9) or a customization, names the plugin or the default.
  - UC1.12 A step in `extends` cannot be used. A step not installed, or not holding the name, is skipped with whatever
    only it brings in, with a warning. When every step is missing, the `extends` counts as not written, with a warning,
    and the stack falls to the next written `extends`. A plugin listing itself has that entry ignored, with a warning. A
    lower contribution's `extends` that builds a different stack is not used, with a warning. A `default` step with
    nothing there is skipped with no warning; the trace shows it.
  - UC1.13 A section matches no section below: with an explicit `<!-- merge: ... -->` marker, a warning, and its text
    goes at the end (nothing, for `remove`); unmarked, it goes at the end with no warning. A document repeating a
    heading: the first is matched, with a warning.

### UC2 — Explain a resolution (A2.1)

- **Trigger:** someone asks what an agent reads for a name and why, or where a customization of it would go.
- **Entry points:** Skill: the `reference` skill's Inspect mode. Code: `reference show <name> --trace`;
  `reference where <name> [--default <skill folder>] [--trace]`; `resolveReference`, `whereReference`.
- **Inputs:** a name; the root (default the current directory); the calling skill's folder, for the `default` tier;
  the detected harness.
- **Outcome:** the trace gives the name's status; the stack and what built it (the contribution whose `extends` was
  used, the plugins' own `extends`, or none); for each section of the composed document, by heading path, the
  contributions that supplied its text and the operation each applied; and every layer checked, in K17 order highest
  first, with its path, the file that matched, its frontmatter as written, the operation it applied and whether that
  came from the contribution or from a step, and its outcome (K7). The composed document itself is unchanged. `where`
  gives the project and user `<name>.md` files a customization or a selection is written to, each with who it reaches,
  and the heading paths of the document below each, which a section operation can target; with `--trace`, also the
  layers with their outcomes.
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
- **Outcome:** `list` gives one row per name with its description, and its status when not `found`; a pattern keeps
  exactly the names it matches. With `--trace`, it gives one row per name per layer holding it, and one per installed
  skill holding a default contribution of it (a harness's machine-wide admin skills included), with tier, plugin or
  skill, path, description, and the outcome (K7) that contribution gets; a default's is the one it gets when its skill
  loads the name, and its row notes that the `default` step reaches it then; a default has no qualified name. A
  selection's row is marked as one. `search` resolves each name as `show` would, and each default as its skill loads it,
  then gives matches best first, each with its name, description, and match kind.
- **Extensions:**
  - UC3.1 Nothing matches: the output says zero explicitly. It is not an error.
  - UC3.2 `search` with an empty query: error.
  - UC3.3 A name that no written `extends` orders: `list` marks it ambiguous with the options (each `<plugin>/<name>`,
    and each skill's default); `search` returns it once per plugin.
  - UC3.4 A name a `remove` turned off: `list` shows it `missing`, and with `--trace` the `remove` row and each row
    below it as `shadowed by <contribution> (remove)`; `search` leaves the name out.
  - UC3.5 The detected harness's skill folders are not verified (`.research/skill-resolution` covers six harnesses; Q12
    holds what stays open): `list` and `search` show no defaults, and the answer says so and why. It is a limit of the
    harness, not a warning.

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

## Criteria

Edge IDs are in [graph.md](./graph.md).

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
- R57 (UC2, E11): `where` gives the project and user `<name>.md` with who each reaches, and the heading paths below
  each; on an ambiguous name, the options and the files a selection goes to. With `--trace`, it also gives the layers
  with their outcomes.

**Layers**

- R12 (UC1, E14): The project tier reads `.agents/references/` in the root and each folder above it up to the
  repository root (a `.git`, `pnpm-workspace.yaml`, or a `package.json` with `workspaces`); with no repository root
  above, the root alone. The user tier reads `~/.agents/references/`. The managed tier reads `references/` in each
  detected harness's managed folder; the library keeps no managed folder of its own.
- R13 (UC1, E15): The plugin tier holds, for the detected harness, each enabled plugin's `references/`, and the declared
  `dependencies` and `devDependencies` of the nearest `package.json` that are plugins and ship one, each named by its
  plugin manifest's `name`, never by its package name; never a transitive package. Any other dependency adds no plugin
  layer: a standalone skill's defaults are found with the skills (R58), and the trace shows the rest `not read (not a
  plugin)`. The plugin running the command is read once. A plugin-root `references/` is this library's convention, not
  part of the Agent Plugins spec, and no harness reads it (`.research/skill-resolution`).
- R14 (UC1, E16): An interface document is never composed: `extends` and `merge` on it are ignored with a warning, a
  higher contribution of it is ignored with a warning, and the lowest answers; two plugins holding it make it
  `ambiguous`.
- R15 (UC2, E17): A layer skipped for a reason appears in the trace with that reason and adds no contribution.
- R20 (UC1, UC2, E22): No `governances/` folder is read, in any tier or skill folder.
- R41 (UC1, UC2, UC4, E43): `--default <skill folder>` reads `<skill folder>/references/<name>.default.md` as the
  `default` tier; the old `references/<name>.md` copy is not read as a default. `where` takes `--default`. Every
  detected harness tells a loaded skill its folder, but none hands it to a script, so the skill passes it
  (`.research/skill-resolution` D).

**Finding**

- R16 (UC3, E18): `list` has one row per name, with its description and, when not `found`, its status and options. With
  `--trace`, it has one row per name per layer holding it, and one per installed skill holding a default of it, naming
  the skill and noting that the `default` step reaches it; a selection's row is marked as one. `list '<pattern>'` keeps
  exactly the names matching, where `*` is any run of characters and everything else is literal and case-sensitive.
- R17 (UC3, E19): `search` ranks match kinds in the order `name`, `prefix`, `close name`, `description` (which also
  matches `tags`), `heading`, `body`, then by name. A name resolves as `show` would, and each default as its skill loads
  it, before it is searched; a name a `remove` turned off is left out.
- R18 (UC3, E20): `list` and `search` with no match print an explicit zero; it is not an error.
- R58 (UC3, E48): Defaults are found in the skill folders the detected harness reads: its project and user skill
  folders, its machine-wide admin skill folders, and each enabled plugin's skills. On a harness whose skill folders are
  not verified, no defaults are listed, and the answer says so. A skill is known by the `name` in its `SKILL.md`, not by
  its folder's name, and a symlinked skill folder is followed. Where each harness keeps a plugin's skills and how an
  installed plugin maps to its folder: `.research/skill-resolution` A and B.
