---
spec-type: behavioral
---

# reference — an agent gets the instructions that apply wherever it works, however many places customize them

The work to make the code meet this spec and its child specs is tracked in #130; its test cases hold the functional detail.

## What

A skill often needs instructions it does not carry itself: how this repository tracks issues, which house style to
follow, which criteria a spec must meet. Many parties want a say in them: the plugin that ships the skill, other
plugins, a company's admin, the user in every repository, the repository, each project in a monorepo, and a single
feature. Without this capability, each of them costs the agent something. Instructions inlined in the skill load on
every run, and no one can change them without forking the plugin. A plugin that supplies its own version, such as one
for another issue tracker, cannot tell whether it covers everything the skill expects. Customizations stacked on one
another hand the agent text they meant to drop, or two texts that disagree, and leave it to reconcile them while it
works. A project's customization is missed when the agent's work moves into that project's folder partway through a
task. A customization goes quietly out of date when the plugin under it updates. And an admin's instructions for every
repository on the machine reach a skill only if something reads them for it.

This capability lets a skill ask for instructions by name and get one concise document, with the additions that apply
around it. The skill's author ships a version of their own, and can publish what any version must contain. Another
plugin can ship a version of its own that meets those requirements, or build on an existing version by replacing or
adding to some of its sections. Either takes effect as soon as the plugin is installed, unless a customizer has already
chosen what the name builds on; then it waits until they add it, and each load says so until they add it or leave it
out. Where several versions could answer, the customizer
picks one. A customizer then states, in their own words, what to change, either for the repository or for themselves in
every repository, and an agent writes the finished document from the chosen versions and those changes, recording what
it was built from. When a skill asks for the name, it gets one main document: what the plugins ship, with the user's own
changes applied over it and the repository's over those. An admin's instructions on the machine apply over it, changing,
adding to, or replacing its sections the way a plugin does. Each project folder adds only what differs there, marked
with the folder it applies to, so the agent follows the right additions wherever its work goes. When a plugin a document
was built from changes, the agent is told to revise the document.

Some instructions cannot be read in advance: those a harness delivers from a company or team server, and a single
feature's own. The agent combines them with the document while it works, following a stated order of precedence.
Customizations come from people who never coordinate, so a fault in one never stops the rest: each name is answered with
what can be found, and every fault is reported as a warning.

**Non-goals:**

- N1 Installing, enabling, or removing plugins. That is [dependencies](../dependencies/README.md).
- N2 Finding references by meaning. Results are returned in a deterministic order.
- N3 Reading any path, or a folder other than `references/`. A name is never a path. Non-Markdown references are
  [formats](./formats/README.md); `assets/` belongs to [asset](../asset/README.md).
- N13 Reading company or team instructions a harness delivers from a server. The agent combines them at run time
  (`.research/machine-wide-content`).
- N14 Running a model when a name is loaded, in this version. A model runs only when a customizer generates or revises a
  document.
- N15 Detecting where the agent works, or reloading when its work moves. Every folder's additions are delivered up
  front.
- N7 Finding a document for a single use, such as one feature's spec. The consuming skill points the agent at it.
- N8 Noticing changes to a source's content. Only a plugin's version is compared; a customizer who changes their
  request generates the document again.
- N17 A routing table that lists project sections in place of their text. Every project section is inlined: no one can
  predict which folders the agent will touch after it loads a name, or rely on it to open a route when its work moves.
- N9 Editing a generated document by hand. A change goes in the customizer's request, and the document is generated
  again.

**Key terms** (shared terms: [glossary](../glossary.md)):

- K1 **tier**: where a contribution for a name comes from: `managed`, `repo`, `project`, `user`, `plugin`, or `default`.
  `plugin` and `default` build the stack (K14). `user` applies over the stack, and `repo` over that (K23). `managed`
  applies over the main document and each project section (K27), and `project` adds sections after the main document
  (K24). A write goes to `repo`, which reaches everyone working in the repository, or to `user`, which reaches only
  you, in every repository.
