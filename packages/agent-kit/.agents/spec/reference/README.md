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
declares whether it replaces the contributions below it or extends them, and one rule, the same for every skill, puts
the contributions in order. A team can then customize a plugin's instructions without forking it, and two skills asking
for one name read the same thing.

**Non-goals:**

- Installing, enabling, or removing plugins. That is [dependencies](../dependencies/README.md).
- Finding references by meaning. Results are returned in a deterministic order.
- Reading anything but Markdown by name, or any path. A name is never a path.

**Key terms** (shared terms: [glossary](../glossary.md)):

- **tier**: where a contribution lives. In precedence order, highest first: `managed`, `project`, `user`, `plugin`.
- **layer**: one folder read for references. A tier holds one or more layers.
- **legacy layer**: a `governances/` folder, still read, ranked below the `references/` folder of the same tier.
- **qualified name** (a **pin**): `<plugin>/<name>`. It asks for that plugin's contribution.
- **merge mode**: how a contribution applies over the contributions below it, set by frontmatter `merge`: `first-wins`
  (default), `combine`, `merge-sections`.
- **status of a name**: `found`, `missing`, or `ambiguous`.
- **outcome of a layer** (in the trace): `used`, `shadowed`, `ambiguous`, `missing`, or `not read` with a reason.
- **interface**: a contract declared in a `<id>.interface` reference. An **implementation** declares
  `implements: <id>@<version>`.
- **consumer**: a plugin or skill that loads references through this capability, by skill, command, or library.
- **contribution**: a reference file for a name, in one layer of a tier. A name may have several.

## Use Cases

**Actors.** A1 a skill, or the agent running it, that needs a document by name. A2 a user or agent asking why a name
resolved as it did. A3 a user or agent finding what exists. A4 an author or admin who places contributions in tiers and
is affected without invoking it: their placement must win in the order promised. A5 a user or agent writing or removing
their own contribution. A6 a plugin author who publishes an interface or an implementation and wants it checked.

| Actor | Goal |
| --- | --- |
| A1 skill | Get the one document that answers a name, the same in every skill, and still get something sensible when it cannot |
| A2 inspector | Learn which contribution answered, which were set aside, and why |
| A3 finder | See every name that exists, or those matching a pattern or topic, each with its contribution and status |
| A4 author or admin | Have a higher tier beat a lower one, and a plugin contribution be overridable only as declared |
| A5 writer | Add or remove a project or user contribution, and learn what answers the name afterwards |
| A6 plugin author | Know that an implementation has the sections its interface requires, and list the ones a consumer can load |

### UC1 — Resolve names (A1, A4)

- **Entry points:** `reference show <name>...`; `resolveReference(name, layers)`.
- **Inputs:** one or more names, `--root` (default the current directory), the detected harness.
- **Outcome:** per name, in the order asked: the document on stdout (one name prints it bare; several print each in a
  `<reference name tier>` block), exit 0 when every name resolved.
- **Extensions:**
  - A name is missing: that entry is `status="missing"`, an `error:` line on stderr names it, exit 1.
  - A name is ambiguous (two plugins hold it and neither overrides the other): `status="ambiguous"`, the error lists
    the qualified names to ask for, exit 1.
  - A name ends `.md` or is not a name (a path, bad characters): the whole call is rejected, nothing is read, exit 1.
  - A qualified name whose plugin is not installed: missing, and the trace says no plugin by that name exists.
  - A contribution has malformed frontmatter, an unknown `merge`, or a bad `overrides`: it still answers, with a warning
    on stderr and the documented default.
  - Two files in one folder answer one name (`<name>.md` and `<name>/README.md`): the first in the order answers, the
    other is ignored with a warning.
  - No name given: error, exit 1.
  - The resolved document fails its interface check: it is still printed, with a warning.

### UC2 — Explain a resolution (A2)

- **Entry points:** `reference show <name> --trace`; `reference where <name> [--caller <skill folder>]`.
- **Outcome:** `--trace` reports every layer checked with its path, the file that matched, its merge mode, and its
  outcome. `where` reports the slots in precedence order, which is `used`, and the project and user files an override
  could be written to, each with its scope.
- **Extensions:**
  - A layer is skipped (policy held in MDM, a plugin with no install folder): it appears with the reason.
  - A layer is legacy or deprecated: it still answers and its status says to move it.
  - `where` on an ambiguous name: error naming the qualified names, exit 1.
  - `where` on a plugin's contribution or the consumer's default contribution: reported read-only, never offered as a
    place to write.

### UC3 — List and search (A3)

