---
spec-type: behavioral
---

# reference — an agent gets the instructions that apply wherever it works, however many places customize them

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
  (K24). `--scope` names the tier a write goes to: `repo`, which reaches everyone working in the repository, or `user`,
  which reaches only you, in every repository.
- K2 **layer**: one folder read for a name: one per plugin for `plugin`, the calling skill's folder for `default`,
  `~/.agents/references/` for `user`, `.agents/references/` at the root for `repo`, each `.agents/references/` below the
  root for `project`, and, for `managed`, the one beside the managed settings of the harness that
  detection names as running. Other harnesses' managed folders are never read, and none is read when detection names
  more than one harness (nested harnesses; detection reports `unknown`, R12).
- K4 **qualified name**: `<plugin>/<name>`: that plugin's implementation of a name, with the stack it builds on.
  `implementations` gives each as its `pin`.
- K5 **merge operation**: how a contribution applies over what is below it, in the order K23 gives; a managed one also
  applies over each project section (K27).
  `replace` puts mine in place of everything below. `patch` (the default) keeps what is below and puts my text in place
  of the text it matches by heading path. `combine` keeps what is below and adds my text after the text it matches.
  `remove` drops what is below. The same four apply to a whole contribution (frontmatter `merge`), to a step, and to one
  section (a `<!-- merge: ... -->` marker). A heading path is read from each document's own top heading level, so
  `# Review` and `## Review` match. A `remove` in `repo` or `user` turns the main document off; project sections still
  answer (R49).
- K6 **status of a name**: `found`, `missing`, `ambiguous`, or `invalid`. A name is `ambiguous` when its plugins cannot
  be put in one order and no selection settles it, when two plugins hold an interface document of it (R14) or the same
  key of a `many` interface (R87), or when two names list it as an alias (R98).
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
- K33 **generated document**: a contribution a generator writes from the customizer's request: a `repo` or `user`
  contribution written from the stack, as a delta by default or a whole document with `merge: replace`, or a project
  section, written from the main document. Its frontmatter keeps the selection it was built on (`extends`), each source
  with its plugin's version, and the request.
- K34 **source**: a contribution a generated document is built from: each step of its stack. A project section records
  the sources of the main document it was written against. A `default` source records its skill's plugin and version
  when the skill ships in a plugin; a standalone skill's default records no version and is never stale (R101).
- K22 **request**: what the customizer asked to change in the prose, in their own words. Choices of plugins, their
  order, and their sections are metadata (`extends`), not part of the request.
- K23 **main document**: what the tiers compose for a name: the stack; over it, the `user` contribution; over that, the
  `repo` one; then the managed contribution over that; each with its merge operation. A selection changes the stack
  and adds nothing.
- K24 **project section**: a `.agents/references/<name>.md` below the root, which states only what differs in its
  folder. It follows the main document in the resolved reference, wrapped with that folder (R44). It carries no
  `merge`, `extends`, `implements`, or `aliases`: no command writes them on one (R27, R81), and load ignores them with
  a `project-section-key-ignored` warning (R110).
- K26 **stale**: said of a generated `repo` or `user` document, or a project section, when a source's recorded plugin
  version differs from the installed one, or a recorded source is gone. Load still uses it, and suggests revising it.
  A plugin's own file is compared only by `check` (R86, R101).
- K27 **managed contribution**: `<name>.md` in `references/` of the current harness's managed folder, placed there by an
  admin. It applies at load over the main document and each project section, with its merge operation (K5), so it ranks
  above every other tier. Its text reaches the agent only through load: no written contribution holds it, generated or
  not.
- K28 **resolved reference**: what load returns for a name: the main document, followed by its project sections.
- K32 **alias**: an older name a plugin's or a default's contribution of a name lists in `aliases`, so load lines and
  customizations written for the older name still reach it after a rename.

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
| A6.5 | A6 | Rename a name its plugin owns without breaking the load lines and customizations written for the old one |
| A7.1 | A7 agent user | Be told when the agent ran without instructions it asked for, or without the customizations placed for it |
| A7.2 | A7 | Be told when a document was built from plugins that have since changed, and how to revise it |
| A8.1 | A8 project maintainer (a team owning one folder of a monorepo) | Add only what differs in their folder, and have the agent follow it whenever its work is there |

**Child specs.** Each use case lives in the child that owns it; UC8 stays here.