- K2 **layer**: one folder read for a name: one per plugin for `plugin`, the calling skill's folder for `default`,
  `~/.agents/references/` for `user`, `.agents/references/` at the root for `repo`, each `.agents/references/` below the
  root and each package plugin's (K36) for `project`, and, for `managed`, the one beside the managed settings of the harness that
  detection names as running. Other harnesses' managed folders are never read, and none is read when detection names
  more than one harness.
- K4 **qualified name**: `<plugin>/<name>`: that plugin's implementation of a name, with the stack it builds on.
- K5 **merge operation**: how a contribution applies over what is below it, in the order K23 gives; a managed one
  applies over the main document and over each project section (K27). `replace` puts mine in place of everything below.
  `patch` (the default) keeps what is below and puts my text in place of the text it matches by heading path, keeping
  the subsections of a matched section that my text does not match. `combine` keeps what is below and adds my text
  after the text it matches. `remove` drops what is below. The same four apply to a whole contribution (frontmatter
  `merge`), to a step, and to one section (a `<!-- merge: ... -->` marker). A heading path is read from each document's
  own top heading level, so `# Review` and `## Review` match. A `remove` in `repo` or `user` turns the main document off
  when no contribution above it has a body; project sections still answer.
- K6 **status of a name**: `found`, `missing`, `ambiguous`, or `invalid`. A name is `ambiguous` when its plugins cannot
  be put in one order and no selection settles it, when two plugins hold an interface document of it or the same
  key of a `many` interface, or when two names list it as an alias.
- K7 **outcome of a layer** (in the trace): `used`, `shadowed`, `ambiguous`, `missing`, `stale` (K26), or `not read` or
  `not used` with a reason. A layer is `shadowed` when a `replace` or `remove` above it drops it.
- K8 **interface**: a contract declared in a `<id>.interface` reference. It lists the sections an implementation holds,
  in order, which of them are required, and what each holds. An **implementation** declares `implements:
  <id>@<version>`.
- K9 **consumer**: a plugin or skill that loads references through this capability, by skill, command, or library.
- K10 **contribution**: a reference file for a name, in one layer. A name may have several.
- K13 **default**: a skill's own contribution of a name it owns, `references/<name>.default.md` in the skill's folder.
  It is the lowest step of the stack unless its own `extends` or a written `extends` places it.
  A name ending `.default` is reserved for it.
- K14 **stack**: the plugin and default contributions of a name, applied bottom first, each with its merge operation.
  Frontmatter `extends` lists it.
- K15 **step**: one entry of `extends`: a plugin or `default`, optionally with the keys (`merge`, `extends`) to use for
  that contribution in place of its own.
- K16 **selection**: a `repo` or `user` contribution with `extends` and no body. It records the customizer's pick of the
  stack, with the plugins it left out (K35), and changes nothing else.
- K17 **above and below**: the order the stack applies in, bottom first: its plugins and `default` in `extends` order,
  the first listed lowest; with no written `extends`, `default` lowest unless its own `extends` places it, as a plugin's
  own `extends` places that plugin. Each contribution applies over the result of everything below it, so a higher one
  wins where they conflict. Lower and higher mean below and above. The `managed` and `project` tiers are not in the
  stack: `managed` applies over the main document and each project section (K27), and project sections are delivered
  after it (K24).
- K18 **root**: the repository root, found from the working folder. Its `.agents/references/` holds the `repo` tier, and
  every `.agents/references/` below it holds a project section.
