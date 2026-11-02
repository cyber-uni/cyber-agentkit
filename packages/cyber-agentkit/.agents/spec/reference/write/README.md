---
spec-type: behavioral
---

# reference/write — contributions are created, customized, and removed without editing an installed plugin

Part of [reference](../README.md). Its What, key terms, actors, adapters, names, and output contract apply here;
IDs are shared across the parent and its children.

## Use Cases

### UC5 — Create a reference (A5.1, A6.1, A6.2, A6.4)

- **Trigger:** an author creates a reference: a new name, a skill's default, an implementation of an interface (the
  owner's or another skill's), or an extension of an existing implementation. It goes into their plugin's or skill's
  source, or into the `repo` or `user` tier for a name the repository or the user owns; there `--merge remove` turns a
  name off. `create` can do anything `customize` (UC18) does, by hand.
- **Entry points:** Skill: the `reference` skill's Create and Update modes; Update edits the file, then checks the
  trace. Code: `reference create <name> [--scope repo|user | --in <folder> | --plugin <plugin folder> | --default <skill
  folder>]
  [--merge <operation>] [--template <file> | --implements <id>] [--dry-run]`.
- **Inputs:** a bare name; where it is written (the `repo` tier by default, the `user` tier, a folder's project section,
  or a plugin's or skill's source folder); the operation (default `patch`); a template or an interface; the root.
- **Outcome:** `create` writes `<name>.md` in that tier's folder with `merge: <operation>` (none in a project section,
  which carries no `merge`, K24), and reports the path with a hint that `load <name>` gives the resolved reference; with
  `--trace`, also the resulting trace, in which a `repo` or `user` file applies over the stack (K23). The skill shows
  the user where each section came from and offers the full document. A plugin file whose `extends` names another plugin
  (it gets `extends` only from a `--template`, since `create` has no `--extends`) records, in `sources`, the version of
  that plugin it was written against, so `check` can warn its author when the base moves on (UC6).