| Child | Use cases | Criteria |
| --- | --- | --- |
| [resolve](./resolve/README.md) | UC1, UC2, UC3, UC7, UC10, UC19 | Composition, Stack, Reporting, Layers, Finding, Renames |
| [write](./write/README.md) | UC5, UC9, UC11, UC18, UC20 | Writing |
| [interfaces](./interfaces/README.md) | UC6, UC15 | Interfaces |
| [skill](./skill/README.md) | UC4, UC12, UC17 | Fallback, Load |
| [formats](./formats/README.md) | UC13 | R65 to R72, R92 to R95 |

### UC8 — Consumers read a stable output (A1.1)

- **Trigger:** a consumer's code (a skill's script, or a program using the library) needs fields from a result, not
  prose.
- **Entry points:** Code: `--format json` on `load`, `where`, `list`, `search`, `check`, `implementations`, `create`,
  `customize`, and `delete`; the library functions return the same records.
- **Inputs:** a command and its arguments; the output format.
- **Outcome:** each result carries the same fields in every adapter: by default only those that answer the request, with
  `--metadata` and `--trace` adding the rest, so an agent pays for no detail it did not ask for, and a consumer reads
  status, metadata, and codes instead of prose (repobuddy reads `metadata.contract` from `load --metadata`, and `match`
  from `search`). Removing or renaming a field is a breaking change. Each failure and warning carries a stable code; the
  human wording is not a contract. `metadata` is the composed frontmatter, key by key with the higher contribution
  winning, without `merge`, `extends`, and a generated document's record of its sources and request: those say how one
  contribution was built or applies, and the trace carries each as written (UC2).
- **Extensions:**
  - UC8.1 A name not `found`: its entry carries the status and code, and the other names still resolve.
  - UC8.2 A warning in structured output goes in the entry's `warnings`, so a consumer reads every fault from one
    place.
  - UC8.3 The name has project sections: structured output gives each as its own record with its folder, and its text,
    apart from the main document, so code can take the one for the folder it works in without parsing headings, and code
    reading only the main document is unchanged. Such an entry is always a record, never the bare content. Text output
    inlines them as UC1 says.

**Surface trace.** `load`, `--trace`, `--default` (UC1, UC2, UC10, UC12); `--root` (all); `where`, `--default`, `--in`
(UC2); `list`, pattern (UC3); `search` (UC3); `create` with `--merge`, `--template`, `--implements`, `--scope`, `--in`,
`--plugin`, `--default`, `--dry-run`, `--trace` (UC5, UC15); `customize` with `--extends`, `--extends-file`,
`--request`, `--body`, `--base`, `--scope`, `--in`, `--default`, `--merge`, `--dry-run`, `--trace` (UC9, UC20, UC18);
`delete` with `--scope`, `--in`, `--plugin`, `--default`, `--dry-run` (UC11); `check` (UC6); `implementations`,
`--accept` (UC6); `--format`, `--metadata` (UC8). Frontmatter keys `merge`, `extends` (with the step keys `merge`,
`extends`, `sections`), `implements`, `interface`, `description`, `tags`, `aliases`, and a generated document's record
of sources and request serve UC1, UC5, UC6, UC7, UC9, UC20, UC18, UC19; the section marker `<!-- merge: ... -->` serves
UC1 and UC7. File names `<name>.md` and `<name>.default.md` serve UC5, UC9, UC11, UC18 and UC3, UC12. Informational, no
contract: the trace's keys beyond those the Adapters group names.

## Criteria