- K33 **generated document**: a contribution a generator writes from the customizer's request, never from its own
  earlier text: a `repo` or `user` contribution written from the stack, as a delta by default or a whole document with
  `merge: replace` (from the interface's stub, for a name only an interface defines or one already found), or a
  project section, written from the main document and the project sections of the folders above its own. Its
  frontmatter keeps the selection it was built on (`extends` and `declined`), each source with its plugin's version, and the
  request. A project section records `sources` and `request` only, with no `extends` (K24). A whole document from the
  interface's stub records `implements` and the request, and no `sources`.
- K34 **source**: a contribution a generated document is built from: each step of its stack. A project section records
  the sources of the main document it was written against. A `default` source records its skill's plugin and version
  when the skill ships in a plugin; a standalone skill's default records no version and is never stale. A `user`
  document's sources are only the harness's enabled plugins.
- K35 **declined**: the plugins that held a name when a customizer wrote its `extends` and that the stack it builds
  leaves out, recorded in frontmatter `declined` beside that `extends`. It records that the customizer decided about
  each one, so load tells a plugin left out on purpose from one installed after the pick.
- K22 **request**: what the customizer asked to change in the prose, in their own words. Choices of plugins, their
  order, and their sections are metadata (`extends`), not part of the request.
- K23 **main document**: what the tiers compose for a name: the stack; over it, the `user` contribution; over that, the
  `repo` one; each with its merge operation. The managed contribution is not part of it: it applies over the main
  document and over each project section (K27). A selection changes the stack and adds nothing.
- K24 **project section**: a `.agents/references/<name>.md` or `<name>/README.md` below the root, or a package plugin's
  contribution of the name for its package's folder (K36), which states only what differs in that folder. It follows the main document in the resolved reference, wrapped with that folder (R44). It
  carries no `merge`, `extends`, `implements`, or `aliases`: no command writes them on one, and load ignores them with
  a warning.
- K26 **stale**: said of a generated `repo` or `user` document, or a project section, when a source's recorded plugin
  version differs from the installed one, or a recorded source is gone. Load still uses it, and suggests revising it. A
  plugin's or a default's own file is compared only by `check`.
- K27 **managed contribution**: the file answering the name in `references/` of the current harness's managed
  folder, placed there by an admin. It applies at load over the main document and each project section, with its merge
  operation (K5), so it ranks above every other tier. Its text reaches the agent only through load: no written
  contribution holds it, generated or not.
- K28 **resolved reference**: what load returns for a name: the main document, followed by its project sections, with
  the managed contribution applied over the main document and over each project section (K27).
- K36 **package plugin**: a plugin that a `package.json` below the root declares and the plugin tier does not hold (R13).
  It never joins the stack: its contribution of a name reaches only that package's folder, as a project section
  (R115), so the main document is the same from every working folder.
- K32 **alias**: an older name a plugin's or a default's contribution of a name lists in `aliases`, so load lines and
  customizations written for the older name still reach it after a rename. An interface document lists the older ids of
  its interface, which are also older names of the document (R128).
- K37 **legacy form**: a form of a contribution that version 1 wrote and 2.0 retired, each with the 2.0 form that says
  the same: `merge: merge-sections` (now `patch`, the default, so no `merge`); `merge: first-wins` (now `replace`);
  `overrides: [<plugin>...]`, the plugins a copy sat above, an entry possibly qualified as `<plugin>/<name>` (now
  `extends`); a skill's default at `references/<name>.md` in its folder (now `<name>.default.md`); and, in a project
  folder, a selection, the `extends` with no body that `reference select` wrote when run below the root (now a pick
  for the whole repository, written by `reference customize <name> --extends <step>...`). A qualified-name override,
  `<plugin>/<name>.md` in a subfolder of a tier or project folder, is one too: version 1 guidance described it as the
  override of one plugin's copy, though no version read it (now `<name>.md` with `extends: [<plugin>]`). A selection
  `select` wrote at the root is already a 2.0 selection (K16). Version 1 shipped no pin file, so none is a legacy form.
- K38 **rename table**: `references/_renames.yaml` in a plugin, a YAML mapping of each older name to its new name. It
  declares renames that `aliases` cannot (K32), such as a plain document renamed to a `one` interface's document.
  Unlike an alias, it changes nothing at load: `migrate` applies it, and a load of an older name warns.

## Use Cases

**Actors and goals.** A4, A7, and A8 are affected by the outcome without invoking it.

| ID | Actor | Goal |
| --- | --- | --- |
| A1.1 | A1 consumer (a skill, or the agent running it) | Load the instructions it names: the main document and each project section after it, with any managed contribution applied over both, marked with the folder it applies to |
| A1.2 | A1 | When a name can't be answered, know the reason, since each needs a different next step, and carry on |
| A1.3 | A1 | Know the order of precedence for combining the document with instructions it cannot load: company and team instructions, and a single feature's own |
| A2.1 | A2 inspector (anyone) | Know what an agent reads for a name, and why |
| A3.1 | A3 finder (anyone) | Find the names that exist, to load one or customize one |
| A4.1 | A4 admin | Have their instructions reach every repository on the machine, applied over everything else |
| A5.1 | A5 customizer (a team for its repository, or a user for themselves) | Change what a skill reads without forking the plugin: say in their own words what to change, and get one concise document generated from it, or turn the name off |
| A5.2 | A5 | Remove a customization, and learn what answers afterwards |
| A5.3 | A5 | Pick which implementation answers a name, and the order in which plugins extend it |
| A5.4 | A5 | Revise a generated document when a plugin it was built from changes, without restating their request |
| A5.5 | A5 | Bring the files they wrote in a legacy form, or under a name a plugin renamed, to the current form and name, seeing every change before it is made |
| A6.1 | A6 plugin author | Ship skills that load references by name, with defaults others can implement or extend |
| A6.2 | A6 | Extend another plugin's implementation, or the loading skill's default, by replacing or adding to some of its sections, in effect once installed |
| A6.3 | A6 | Publish an interface that states which sections an implementation must hold and what each holds, and know an implementation meets it |
| A6.4 | A6 | Ship its own implementation of another skill's interface, loaded by itself under a name the plugin owns |
| A6.5 | A6 | Rename a name its plugin owns without breaking the load lines and customizations written for the old one |
| A6.6 | A6 | Declare its renames once, so every customizer's files move to the new names without the plugin rewriting them |
| A7.1 | A7 agent user | Be told when the agent ran without instructions it asked for, or without the customizations placed for it |
| A7.2 | A7 | Be told when a document was built from plugins that have since changed, and how to revise it |
| A8.1 | A8 project maintainer (a team owning one folder of a monorepo) | Add only what differs in their folder, and have the agent follow it whenever its work is there |
| A8.2 | A8 | List a plugin in their package's `package.json` and have its version of a name apply only to work in their folder |

**Child specs.** Each use case lives in the child that owns it; UC8 stays here.

| Child | Use cases | Criteria |
| --- | --- | --- |
| [resolve](./resolve/README.md) | UC1, UC2, UC3, UC7, UC10, UC19, UC21 | Composition, Stack, Reporting, Legacy forms, Layers, Finding, Renames |
| [write](./write/README.md) | UC5, UC9, UC11, UC18, UC20, UC22, UC23 | Writing, Migrating |
| [interfaces](./interfaces/README.md) | UC6, UC15 | Interfaces |
| [skill](./skill/README.md) | UC4, UC12, UC17 | Fallback, Load |
| [formats](./formats/README.md) | UC13 | R65 to R72, R92 to R95 |

### UC8 — Consumers read a stable output (A1.1)

- **Trigger:** a consumer's code (a skill's script, or a program using the library) needs fields from a result, not
  prose.
