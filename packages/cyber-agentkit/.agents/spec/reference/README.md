---
spec-type: behavioral
---

# reference — an agent reads only the instructions that apply where it works, however many places customize them

The work to make the code meet this spec and its child specs is tracked in #113.

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
chosen what the name builds on; then it waits until they add it. Where several versions could answer, the customizer
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
- N4 Reading company or team instructions a harness delivers from a server. The agent combines them at run time
  (`.research/machine-wide-content`).
- N5 Running a model when a name is loaded, in this version. A model runs only when a customizer generates or revises a
  document.
- N6 Detecting where the agent works, or reloading when its work moves. Every folder's additions are delivered up front.
- N7 Finding a document for a single use, such as one feature's spec. The consuming skill points the agent at it.
- N8 Noticing changes to a source's content. Only a plugin's version is compared; a customizer who changes their
  request generates the document again.
- N9 Editing a generated document by hand. A change goes in the customizer's request, and the document is generated
  again.

**Key terms** (shared terms: [glossary](../glossary.md)):

- K1 **tier**: where a contribution for a name comes from: `managed`, `repo`, `project`, `user`, `plugin`, or `default`.
  `plugin` and `default` build the stack (K14). `user` applies over the stack, and `repo` over that (K23). `managed`
  applies over the main document and each project section (K27), and `project` adds sections after the main document
  (K24). `--scope` names the tier a write goes to: `repo`, which reaches everyone working in the repository, or `user`,
  which reaches only you, in every repository.
- K2 **layer**: one folder read for a name: one per plugin for `plugin`, the calling skill's folder for `default`,
  `~/.agents/references/` for `user`, `.agents/references/` at the root for `repo`, each `.agents/references/` below the
  root for `project`, and one per detected harness for `managed`, beside that harness's own managed settings.
- K4 **qualified name**: `<plugin>/<name>`: that plugin's implementation of a name, with the stack it builds on. A
  selection or a pin names one.
- K5 **merge operation**: how a contribution applies over what is below it: a plugin's over the stack below it, a `user`
  one over the stack, a `repo` one over that, and a managed one over the main document and each project section (K27).
  `replace` puts mine in place of everything below. `patch` (the default) keeps what is below and puts my text in place
  of the text it matches by heading path. `combine` keeps what is below and adds my text after the text it matches.
  `remove` drops what is below. The same four apply to a whole contribution (frontmatter `merge`), to a step, and to one
  section (a `<!-- merge: ... -->` marker). A heading path is read from each document's own top heading level, so
  `# Review` and `## Review` match. A `remove` in `repo` or `user` turns the name off.
- K6 **status of a name**: `found`, `missing`, `ambiguous`, or `invalid`. A name is `ambiguous` when its plugins cannot
  be put in one order and no selection settles it.
- K7 **outcome of a layer** (in the trace): `used`, `shadowed`, `ambiguous`, `missing`, `stale` (K26), or `not read` or
  `not used` with a reason. A layer is `shadowed` when a `replace` or `remove` above it drops it.
- K8 **interface**: a contract declared in a `<id>.interface` reference. It lists the sections an implementation holds,
  in order, which of them are required, and what each holds. An **implementation** declares `implements:
  <id>@<version>`.
- K9 **consumer**: a plugin or skill that loads references through this capability, by skill, command, or library.
- K10 **contribution**: a reference file for a name, in one layer. A name may have several.
- K13 **default**: a skill's own contribution of a name it owns, `references/<name>.default.md` in the skill's folder,
  passed with `--default`. It is the lowest step of the stack unless `extends` places it. A name ending `.default` is
  reserved for it.
- K14 **stack**: the plugin and default contributions of a name, applied bottom first, each with its merge operation.
  Frontmatter `extends` lists it.
- K15 **step**: one entry of `extends`: a plugin or `default`, optionally with the keys (`merge`, `extends`) to use for
  that contribution in place of its own.
- K16 **selection**: a `repo` or `user` contribution with `extends` and no body. It records the customizer's pick of the
  stack and changes nothing else.
- K17 **above and below**: the order the stack applies in, bottom first: its plugins and `default` in `extends` order,
  the first listed lowest; with no written `extends`, `default` lowest. Each contribution applies over the result of
  everything below it, so a higher one wins where they conflict. Lower and higher mean below and above. The `managed`
  and `project` tiers are not in the stack: `managed` applies over the main document and each project section (K27), and
  project sections are delivered after it (K24).