- **Extensions:**
  - UC5.1 The file exists with a body: error, and nothing is written. `create` never overwrites; Update edits it.
  - UC5.2 The file holds only a selection: `create` adds the body and `merge`, and keeps its `extends`.
  - UC5.3 A qualified name: error naming the bare name to use.
  - UC5.4 A contribution that would hide the new file (a managed `replace` or `remove` over a `repo` file or a project
    section; this repository's `repo` one over a `user` file; for a plugin file, one above it in the stack): written all
    the same, since the hiding contribution may change later, with a warning naming it: `reference-hidden`, or
    `repo-hides-user` for a `user` file under this repository's `repo` contribution (R26, UC2.7).
  - UC5.5 `--implements <id>`: the interface's sections are written with `merge: replace`. With `--in`: usage error
    `options-conflict` (exit 2), since a project section carries no `implements` or `merge` (K24).
  - UC5.6 `--merge remove`: no body is written. With `--template`: usage error `remove-with-template` (exit 2).
  - UC5.7 Both `--template` and `--implements`: usage error `template-with-implements` (exit 2). An unreadable
    template, or a template whose frontmatter is not a mapping: refused, `template-invalid`. An unknown interface:
    refused, `interface-invalid`.
  - UC5.8 A template whose top level is a single heading holding all the others (a title, so `patch` would add the whole
    document instead of patching its sections): error, and nothing is written. A template with no `description`:
    written, with a hint that `list` and `search` will show it blank.
  - UC5.9 `--dry-run`: the path and the content are printed, and nothing is written.
  - UC5.10 `--plugin <plugin folder>`: writes `<plugin folder>/references/<name>.md`, with `merge` only when `--merge`
    is given. `--default <skill folder>`: writes `<skill folder>/references/<name>.default.md`, with `merge` only when
    `--merge` is given, since a default can extend a plugin through its own `extends` and so sit above it (R27). The
    hide check (UC5.4) and the trace apply only when the folder is a layer the stack reads.
  - UC5.11 The folder holds no plugin manifest (`--plugin`) or no `SKILL.md` (`--default`), or lies outside the
    repository, such as an installed copy: refused, `folder-invalid`, and nothing is written. More than one of
    `--scope`, `--in`, `--plugin`, and `--default`: usage error `options-conflict`. `--merge` with `--in`: usage error
    `options-conflict`, since a project section carries no `merge` (K24). `--in` naming the root or a folder outside it:
    usage error `in-not-below-root`.
  - UC5.12 A `--plugin` file that extends another plugin with `merge: replace`: error, and nothing is written. A copy
    would freeze every user on the base its author saw. The file states only the sections it changes, or, to replace
    the base entirely, is an implementation of its own with no `extends` on that plugin.

### UC18 — Customize a reference (A5.1, A8.1)

- **Trigger:** a customizer wants to change what a skill reads for a name, for the repository, for themselves, or for
  one project folder: by picking which plugins and sections it builds on, by saying in their own words what to change
  in the prose, or both.
- **Entry points:** Skill: the `reference` skill's Customize mode. It helps the customizer pick, runs a
  generator subagent when the prose must change, shows the draft, and writes it once they approve. Code:
  `reference customize <name> [--extends <step>...] [--request <file> --body <file>] [--scope repo|user | --in
  <folder>] [--default <skill folder>] [--merge <operation>] [--implements <id>] [--dry-run]`, which writes the file
  and its frontmatter; it runs no model. `--default` is read-only here: the folder to read the skill's default from
  (R41), so the stack includes it. `reference customize <name> --base [--extends <step>...] [--scope repo|user | --in
  <folder>] [--default <skill folder>] [--implements <id>]` prints the document the generator reads for that target
  (R84).
- **Inputs:** a name; the target (the `repo` tier by default, the `user` tier, or a folder below the root); the picks,
  as UC9 gives them; the request (K22); the shape of a changed body (a delta by default, or a whole document with
  `--merge replace`; a project section takes neither, K24); for a name only an interface defines, the interface; the
  root; the calling skill's folder, for the `default` tier.
- **Outcome:** what is written depends on what the customizer ended up changing. Picks alone write a selection (UC9). A
  request also writes a body: the generator reads the resolved reference from `load` with the picks applied, never the
  contribution files, and leaves the `user` tier out when the target is `repo` or a folder, so nothing personal reaches
  a shared file, and the `repo` tier out when the target is `user`, since it applies above. It never reads the target
  file itself, so a request is never applied over its own earlier result when revising (UC20): for a `repo` or `user`
  target, its input is the main document built without that file; for a folder, the main document plus the project
  sections of the folders above the target (the outer ones), not the target's own section nor any deeper one. It leaves
  managed text out too, whatever the target, and writes none of it, even when the harness shows an admin's instructions
  to the agent: it reaches the agent only at load (K27). A managed contribution's `extends` is structure, not text, so
  it still builds the stack the generator reads (R84). It writes one concise document that applies the request and keeps
  the stack's heading paths: by default a delta holding only the sections it changes, with `patch` or `combine`; with
  `--merge replace`, a whole document. For a folder, it is that folder's project section, stating only what differs
  there. The command records in the frontmatter the picks (`extends`), each source with its plugin's version (K34), and
  the request. A body goes stale as K26 says. A later `load` uses it as K23 says.
- **Extensions:**
  - UC18.1 The customizer declines the draft: nothing is written.
  - UC18.2 A request, and the target holds a body that records no request (written with `create` or by hand): refused,
    `body-not-generated`, and nothing is written, since customizing would replace it. A body that records a request is
    replaced.
  - UC18.3 The name resolves to nothing (`missing`): the body is written from the request alone, with no sources, as a
    whole document. Under a found interface's namespace, see UC18.12 and UC18.13.
  - UC18.4 The name is `ambiguous`: the customizer picks first, then the request, if any, is applied.
  - UC18.5 A project section for a name that is not Markdown: refused, `in-not-markdown` (UC1.17), and nothing is
    written.
  - UC18.6 The command cannot run: the skill writes nothing and says so (UC4).
  - UC18.7 `--plugin`: usage error `options-conflict`. `customize` never writes a file that ships; an author uses
    `create` (UC5).
    `--default` is allowed: it only reads (R41).
  - UC18.8 Neither picks nor a request: usage error `change-missing` (exit 2).
  - UC18.9 Picks alone, and the target holds a body: the body is kept and only `extends` changes. A body that records a
    request was written against the old stack: the output suggests customizing again with that request.
  - UC18.10 `--extends` picks, and a managed contribution's `extends` builds the stack: the picks are written, and the
    command warns `extends-not-used`, naming that managed contribution (R109).
  - UC18.11 `--merge` with `--in`: usage error `options-conflict`, since a project section carries no `merge` (K24).
  - UC18.12 A name only an interface defines: no default and no plugin implements it, so the name is `missing`.
    `--implements <id>` mirrors `create --implements` (UC5.5). The generator's base (`--base`) is the interface's stub,
    each section a `##` heading with its "what it holds" line, as R28 writes them. The written document is a whole
    document recording `implements: <id>@<version>` with `merge: replace` (R111).
  - UC18.13 A `missing` name that falls under a found interface's namespace (cardinality `one`: `<id>`; `many`:
    `<id>.<key>`), customized with `--request` and no `--implements`: refused, `implements-required` (exit 1), and
    nothing is written. Its `help` gives the `--implements` command.
  - UC18.14 `--implements` with `--in`: usage error `options-conflict` (exit 2), since a project section carries no
    `implements` (K24). `--implements` with an unknown interface: refused as `create --implements` is,
    `interface-invalid`.
  - UC18.15 A `replace` or `remove` above would hide the target file (a managed one over a `repo` file or a project
    section; this repository's `repo` one over a `user` file): written all the same, with the warning R26 gives, naming
    the hiding contribution. A selection (UC9) is written likewise.
  - UC18.16 `--in` naming the root or a folder outside it: usage error `in-not-below-root` (exit 2).

### UC20 — Revise a stale generated document (A5.4, A7.2)

- **Trigger:** load reports a generated document stale (UC1.14) and Load passes that on (UC4.6), or a customizer wants
  a generated document brought up to date after updating plugins.
- **Entry points:** Skill: the `reference` skill's Customize mode, which reads the recorded picks and request from
  `load --trace` (UC2), runs the generator, shows the draft, and writes it once the customizer approves. Code:
  `reference customize <name> --request <file> --body <file>` with the same target; the command runs no model.
- **Inputs:** a name; the target that holds the stale document (`repo`, `user`, or a folder); its recorded picks and
  request.
- **Outcome:** the customizer revises without restating their request. The generator reads the resolved reference as
  UC18 does, with the recorded picks, and applies the recorded request to it. That input never includes the stale
  document itself (R84), so the request is not applied over its own earlier result. The draft replaces the stale
  document (UC18.2) and records the installed plugin versions, so load stops reporting it stale.
- **Extensions:**
  - UC20.1 The customizer declines the draft: nothing is written, and the document stays stale.
  - UC20.2 A recorded source is gone (its plugin was removed): the customizer is told before generating, and picks
    again (UC9) or goes on without it.
  - UC20.3 The customizer changes the request while revising: that is customizing again (UC18) with the new request.
  - UC20.4 A stale main document and stale project sections: the main document is revised first, then each project
    section, since each records the sources of the main document it was written against (K34).
  - UC20.5 No user is present: nothing is revised, and load keeps reporting it stale.
  - UC20.6 A non-Markdown document: regenerated whole, and its metadata file updated (UC13.7).
  - UC20.7 The command cannot run: nothing is written, and the skill says so (UC4.4).

### UC9 — Pick what a name builds on (A5.3)

- **Trigger:** a name is ambiguous, or a customizer wants to choose which plugins, or the default, a name builds on,
  in what order, and which of their sections.
- **Entry points:** Skill: Load mode asks (UC4.2), or Customize mode (UC18). Code:
  `reference customize <name> (--extends <step>... | --extends-file <file>) [--scope repo|user]`, where a step is
  `<plugin>` or `default`, optionally `:<merge>` (`house-style:combine`), and the file holds a YAML `extends` list with
  every key.
- **Inputs:** a bare name; one or more steps, bottom first, each a `<plugin>` or `default`, optionally with the keys
  `merge`, `extends`, and `sections` (the top-level sections, by heading, that it contributes); the tier written to
  (`repo` by default, or `user`); the root.
- **Outcome:** `<name>.md` in that tier's folder holds an `extends` listing the steps. With no body, it is a selection
  (K16). The name then resolves through that stack (K14), as K23 says. A step with `sections` contributes only those
  sections, each with its operation; its other sections are not used. A selection is a contribution, so `list` marks
  it and `--trace` explains it.
- **Extensions:**
  - UC9.1 A picked plugin is no longer installed: it is skipped with a warning (UC1.12). When every step is gone, the
    selection counts as not written and the stack falls through; a name left ambiguous is asked again (UC4.2).
  - UC9.2 A step that is neither `default` nor a plugin holding the name: refused, `step-invalid`, and nothing is
    written. An `--extends-file` that is unreadable or not a YAML `extends` list: refused, `extends-file-invalid`.
  - UC9.3 The `repo` and `user` tiers pick differently: the `repo` one builds the stack and the `user` one's `extends`
    is `not used` (R8, UC7.6).
  - UC9.4 A qualified name: error naming the bare name to use.
  - UC9.5 `--extends none`: `extends` is removed from the file, and a file left with nothing in it is deleted. With no
    `extends` in that tier: refused, `no-selection`, stating what answers the name now. Removing the whole file is
    UC11.
  - UC9.6 A `sections` entry names a section the plugin's contribution does not hold: it is skipped with a warning.

### UC11 — Remove a customization (A5.2)

- **Trigger:** a customizer wants a `repo`, `user`, or project-folder contribution gone, or an author wants one gone
  from their plugin's or skill's source.
- **Entry points:** Skill: the `reference` skill's Delete mode. Code: `reference delete <name> [--scope repo|user | --in
  <folder> | --plugin <plugin folder> | --default <skill folder>] [--dry-run]`.
- **Inputs:** a bare name; where it is deleted from (the `repo` tier by default, the `user` tier, a folder's
  project section, or a plugin's or skill's source folder); the root.
- **Outcome:** `delete` removes only that file, and reports what answers the name afterwards: its status, and the stack
  with what built it. The status can be `ambiguous`, with the options, when the file held the selection that ordered
  the plugins. A name left `missing` or `ambiguous` is an answer, not a failure: exit 0 (R43).
- **Extensions:**
  - UC11.1 No contribution there: refused, `no-file` (exit 1), stating what answers the name now. An installed plugin's,
    a managed, or an installed skill's contribution is never deleted.
  - UC11.2 A qualified name: error naming the bare name to use.
  - UC11.3 `--dry-run`: the path and the answer afterwards are printed, and nothing is deleted.
  - UC11.4 The file also holds a selection (`extends`): both go, and the report says the selection went too, naming
    `reference customize --extends` to restore it.
  - UC11.5 `--plugin <plugin folder>` or `--default <skill folder>`: deletes `<name>.md` or `<name>.default.md` there,
    under the folder checks of UC5.11.
  - UC11.6 A non-Markdown name: its file goes, with its metadata file (K31); a selection that is a metadata file alone
    goes by itself.

## Criteria

Edge IDs are in [graph.md](./graph.md).

**Writing (UC5, UC9, UC11, UC20, UC18)**

- R24 (UC5, UC9, UC11, UC18, E26): `customize` writes only `<name>.md` (for a non-Markdown name, the files R92 and R93
  give) in the root's `.agents/references/` (`repo`, the default), in `~/.agents/references/` (`user`, with
  `--scope user`), or in `<folder>/.agents/references/` (a project section, with `--in <folder>`, a folder strictly
  below the root). `create` and `delete` act there too, or on `<plugin folder>/references/<name>.md` with
  `--plugin <plugin folder>`, or on `<skill folder>/references/<name>.default.md` with `--default <skill folder>`; that
  folder must hold a plugin manifest or a `SKILL.md` and sit inside the repository. `--scope`, `--in`, `--plugin`, and
  `--default` exclude each other (`options-conflict`, exit 2) for `create` and `delete`. `--in` names a folder strictly
  below the root, else `in-not-below-root` (exit 2). On `customize`, `--default` is no place to write: it names the
  skill folder to read the default from (R41), and combines with `--scope` or `--in`.
- R25 (UC5, UC9, UC11, UC18, E27): `create`, `customize`, and `delete` reject a qualified name and say which bare name
  to use.
- R60 (UC5, E26): `create` never overwrites a file with a body. On a file holding only a selection, it adds the body
  and `merge` and keeps the `extends`.
- R26 (UC5, UC18, E28): `create` and `customize` write the file even when a `replace` or `remove` above would hide it
  (a managed one over a `repo` file or a project section; this repository's `repo` one over a `user` file; for a
  `create` of a plugin or default file, one above it in the stack, checked only when the folder is a layer the stack
  reads), because the hiding contribution may change later. They warn `reference-hidden`, naming the hiding
  contribution; for a `user` file under this repository's `repo` contribution, `repo-hides-user`. The trace reports the
  file `shadowed by <contribution>` (R9), and `where` marks it hidden (R57).
- R27 (UC5, E29): In the `repo` and `user` tiers, `create` writes `merge` from `--merge`, else the template's `merge`,
  else `patch`; with `--plugin` or `--default`, only from `--merge`. A default can extend a plugin through its own
  `extends` (R8 brings each step's `extends` beneath it), so it can sit above that plugin, and its `merge` matters:
  `merge: replace` makes it a whole-document snapshot. In a project section (`--in`) it writes no `merge`, and `--merge`
  or `--implements` with `--in` is a usage error (`options-conflict`, exit 2), since a project section carries no
  `merge` or `implements` (K24). Otherwise `--implements` writes `merge: replace` whatever the other options.
  `--merge remove` writes no body, and with `--template` is a usage error (`remove-with-template`, exit 2). An
  unknown `--merge` operation is a usage error (`option-invalid`, exit 2).
- R103 (UC5, E29): A `--plugin` file gets an `extends` naming another plugin only from a `--template`, since `create`
  has no `--extends`. Such a file is refused with `merge: replace`, and is written with that plugin's installed version
  recorded in `sources`, which `check` compares (R86, UC6.9).
- R28 (UC5, E30): `create --implements <id>` writes the interface's sections as `##` headings in order and
  `implements: <id>@<version>`, each section stubbed `**Unsupported.**` followed by the line saying what it holds; it
  is refused for an unknown interface (`interface-invalid`, exit 1), and is a usage error with `--template`
  (`template-with-implements`, exit 2).