Edge IDs are in [graph.md](./graph.md); E1 and E2 are in [resolve's](./resolve/graph.md).

**Adapters**

- R43 (UC1, UC6, UC8, E12): The command exits 0 when it did what was asked: every name `found`, or `where` on an
  ambiguous name. It exits 1 when a name is not `found`, a check fails, or a write is refused, and 2 on a usage error
  (no name, an unknown flag). `list` and `search` exit 0 whatever their rows' statuses.
- R44 (UC1): In text, one name prints its resolved reference; several print each as
  `<reference name="...">...</reference>` in the order asked; a name not `found` prints
  `<reference name="..." status="..." code="...">` holding its message, and its options when `ambiguous`, in its place.
  Each project section follows the main document as `<project folder="...">...</project>`, in path order. The wrapper,
  not a heading, marks where a section starts and ends, so its own headings keep their levels.
- R45 (UC1, UC8, E13): A failure that ends the command (a refused write, a usage error, a failed check) is reported
  once, on stdout, as clibuilder's `axi` error value: `error` (the message), `code`, its details, and `help`; in text,
  its text form. A warning is a diagnostic on stderr, `warning: <code>: <message>`; it never changes stdout or the exit
  code.
- R46 (UC2): `--trace` in text writes to stderr a summary line (status, stack, what built it), then each section's
  heading path with its contributions and operations, then each layer, then each project section with its folder and
  path; for a generated document, each source with its recorded and installed plugin versions, and the request. Stdout
  stays the plain resolved reference.
- R47 (UC8): `--format json` or `toon` writes one document to stdout, with the fields R38 gives; a warning goes only in
  the entry's `warnings`, not on stderr.
- R48 (UC1, UC8): Each library function returns full records: every field R38 lists, including those `--metadata` and
  `--trace` add; the command prints a subset. A name not `found`, `invalid` included, is a status in its record, never a
  thrown error, and so is a failed check. A refused write throws an error carrying its `code`, marked when it is a usage
  error. Warnings go in the record's `warnings` and are never printed.

**Names**

- R1 (UC1, E1): A name is `invalid` when it ends `.md`, a [K29](./formats/README.md) extension, `.default` (that suffix
  names a default's file, K13), or `.meta` (that suffix names a metadata file, [K31](./formats/README.md)), has a path
  separator other than one `<plugin>/` prefix, or a character other than letters, digits, `-` and `.`. Nothing is read
  for it, and the other names still resolve.
- R51 (UC1, E1): A `<name>.default.md` in a tier folder is ignored, with a warning that a default goes in a skill's
  `references/` folder.
- R2 (UC1, UC7, E2): `<plugin>/<name>` builds the stack from that plugin's contribution and what its own `extends`
  brings in; the `user`, `repo`, and managed contributions still apply over it, as K23 orders them, and its project
  sections still follow it. A written `extends` is not used, and a plugin extending the named one is left out.

**Consumers (UC8)**

- R38 (UC8, E40): A command prints only the fields that answer it; `--metadata` (on `load`) and `--trace` add more, and
  a field with nothing to say is left out. In `--format json` and `toon`:
  - `load`: one entry per name asked, in order. A `found` name with no warnings and no project sections is its content
    as a string; otherwise a record of `name`, `status`, `content`, `projectSections` (each `folder` and `content`), and
    `warnings`. A name not `found` is a record of `name`, `status`, `code`, and `options` when `ambiguous`. `--metadata`
    makes every entry a record and adds `status`, `metadata`, and `format` (R66). `--trace` adds `trace`: the stack, the
    contributions used (tier, plugin or skill, path, operation), the sections, the layers (each with its `file`, whose
    extension shows the format), each project section's `folder` and `path`, and for a generated document its `sources`
    (each plugin, recorded version, and installed version) and `request`.
  - `list`: rows of `name` and `description`, with `status` and `options` when not `found`, and `format` for a
    non-Markdown name (R66); `--trace` adds the rows per
    layer (R16) with `tier`, `plugin` or `skill`, `path`, outcome, and `kind` (`selection`, `generated`, or
    `project-section` with its `folder`) when the row is one.
  - `search`: matches of `name`, `description`, and `match`, `folder` for a match in a project section, and `format`
    for a non-Markdown name (R66); `--trace` adds `tier` and `plugin` or `skill`.
  - `check`: the entries that fail, each `name` and `failures` (each `check` and `message`), the entries that pass with
    a warning, each `name` and `warnings`, and the count that pass; `--trace` adds every entry with `kind` and
    `unsupported`.
  - `implementations`: each `pin` (its qualified name), `description`, and `unsupported`; `--trace` adds `name`, `tier`,
    `version`, the interface's `cardinality` and `accept`, and `excluded` with `name` and `reasons`.
  - `where`: `files`, each with `scope` (`repo`, `user`, or the `--in` folder), `path`, and `reaches`; `headings`, the
    main document's heading paths; `used`, the plugins and default the stack uses; and `options` when `ambiguous`.
    `--trace` adds the layers with their outcomes.
  Removing or renaming one of these fields is a breaking change. The reports of `create`, `customize`, and `delete`
  follow the Writing criteria and are informational, not a contract.
- R39 (UC8, E41): Every failure and warning carries a `code`, following clibuilder's `axi` error contract; a warning in
  `warnings` is `{code, message}`. A name not `found` has `reference-missing`, `reference-removed` (a `remove` turned it
  off), `reference-ambiguous`, or `reference-invalid`; a stale generated document's warning has `reference-stale` (UC4.6
  acts on it); a renamed one's has `reference-renamed` (UC19); every code is in R104. The human wording is not a
  contract.
- R104 (UC8, E41): Every code is one of these, and this table is its one home. Adding a code is not breaking; removing
  or renaming one is. A check failure's code is its check's name (R33, R64): `interface found`, `version`, `name`,
  `order`, `required`, `interface`, `compose`.

  | Code | Kind | When |
  | --- | --- | --- |
  | `reference-missing`, `reference-ambiguous`, `reference-invalid` | name status | UC1.1, UC1.2, R1 |
  | `reference-removed` | name status | a `missing` name a `remove` turned off (UC1.1, R49) |
  | `frontmatter-invalid` | warning | malformed frontmatter (R105) |
  | `merge-unknown`, `marker-unknown` | warning | an unknown `merge` value or marker (R7) |
  | `marker-unmatched` | warning | an explicit marker that matches nothing below (R7) |
  | `heading-repeated` | warning | a document repeating a heading (R7) |
  | `remove-body-ignored` | warning | a `remove` with a body (R49) |
  | `extends-invalid` | warning | a malformed `extends` (R106) |
  | `extends-self` | warning | a plugin listing itself (R54) |
  | `extends-step-missing`, `extends-all-missing` | warning | a step, or every step, that cannot be used (R55) |
  | `extends-not-used` | warning | a lower `extends` that builds a different stack (R53); picks written under a managed `extends` that builds it (R109) |
  | `section-not-held` | warning | a `sections` entry the plugin does not hold (R52) |
  | `default-not-selected` | warning | a plugin answering over the default with no `extends` naming either (R56) |
  | `default-folder-missing` | warning | a `--default` folder that does not exist (R41) |
  | `default-in-tier` | warning | a `<name>.default.md` in a tier folder (R51) |
  | `file-ignored` | warning | a second file for a name in one folder (R67) |
  | `format-mismatch` | warning | a Markdown contribution above a non-Markdown one (R68) |
  | `metadata-ignored` | warning | a misplaced metadata file, or a body, `merge`, or `implements` in one (R94) |
  | `project-section-key-ignored` | warning | `merge`, `extends`, `implements`, or `aliases` in a project section (R110) |
  | `interface-not-composed` | warning | `extends`, `merge`, or a higher copy on an interface document (R14) |
  | `interface-check` | warning | a loaded document failing its interface check (R37) |
  | `base-moved` | warning | `check` on a plugin file whose extended base has a newer version (R86) |
  | `reference-stale` | warning | a generated document or project section with a changed or missing source (R101) |
  | `reference-renamed` | warning | a name or file under an older name (R96, R97) |
  | `alias-not-used`, `alias-invalid` | warning | an alias a name holds as its own; an invalid or misplaced one (R96, R98) |
  | `project-section-not-markdown` | warning | a project section that is not Markdown (R99) |
  | `repo-hides-user` | warning | a `user` file this repository's `repo` contribution hides (R26) |
  | `reference-qualified` | refused | a qualified name given to a write (R25) |
  | `folder-invalid` | refused | a `--plugin` or `--default` folder that does not qualify (R24) |
  | `file-exists` | refused | `create` on a file with a body (R60) |
  | `reference-hidden` | refused | a `replace` or `remove` above would hide the new file (R26) |
  | `extends-replace` | refused | a `--plugin` file extending another plugin with `replace` (R103) |
  | `interface-invalid` | refused | `--implements` with an unknown interface (R28) |
  | `template-title`, `template-invalid` | refused | a title template; an unreadable or non-mapping one (R32) |
  | `step-invalid` | refused | a step neither `default` nor a plugin holding the name (R79) |
  | `no-selection` | refused | `--extends none` with no `extends` there (R80) |
  | `body-not-generated` | refused | `--request` on a body that records no request (R82) |
  | `pick-required` | refused | `--request` without `--extends` on an `ambiguous` name (R82) |
  | `no-file` | refused | `delete` with no file there (R30) |
  | `options-conflict`, `options-missing`, `options-invalid`, `option-invalid` | usage | flags that exclude each other, a missing or wrong flag, a wrong value (R24, R82, R43) |

**Read-only reads**

- R19 (UC1–UC3, UC6, E21): `load`, `where`, `list`, `search`, `check`, and `implementations` create, change, or delete
  no file. Only `create`, `customize`, and `delete` write, each only where R24 allows; none writes in the managed tier
  or an installed copy of a plugin or skill.

## Open questions

None.

## References

- Interfaces design: issue #97 (closed). Name-pattern listing: #79 (closed). #110 (open): its default marker and pin
  file are replaced by `extends` and selection (UC7, UC9), and its alias by K32 (UC19). #107 (open): overrides and hard
  plugin dependencies.
- Output rules (R38, R43 to R48): clibuilder v12's `axi` output. A returned value goes to stdout in the asked format,
  diagnostics to stderr, errors coded; `--full` there means no truncation, so this spec's extra fields use `--metadata`.
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