- K18 **root**: the repository root, found from the working folder. Its `.agents/references/` holds the `repo` tier, and
  every `.agents/references/` below it holds a project section. `--root <folder>` names the root when it cannot be found
  that way: when the command runs from outside the repository, as a globally installed skill may, or when the work is in
  a folder that is not a git repository.
- K20 **generated document**: a contribution a generator writes from the customizer's request: a `repo` or `user`
  contribution written from the stack, as a delta by default or a whole document with `merge: replace`, or a project
  section, written from the main document. Its frontmatter keeps the selection it was built on (`extends`), each source
  with its plugin's version, and the request.
- K21 **source**: a contribution a generated document is built from: each step of its stack. A project section records
  the sources of the main document it was written against.
- K22 **request**: what the customizer asked to change in the prose, in their own words. Choices of plugins, their
  order, and their sections are metadata (`extends`), not part of the request.
- K23 **main document**: what the tiers compose for a name: the stack; over it, the `user` contribution; over that, the
  `repo` one; then each managed contribution over that; each with its merge operation. A selection changes the stack
  and adds nothing.
- K24 **project section**: a `.agents/references/<name>.md` below the root, which states only what differs in its
  folder. It follows the main document in the resolved reference, under a heading naming that folder.
- K25 **route**: in the opt-in routing table, a line naming a folder that has a project section, in place of the
  section's text. `--in <path>` expands the routes whose folder holds the path.
- K26 **stale**: said of a generated document when a source's recorded plugin version differs from the installed one, or
  a recorded source is gone. Load still uses it, and suggests revising it.
- K27 **managed contribution**: `<name>.md` in `references/` of a detected harness's managed folder, placed there by an
  admin. It applies at load over the main document and each project section, with its merge operation (K5), so it ranks
  above every other tier. Its text reaches the agent only through load: no written contribution holds it, generated or
  not.
- K28 **resolved reference**: what load returns for a name: the main document, followed by its project sections.

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
| A6.1 | A6 plugin author | Ship skills that load references by name, with defaults others can implement or extend |
| A6.2 | A6 | Extend another plugin's implementation, or the loading skill's default, by replacing or adding to some of its sections, in effect once installed |
| A6.3 | A6 | Publish an interface that states which sections an implementation must hold and what each holds, and know an implementation meets it |
| A6.4 | A6 | Ship its own implementation of another skill's interface, loaded by itself under a name the plugin owns |
| A7.1 | A7 agent user | Be told when the agent ran without instructions it asked for, or without the customizations placed for it |
| A7.2 | A7 | Be told when a document was built from plugins that have since changed, and how to revise it |
| A8.1 | A8 project maintainer (a team owning one folder of a monorepo) | Add only what differs in their folder, and have the agent follow it whenever its work is there |

**Child specs.** Each use case lives in the child that owns it; UC8 stays here.

| Child | Use cases | Criteria |
| --- | --- | --- |
| [resolve](./resolve/README.md) | UC1, UC2, UC3, UC7, UC10 | Composition, Stack, Reporting, Layers, Finding |
| [write](./write/README.md) | UC5, UC9, UC11, UC14, UC18 | Writing |
| [interfaces](./interfaces/README.md) | UC6, UC15 | Interfaces |
| [skill](./skill/README.md) | UC4, UC12, UC17 | Fallback |
| [formats](./formats/README.md) | UC13 | R65 to R72 |

### UC8 — Consumers read a stable output (A1.1)

- **Trigger:** a consumer's code (a skill's script, or a program using the library) needs fields from a result, not
  prose.
- **Entry points:** Code: `--format json` on `load`, `where`, `list`, `search`, `check`, `implementations`, `create`,
  `customize`, and `delete`; the library functions return the same records.
- **Inputs:** a command and its arguments; the output format.
- **Outcome:** each result carries the same fields in every adapter: by default only those that answer the request, with
  `--metadata` and `--trace` adding the rest, so an agent pays for no detail it did not ask for, and a consumer reads
  status, metadata, and codes instead of prose (repobuddy reads `metadata.contract` from `load --metadata`, once its
  `show` calls move to `load`, and `match` from `search`). Removing or renaming a field is a breaking change. Each
  failure and warning carries a stable code; the human wording is not a contract. `metadata` is the composed
  frontmatter, key by key with the higher contribution winning, without `merge`, `extends`, and a generated document's
  record of its sources and request: those say how one contribution was built or applies, and the trace carries each as
  written (UC2).