- **Entry points:** `reference list [pattern]`; `reference search <query>`.
- **Outcome:** `list` gives one row per name per layer holding it, with tier, plugin, path, description, and the status
  resolution gave that layer. A pattern keeps exactly the names it matches. `search` gives matches best first.
- **Extensions:**
  - Nothing matches: the output states zero explicitly; exit 0.
  - Search with an empty query: error, exit 1.
  - A name two plugins hold and neither overrides: `list` marks it ambiguous with the qualified names; `search` returns
    it once per plugin.

### UC4 — Fall back when the resolver cannot answer (A1)

- **Entry points:** the `reference` skill's Load mode; a skill that names references and ships its own contributions.
  This use case is behavior of the skill's instructions, not of the command.
- **Outcome:** the consumer gets the resolver's document when the command ran and the name is `found`; otherwise its
  default contribution, read from `<base folder>/references/<name>.md`, then
  `<base folder>/references/governances/<name>.md`; and the user is told which names came from a fallback and why.
- **Extensions:**
  - The name is missing and the consumer has no default contribution: the name is not loaded, reported, and the consumer
    carries on without it. No substitute is searched for.
  - The name is ambiguous: neither plugin's document nor the default contribution is loaded; both qualified names are
    reported, and the user is told to settle which one the repository uses.
  - The call was rejected (a name that is a file or a path): that name is never read from disk; the call is repeated
    without it.
  - The command did not run (no node, module missing): every name is read from the default contribution, the user is
    told no project, user, or machine override applied, and, when a name has no contribution, that the script ships with
    the npm package and a git-installed plugin has none.
  - Every name came from the command: nothing is said about the load.

### UC5 — Write and remove a contribution (A5)

- **Entry points:** `reference create <name>`; `reference delete <name>`.
- **Outcome:** `create` writes `<name>.md` in the project folder (default) or the user folder (`--scope user`) and
  reports the path and the resulting trace. `delete` removes only that contribution and reports which contribution
  answers the name afterwards.
- **Extensions:**
  - `create` where the file exists: error, nothing written; never overwrites.
  - `create` with a qualified name: error naming the bare name to ask for.
  - `create` where a higher `first-wins` contribution would hide the new file: error naming that contribution.
  - `create` over a contribution below: the new file is marked `merge: merge-sections` unless the template sets `merge`,
    or it is a whole implementation (then it replaces the contribution below and says so).
  - `create` with both `--template` and `--implements`, an unreadable template, a template whose frontmatter is not a
    mapping, an unknown interface, or a tier the interface bars: error.
  - A template with a one-hash `#` heading, or no `description`: warning.
  - `--dry-run`: path and content printed, nothing written (create) or deleted (delete).
  - `delete` with no contribution in that scope: error stating what answers the name now; a plugin's or managed
    contribution is never deleted. A qualified name: error.

### UC6 — Check and list interface implementations (A6)

- **Entry points:** `reference check [name...]`; `reference implementations <id> [--accept 1,2]`.
- **Outcome:** `check` validates each resolved document (after overrides merge) against the interface it declares, or an
  interface document against its own shape, and exits 1 on any failure. `implementations` lists the compatible ones
  with pin, tier, version, description, and unsupported sections, and the ones left out with each reason.
- **Extensions:**
  - A named reference is missing or ambiguous: reported as that status with a failure, exit 1.
  - A reference declares no `implements` and is not an interface: failure.
  - `implements` is malformed, names an interface that is missing, ambiguous, or malformed: failure.
  - No names: every interface document and every implementation is checked; a name two plugins hold is checked once
    per plugin.
  - `implementations` of an unknown interface: error, exit 1.

### UC7 — Publish an override a repository can use (A4, A6)

- **Entry points:** frontmatter `overrides: [<plugin>]` on a plugin's contribution; `merge`.
- **Outcome:** a plugin's contribution sits above the named plugin's contribution, so a house-style plugin changes what
  a generic skill reads without forking it; the trace says `used (overrides <plugin>)`.
- **Extensions:** an `overrides` on a non-plugin contribution, on an interface document, or not a list of plugin names
  is ignored with a warning; plugins that override each other, or a holder no contribution names, stay ambiguous.

### UC8 — Consumers read a stable output (A1)

- **Entry points:** `--format json` on `show`, `search`, `where`, `list`, `check`, `implementations`.
- **Outcome:** a skill parses fields and codes instead of prose. repobuddy reads `metadata.contract` from `show` and
  `match` from `search`.