- R79 (UC9, E50): `customize <name> --extends <step>...` writes `extends` listing the steps bottom first, a step written
  `<plugin>:<merge>` taking that `merge`; `--extends-file <file>` writes the YAML `extends` list it holds, with every
  key (`merge`, `extends`, `sections`). Either leaves the body and other keys unchanged; a file with no body is a
  selection. A step that is neither `default` nor a plugin holding the name is refused (`step-invalid`), and so is an
  `--extends-file` that is unreadable or not a YAML `extends` list (`extends-file-invalid`); nothing is written.
- R80 (UC9, E51): `customize --extends none` removes `extends` and deletes a file left with nothing in it; with no
  `extends` in that tier, it is refused (`no-selection`), stating what answers the name now.
- R81 (UC20, UC18, E58): `customize --request <file> --body <file>` writes the body with frontmatter `extends` (the
  picks given, else the target's existing `extends`, kept), `sources` (each source's plugin and installed version; a
  `default` source records its skill's plugin and version when the skill ships in a plugin, and no version for a
  standalone skill; for a project section, those of the main document), `request` (the file's text), and `merge`
  (`--merge`, else `patch`; none for a project section, K24); with `--implements`, see R111. The command runs no
  model.
- R82 (UC18, E58): `customize` refuses, writing nothing, each with its code (R104): with neither `--extends` nor
  `--request` (`change-missing`, exit 2); with `--in` and `--extends`, since a project section has no stack, with
  `--plugin`, or with `--in` and `--merge` or `--implements` (`options-conflict`, exit 2); with only one of `--request`
  and `--body` (`options-missing`, exit 2); with `--in` outside the root (`in-not-below-root`, exit 2); with `--request`
  when the target holds a body that records no request (`body-not-generated`, exit 1); with `--in` for a name that is
  not Markdown (`in-not-markdown`, exit 1); with `--request` and no `--extends` on an `ambiguous` name
  (`pick-required`, exit 1); and with `--request` and no `--implements` on a `missing` name under a found interface's
  namespace (`implements-required`, exit 1, R111). A body that records a request is replaced.
- R83 (UC18, E50): `customize --extends` on a target holding a body keeps the body; when that body records a request,
  the output suggests customizing again with it.
- R84 (UC20, UC18, E59): `customize --base` prints, and writes nothing, the document the generator reads for that
  target: the resolved reference with the picks applied, and with the skill's default in the stack when `--default`
  names its folder (R41). It never includes the target file itself, so a request is never applied over its own earlier
  result when revising. For a `repo` or `user` target it is the main document built without that file. For a folder
  target it is the main document plus the project sections of the folders above the target (the outer ones), not the
  target's own section nor any deeper one. With `--implements <id>` for a `missing` name, it is the interface's stub
  (R111). It leaves out the text of managed contributions always, though a managed contribution's `extends` still
  builds the stack, being structure; and the `user` tier for a `repo` or folder target, and the `repo` tier for a
  `user` target. `load` offers no way to leave tiers out or to leave out the target file.
- R109 (UC18, E50): `customize --extends` under a managed contribution whose `extends` builds the stack (R8) writes
  the picks, since the file is the customizer's, and warns `extends-not-used`, naming that managed contribution (R53).
- R85 (UC20, UC18): Customize mode shows the draft and writes only once the customizer approves; with no user present,
  it writes nothing. The written body holds no managed contribution's text. Revising (UC20), it tells the customizer of
  a recorded source that is gone before generating, and revises the main document before its project sections.
- R107 (UC5): Create mode shows the user where each section came from and offers the full document.
- R30 (UC11, E32): `delete` removes only the file at the place chosen (R24), with its metadata file for a non-Markdown
  name (R95), never a managed contribution or an installed copy, and reports the status and stack afterwards; when the
  file held a selection, the report says so and names `reference customize --extends`. A name left `missing` or
  `ambiguous` is reported, and the exit is 0. With no file there, it is refused (`no-file`), stating what answers the
  name now.
- R29 (UC5, UC11, UC18, E31): `--dry-run` prints the path and the exact content (`create`, `customize`) or the path and
  the answer afterwards (`delete`), and changes no file.
- R31 (UC5, UC18, E33): After a write, the report gives the path and points to `load <name>` for the resolved
  reference; with `--trace`, the trace shows the new file `used`.
- R32 (UC5, E34): `create` refuses a template whose top level is a single heading holding the others (a title,
  `template-title`), and writes nothing, and so does an unreadable template or one whose frontmatter is not a mapping
  (`template-invalid`); for a missing
  `description` it writes the file with a hint, not a warning.
- R111 (UC18, E67): `customize <name> --implements <id> --request <file> --body <file>` mirrors `create --implements`
  (R28) for a name nothing implements (no default and no plugin, so the name is `missing`). The generator's base
  (`--base`, R84) is the interface's stub: each section a `##` heading in order, with its "what it holds" line. The
  written document is whole and records `implements: <id>@<version>`, `merge: replace`, and the request, with no
  `sources`. A `missing` name that falls under a found interface's namespace (cardinality `one`: `<id>`; `many`:
  `<id>.<key>`), customized with `--request` and no `--implements`, is refused with `implements-required` (exit 1),
  writing nothing, and its `help` gives the `--implements` command. `--implements` with `--in` is a usage error
  (`options-conflict`, exit 2), since a project section carries no `implements` (K24); an unknown interface is refused
  as R28 says (`interface-invalid`).