- **Extensions:**
  - UC8.1 A name not `found`: its entry carries the status and code, and the other names still resolve.
  - UC8.2 A warning in structured output goes in the entry's `warnings`, so a consumer reads every fault from one
    place.
  - UC8.3 The name has project sections: structured output gives each as its own record with its folder, and its text
    or, with the routing option, its route, apart from the main document, so code can take the one for the folder it
    works in without parsing headings, and code reading only the main document is unchanged. Such an entry is always a
    record, never the bare content. Text output inlines them as UC1 says.

**Surface trace.** `load`, `--trace`, `--default` (UC1, UC2, UC10, UC12); the routing option and `--in` (UC1, UC12,
UC17); `--root` (all); `where`, `--default`, `--in` (UC2); `list`, pattern (UC3); `search` (UC3); `create` with
`--merge`, `--template`, `--implements`, `--scope`, `--plugin`, `--default`, `--dry-run` (UC5, UC15); `customize` with
`--extends`, `--request`, `--body`, `--scope`, `--in`, `--merge`, `--dry-run` (UC9, UC18); `delete` with `--scope`,
`--plugin`, `--default`, `--dry-run` (UC11); `check` (UC6); `implementations`, `--accept` (UC6); `--format`,
`--metadata` (UC8). Frontmatter keys `merge`, `extends` (with the step keys `merge`, `extends`, `sections`),
`implements`, `interface`, `description`, `tags`, and a generated document's record of sources and request serve UC1,
UC5, UC6, UC7, UC9, UC14, UC18; the section marker `<!-- merge: ... -->` serves UC1 and UC7. File names `<name>.md`
and `<name>.default.md` serve UC5, UC9, UC11, UC18 and UC3, UC12. Informational, no contract: the trace's keys beyond
those the Adapters group names.

## Criteria

Edge IDs are in [graph.md](./graph.md).

**Adapters**

- R43 (UC1, UC6, UC8, E12): The command exits 0 when it did what was asked: every name `found`, or `where` on an
  ambiguous name. It exits 1 when a name is not `found`, a check fails, or a write is refused, and 2 on a usage error
  (no name, an unknown flag).
- R44 (UC1): In text, one name prints its resolved reference; several print each as
  `<reference name="...">...</reference>` in the order asked; a name not `found` prints
  `<reference name="..." status="..." />` in its place. Each project section follows the main document as
  `<project folder="...">...</project>`, in path order; with the routing option, as
  `<project folder="..." route="..." />`. The wrapper, not a heading, marks where a section starts and ends, so its own
  headings keep their levels.
- R45 (UC1, UC8, E13): In text, a failure is an `error: <code>: <message>` line and a warning a
  `warning: <code>: <message>` line, both on stderr. Neither changes stdout, and a warning never changes the exit code.
- R46 (UC2): `--trace` in text writes to stderr a summary line (status, stack, what built it), then each section's
  heading path with its contributions and operations, then each layer, then each project section with its folder and
  path; for a generated document, each source with its recorded and installed plugin versions, and the request. Stdout
  stays the plain resolved reference.
- R47 (UC8): `--format json` or `toon` writes one document to stdout, with the fields R38 gives; a warning goes only in
  the entry's `warnings`, not on stderr.
- R48 (UC1, UC8): Each library function returns full records: every field R38 lists, including those `--metadata` and
  `--trace` add; the command prints a subset. A name not `found`, `invalid` included, is a status in its record, never a
  thrown error. Warnings go in the record's `warnings` and are never printed.

**Names**