- **Extensions:** none, a field either exists or the consumer is broken; [Q4](#open-questions) records the decision.

### UC9 — Settle an ambiguity without editing a plugin (A4) — not built, issue #110

- **Entry points:** a name alias, a default marker on a plugin contribution, a pin file in `.agents/` and `~/.agents/`.
- **Outcome:** a non-default plugin contribution beats the default with no `overrides` line; two non-default
  contributions are ambiguous until a pin settles them; the ambiguity error names the pin.
- **Extensions:** deferred to the #110 spec. Nothing in the criteria below may forbid it.

**Surface trace.** `show`, `--trace` (UC1, UC2); `--root` (all); `where`, `--caller` (UC2); `list`, pattern (UC3);
`search` (UC3); `create` with `--template`, `--implements`, `--scope`, `--dry-run` (UC5); `delete` with `--scope`,
`--dry-run` (UC5); `check` (UC6); `implementations`, `--accept` (UC6); `--format` (UC8). Frontmatter keys `merge`,
`overrides`, `implements`, `interface`, `description`, `tags` serve UC1, UC6, UC7. Informational, no contract: the
trace's keys beyond those in R9.

## Criteria

Edge IDs are in [graph.md](./graph.md). An unmarked criterion is how 0.7.1 behaves. "(not built)" marks a decided
criterion the code does not meet yet; each has an issue or an answer recorded in Open questions.

**Names**

- R1 (UC1, E1): A name with a `.md` suffix, a path separator other than one `<plugin>/` prefix, or a character other
  than letters, digits, `-` and `.` is rejected, nothing is read, and the exit code is 1.
- R2 (UC1, E2): `<plugin>/<name>` reads only that plugin's layers, plus plugin layers whose contribution of the name
  declares `overrides` naming that plugin.

**Precedence**

- R3 (UC1, E3): With no merge modes set, the answer is the contribution in the highest tier in the order `managed`,
  `project`, `user`, `plugin`. A project or user contribution of a bare name therefore beats every plugin's contribution
  of it. Within a tier, the nearer project folder wins over a farther one, and a `references/` folder over its legacy
  folder.
- R4 (UC1, E4): A contribution with `merge: first-wins`, or none, ends the chain: every contribution below it is
  `shadowed`.
- R5 (UC1, E5): A contribution with `merge: combine` prints above the contributions below it, each marked with its
  layer, highest first.
- R6 (UC1, E6): A contribution with `merge: merge-sections` replaces, combines, or removes only the `##` sections it
  names (by `<!-- merge: replace|combine|remove -->`, default replace) and keeps the rest of the contribution below.
- R7 (UC1, E7): An unknown `merge` value is read as `first-wins` with a warning; an unknown section merge is read as
  `replace` with a warning; a section merge that matches no section below warns.

**Plugins**

- R8 (UC1, UC7, E8–E10): When two plugins hold a name and one's contribution lists the other in `overrides`, the
  overrider sits above; when every holder is ordered this way the name is `found`. Any holder left unordered makes the
  name `ambiguous`, with `<plugin>/<name>` for each choice, exit 1.

**Reporting**

- R9 (UC2, E11): `--trace` lists, for every layer checked, `tier`, `plugin`, `path`, `found`, `candidate`, `merge`, and
  `outcome`; a layer below a `first-wins` contribution reads `shadowed by <tier> (first-wins)`, and an overriding plugin
  contribution reads `used (overrides <plugin>)`.
- R10 (UC1, E12): A missing name exits 1 with `status="missing"` for that name and an `error:` line on stderr; the other
  names asked still print.
- R11 (UC1, E13): A warning is printed on stderr as `warning: ...` and never changes the exit code or stdout.

**Layers**

- R12 (UC1, E14): The project tier reads `.agents/references/` in `--root` and each folder above it up to the repository
  root (a `.git`, `pnpm-workspace.yaml`, or a `package.json` with `workspaces`); with no repository root above, `--root`
  alone. The user tier reads `~/.agents/references/`. The managed tier reads the machine-wide folder for the platform,
  then each detected harness's managed folder.
- R13 (UC1, E15): The plugin tier holds, for the detected harness, each enabled plugin's `references/`, and the declared
  `dependencies` and `devDependencies` of the nearest `package.json` that ship one; never a transitive package. The
  plugin running the command contributes its own `references/` first and is not read twice.
- R14 (UC1, E16): A higher contribution of a `<id>.interface` name is ignored with a warning; the lowest contribution
  answers; two plugins holding it make it `ambiguous`.
- R15 (UC2, E17): A layer skipped for a reason appears in the trace with that reason and contributes no contribution.
- R20 (UC1, UC2, E22): The managed, project, and user tiers, and the running plugin's own layer, also read a legacy
  `governances/` folder, ranked below that tier's `references/` folder. The managed tier has a second legacy folder,
  reported `deprecated`. Each answers, and its status tells the
  reader which folder to move the documents to.

**Finding**

- R16 (UC3, E18): `list` has one row per name per layer holding it; `list '<pattern>'` keeps exactly the names matching,
  where `*` is any run of characters and everything else is literal and case-sensitive.
- R17 (UC3, E19): `search` ranks match kinds in the order `name`, `prefix`, `close name`, `description`, `heading`,
  `body`, then by name; a name resolves as `show` would before it is searched.
- R18 (UC3, E20): `list` and `search` with no match print an explicit zero and exit 0.

**Fallback (UC4)**

- R21 (UC4, E23): The default contribution is read only when the name is `missing` or the command did not run, never
  when it is `found` or `ambiguous`.
- R22 (UC4, E24): Every name read from a fallback, and every name not loaded, is reported to the user with the reason;
  nothing is reported when all came from the command.
- R23 (UC4, E25): A rejected name's path is never read.

**Writing (UC5)**

- R24 (UC5, E26): `create` writes only `<name>.md` under `.agents/references/` of `--root` or `~/.agents/references/`,
  and never overwrites an existing file.
- R25 (UC5, E27): `create` and `delete` reject a qualified name and say which bare name to use.
- R26 (UC5, E28): `create` refuses when a higher `first-wins` contribution would hide the new file, and names that
  contribution.
- R27 (UC5, E29): `create` over a contribution below writes `merge: merge-sections` unless the template sets `merge` or
  `--implements` is given; with `--implements` it warns that the file replaces the contribution below.
- R28 (UC5, E30): `create --implements <id>` writes the interface's sections as `##` headings in order and `implements:
  <id>@<version>`, each optional section stubbed `**Unsupported.**`; it fails for an unknown interface or a tier the
  interface bars, and with `--template`.
- R29 (UC5, E31): `--dry-run` prints the path and the exact content (create) or the path and the answer afterwards
  (delete), and changes no file.
- R30 (UC5, E32): `delete` removes only the contribution in the chosen scope, never a plugin's or managed contribution,
  and reports which contribution answers the name afterwards; with no contribution in that scope it fails with exit 1.
- R31 (UC5, E33): After a `create` write, the trace shows the new file `used`.
- R32 (UC5, E34): `create` warns for a one-hash heading in the template and for a missing `description`.

**Interfaces (UC6)**

- R33 (UC6, E35): `check` runs these checks on the resolved document, each named in the output: `interface found`,
  `version`, `name`, `tier`, `required`, `known`, `order`, `interface`; exit 1 when any fails, 0 when none does.
- R34 (UC6, E36): An optional section left out, or whose first line is `**Unsupported.**`, is listed `unsupported`; a
  required section can be neither.
- R35 (UC6, E37): `implementations <id>` lists an implementation only when it passes `check` for that interface; every
  other candidate is under `excluded` with a reason. `--accept` replaces the interface's accepted versions.
- R36 (UC6, E38): `check` with no names covers every interface document and implementation found, one entry per
  plugin for a name two plugins hold.
- R37 (UC1, E39): `show` prints a document that fails its interface check, with a warning naming the failed check.

**Consumers (UC8)**

- R38 (UC8, E40) (not built): In `--format json`, `show` entries carry `name`, `status`, `tier`, `plugin`, `path`,
  `merge`, `metadata`, `content`, `warnings`, `plugins`; `search` matches carry `name`, `tier`, `match`, `description`;
  `implementations` carries `pin`, `name`, `tier`, `version`, `description`, `unsupported`. Removing or renaming one is
  a breaking change.
- R39 (UC8, E41) (not built): Every failure that makes a name unresolved carries a stable `code`
  (`reference-missing`, `reference-ambiguous`, `name-rejected`); the human wording is not a contract.
- R40 (UC1, E42) (not built): When a project or user contribution of a bare name is `used` over one or more plugin
  contributions of it, `show` warns, naming the plugins it sits above and that a `<plugin>.`-prefixed name avoids it.

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

## References

- Interfaces design: issue #97 (closed). Overrides, dependencies, pin: #107, #110. Name-pattern listing: #79.
- Harness facts for enabled-plugin layers and managed folders: `.research/harness-detection`.
- The agent-facing procedure: `skills/reference/SKILL.md` and `skills/reference/references/load.md`.
- Consumers surveyed: universal-plugin ADR 0017, cyberplace `skill-design`, repobuddy `project-tracker`, cynapse ADR
  0008, cyberfleet ADR 0024.
- Why rationale is linked, not inlined: `.research/design-spec-criteria`.