- **Entry points:** Code: the commands' structured output; the library functions return the same records.
- **Inputs:** a command and its arguments; the output format.
- **Outcome:** each result carries the same fields in every adapter, so an agent pays for no detail it did not ask for,
  and a consumer reads status, metadata, and codes instead of prose. Removing or renaming a field is a breaking change.
  Each failure and warning carries a stable code; the human wording is not a contract. Warnings are in one place, so a
  consumer reads every fault from there. Project sections are records of their own.
- **Extensions:**
  - UC8.1 A name not `found`: its entry carries the status and a code, and the other names still resolve.
  - UC8.2 A warning in structured output goes in one place in the entry, so a consumer reads every fault from it.
  - UC8.3 The name has project sections: structured output gives each as its own record with its folder, and its text,
    apart from the main document, so code can take the one for the folder it works in without parsing headings, and code
    reading only the main document is unchanged. Such an entry is always a record, never the bare content. Text output
    inlines them as UC1 says.

## Criteria

Edge IDs are in [graph.md](./graph.md); E1 and E2 are in [resolve's](./resolve/graph.md).

**Adapters**

- R43 (UC1, UC6, UC8, E12): Exit values follow clibuilder's `axi` contract. Exit 0: the command did what was asked or
  answered, a no-op and an empty answer included; a name not `found` is a status in the answer, not a failure. Exit 1:
  the command was called correctly but could not complete. Exit 2: it was called incorrectly, and retrying cannot help.
- R44 (UC1): In text, one name prints its resolved reference; several print each in the order asked, each marked with
  its name; a name not `found` prints its message in its place, with its options when `ambiguous`. Each project section
  follows the main document as `<project folder="...">...</project>`, in path order. The wrapper, not a heading, marks
  where a section starts and ends, so its own headings keep their levels. The `folder` is the section's path relative
  to the root.

**Names**

- R1 (UC1, E1): A name is never a path (N3). A name that is not valid is `invalid`, nothing is read for it, and the
  other names still resolve.
- R2 (UC1, UC7, E2): `<plugin>/<name>` is pinned to that plugin's version of a name, with the stack it builds on; the
  `user` and `repo` contributions still apply over it, as K23 orders them, and the managed one over the result (K27);
  its project sections still follow it.

**Consumers (UC8)**

- R39 (UC8, E41): Every failure and warning carries a stable `code`, following clibuilder's `axi` error contract. A
  name not `found` is `missing`, `ambiguous`, or `invalid`, and a stale generated document warns (UC4.6 acts on it).
  The human wording is not a contract.

**Read-only reads**

- R19 (UC1–UC3, UC6, UC22, E21): `load`, `where`, `list`, `search`, `check`, `implementations`, and `migrate` without
  `--write` create, change, or delete no file. Only `create`, `customize`, `delete`, and `migrate --write` write; none
  writes in the managed tier or an installed copy of a plugin or skill.

## Open questions

None.

## References

- Legacy forms and `migrate` (K37, K38, UC22): issue #142; the qualified-name override: issue #147.
- Interfaces design: issue #97 (closed). Name-pattern listing: #79 (closed). #110 (open): its default marker and pin
  file are replaced by `extends` and selection (UC7, UC9), and its alias by K32 (UC19). #107 (open): overrides and hard
  plugin dependencies.
- Output rules (R43, R44): clibuilder v12's `axi` output. A returned value goes to stdout in the asked format,
  diagnostics to stderr, errors coded; this spec's extra fields are opt-in.
- Harness facts for enabled-plugin layers and managed folders: `.research/harness-detection`. What stays unverified
  about skill folders and plugin records (Cursor's enabled marketplace plugins, Claude Code's project-scope records, the
  text OpenCode and Gemini CLI give a loaded skill): #114.
- Machine-wide and managed content, including admin skill folders: `.research/machine-wide-content`.
- Where each harness keeps a plugin's skills, its install records, same-name precedence, what a loaded skill is told
  about its folder, and that a plugin-root `references/` is ours: `.research/skill-resolution`.
- Skill folders package managers write (pnpm, `npx skills`) and which harnesses read them:
  `.research/package-manager-skills`.
- The agent-facing procedure: `skills/reference/SKILL.md` and `skills/reference/references/load.md`.
- Consumers surveyed: universal-plugin ADR 0017, cyberplace `skill-design`, repobuddy `project-tracker`, cynapse ADR
  0008, cyberfleet ADR 0024.
- Why rationale is linked, not inlined: `.research/design-spec-criteria`.