- R1 (UC1, E1): A name is `invalid` when it ends `.md`, `.default` (that suffix names a default's file, K13), or `.meta`
  (that suffix names a metadata file, K31), has a path separator other than one `<plugin>/` prefix, or a character
  other than letters, digits, `-` and `.`. Nothing is read for it, and the other names still resolve.
- R51 (UC1, E1): A `<name>.default.md` in a tier folder is ignored, with a warning that a default goes in a skill's
  `references/` folder.
- R2 (UC1, UC7, E2): `<plugin>/<name>` builds the stack from that plugin's contribution and what its own `extends`
  brings in; the `user`, `repo`, and managed contributions still apply over it, as K23 orders them, and its project
  sections still follow it. A written `extends` is not used, and a plugin extending the named one is left out.

**Consumers (UC8)**

- R38 (UC8, E40): A command prints only the fields that answer it; `--metadata` (on `load`) and `--trace` add more, and
  a field with nothing to say is left out. In `--format json` and `toon`:
  - `load`: one entry per name asked, in order. A `found` name with no warnings and no project sections is its content
    as a string; otherwise a record of `name`, `status`, `content`, `projectSections` (each `folder`, and `content`, or
    `route` with the routing option), and `warnings`. A name not `found` is a record of `name`, `status`, `code`, and
    `options` when `ambiguous`. `--metadata` makes every entry a record and adds `status` and `metadata`. `--trace` adds
    `trace`: the stack, the contributions used (tier, plugin or skill, path, operation), the sections, the layers, each
    project section's `folder` and `path`, and for a generated document its `sources` (each plugin, recorded version,
    and installed version) and `request`.
  - `list`: rows of `name` and `description`, with `status` and `options` when not `found`; `--trace` adds the rows per
    layer (R16) with `tier`, `plugin` or `skill`, `path`, outcome, and `kind` (`selection`, `generated`, or
    `project-section` with its `folder`) when the row is one.
  - `search`: matches of `name`, `description`, and `match`; `--trace` adds `tier` and `plugin` or `skill`.
  - `check`: the entries that fail, each `name` and `failures` (each `check` and `message`), the entries that pass with
    a warning, each `name` and `warnings`, and the count that pass; `--trace` adds every entry with `kind` and
    `unsupported`.
  - `implementations`: each `pin`, `description`, and `unsupported`; `--trace` adds `name`, `tier`, `version`, the
    interface's `cardinality` and `accept`, and `excluded` with `name` and `reasons`.
  Removing or renaming one of these fields is a breaking change. The fields of `where`, `create`, `customize`, and
  `delete` follow R57 and the Writing criteria, and are not a contract yet (Q4).
- R39 (UC8, E41): Every failure and warning carries a stable `code`; a warning in `warnings` is `{code, message}`. A
  name not `found` has `reference-missing`, `reference-ambiguous`, or `reference-invalid`; a stale generated document's
  warning has `reference-stale` (UC4.6 acts on it); a check failure's code is its check's name (R33). The other codes
  are Q4. The human wording is not a contract.

**Read-only reads**

- R19 (UC1–UC3, UC6, E21): `load`, `where`, `list`, `search`, `check`, and `implementations` create, change, or delete
  no file. Only `create`, `customize`, and `delete` write, each only where R24 allows; none writes in the managed tier
  or an installed copy of a plugin or skill.

## Open questions

- **Q4.** The codes for warnings and refused writes, and the fields of `where`, `create`, `customize`, and `delete`
  (R38, R39). Needs the owner and a check with repobuddy, which parses the output today.
- **Q12.** (#114) Narrowed by `.research/skill-resolution`, which answers it for Claude Code, Cursor, Codex, Copilot
  CLI, OpenCode, and Gemini CLI: where a plugin's skills sit, how an installed plugin maps to its folder, which copy of
  a skill runs, and that every one tells a loaded skill its folder (R41). A plugin-root `references/` folder is a
  convention of this library, not of the Agent Plugins spec (R13). It no longer blocks the `default` tier or UC3's
  defaults (#113). What stays unverified: which Cursor marketplace plugins are enabled (Cursor keeps that on its server,
  so only the cached copies can be read); Claude Code's project-scope plugin records; and the text OpenCode and Gemini
  CLI give a loaded skill, read from source only. The harnesses also disagree on which same-named skill runs; R16 says
  how `list` shows a default two skills of one name hold.

## References

- Interfaces design: issue #97 (closed). Name-pattern listing: #79 (closed). #110 (open): its alias, default marker,
  and pin file are replaced by `extends` and selection (UC7, UC9). #107 (open): overrides and hard plugin dependencies.
- Output rules (R38, R43 to R48): clibuilder v12's `axi` output. A returned value goes to stdout in the asked format,
  diagnostics to stderr, errors coded; `--full` there means no truncation, so this spec's extra fields use `--metadata`.
- Harness facts for enabled-plugin layers and managed folders: `.research/harness-detection`.
- Machine-wide and managed content, including admin skill folders: `.research/machine-wide-content`.
- Where each harness keeps a plugin's skills, its install records, same-name precedence, what a loaded skill is told
  about its folder, and that a plugin-root `references/` is ours: `.research/skill-resolution`.
- Skill folders package managers write (pnpm, `npx skills`) and which harnesses read them:
  `.research/package-manager-skills`.
- The agent-facing procedure: `skills/reference/SKILL.md` and `skills/reference/references/load.md`.
- Consumers surveyed: universal-plugin ADR 0017, cyberplace `skill-design`, repobuddy `project-tracker`, cynapse ADR
  0008, cyberfleet ADR 0024.
- Why rationale is linked, not inlined: `.research/design-spec-criteria`.
