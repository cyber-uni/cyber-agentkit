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
  source, or into the `repo` or `user` tier for a name the repository or the user owns; there the `remove` operation
  turns a name off. `create` can do anything `customize` (UC18) does, by hand.
- **Entry points:** Skill: the `reference` skill's Create and Update modes; Update edits the file, then checks the
  trace. Code: `reference create <name>`.
- **Inputs:** a bare name; where it is written (the `repo` tier by default, the `user` tier, a folder's project section,
  or a plugin's or skill's source folder); the operation (default `patch`); a template or an interface; the root.
- **Outcome:** `create` writes `<name>.md` in that tier's folder with the chosen merge operation (none in a project
  section, which carries no `merge`, K24), and reports the path with a hint that `load <name>` gives the resolved
  reference. The skill shows the user where each section came from and offers the full document. A plugin or default
  file whose `extends` names another plugin records, in `sources`, the version of that plugin it was written against,
  so `check` can warn its author when the base moves on (UC6).
- **Extensions:**
  - UC5.1 The file exists with a body: error, and nothing is written. `create` never overwrites; Update edits it.
  - UC5.4 A contribution that would hide the new file: written all the same, since the hiding contribution may change
    later, with a warning naming it (UC2.7).
  - UC5.12 A plugin's file that extends another plugin, or a skill's default that extends a plugin, with
    `merge: replace`: refused, and nothing is written. The file states only the sections it changes, or, to replace the
    base entirely, is a snapshot of its own with no `extends` on that plugin.

### UC18 — Customize a reference (A5.1, A8.1)

- **Trigger:** a customizer wants to change what a skill reads for a name, for the repository, for themselves, or for
  one project folder: by picking which plugins and sections it builds on, by saying in their own words what to change
  in the prose, or both.
- **Entry points:** Skill: the `reference` skill's Customize mode. It helps the customizer pick, runs a generator
  subagent when the prose must change, shows the draft, and writes it once they approve. Code:
  `reference customize <name>`, which writes the file and its frontmatter and runs no model. It can also print the
  document the generator reads for a target, and writes nothing then.
- **Inputs:** a name; the target (the `repo` tier by default, the `user` tier, or a folder below the root); the picks,
  as UC9 gives them; the request (K22); the shape of a changed body (a delta by default, or a whole document; a project
  section takes neither, K24); for a name only an interface defines, the interface; the root; the calling skill's
  folder, for the `default` tier.
- **Outcome:** what is written depends on what the customizer ended up changing. Picks alone write a selection (UC9). A
  request also writes a body: one concise document that applies the request and keeps the stack's heading paths, by
  default a delta holding only the sections it changes, or a whole document. For a folder, it is that folder's project
  section, stating only what differs there. The generator reads the resolved reference with the picks applied (R84),
  never the target file itself, so a request is never applied over its own earlier result when revising (UC20). Nothing
  personal reaches a shared file: the generator leaves out the `user` tier when the target is `repo` or a folder. It
  leaves managed text out too, whatever the target, and writes none of it: managed text reaches the agent only at load
  (K27). The frontmatter records the picks, each source with its plugin's version (K34), and the request. A body goes
  stale as K26 says. A later `load` uses it as K23 says.
- **Extensions:**
  - UC18.1 The customizer declines the draft: nothing is written.
  - UC18.2 A request, and the target holds a body that records no request (written with `create` or by hand): refused,
    and nothing is written, since customizing would replace it. A body that records a request is replaced.
  - UC18.3 The name resolves to nothing (`missing`): the body is written from the request alone, with no sources, as a
    whole document. Under a found interface's namespace, see UC18.12 and UC18.13.
  - UC18.4 The name is `ambiguous`: the customizer picks first, then the request, if any, is applied.
  - UC18.6 The command cannot run: the skill writes nothing and says so (UC4).
  - UC18.9 Picks alone, and the target holds a body: the body is kept and only `extends` changes. A body that records a
    request was written against the old stack: the output suggests customizing again with that request.
  - UC18.10 Picks, and a managed contribution's `extends` builds the stack: the picks are written, and the command warns
    that the managed contribution decides the stack (R109).
  - UC18.12 A name only an interface defines: no default and no plugin implements it, so the name is `missing`. The
    customizer names the interface, as for `create`. The generator's base is the interface's stub alone (R84). The
    written document is a whole document recording the interface and its version, replacing the stack (R111).
  - UC18.17 The interface is named for a name that is already found: allowed; the whole implementation replaces the
    stack, and the generator's base is the interface's stub followed by the name's current resolved reference (R84), so
    it can carry content over. On a name outside the interface's namespace: refused, and nothing is written.
  - UC18.13 A `missing` name that falls under a found interface's namespace (R111), customized with a request and no
    interface named: refused, and nothing is written. The failure tells the customizer how to name the interface.
  - UC18.14 An interface implemented for one project folder: a project section for that folder, written from the
    interface's stub plus the main document and outer sections when the name is found (R84), holding every section of
    the interface. It records no `implements` or `merge` (K24); the agent's nearer-folder rule (R90) makes it win for
    work in that folder, and with no main document it alone answers there (UC1.16). So one package of a monorepo can
    implement an interface differently from the rest.
  - UC18.15 A `replace` or `remove` above would hide the target file: written all the same, with the warning R26 gives,
    naming the hiding contribution. A selection (UC9) is written likewise.

### UC20 — Revise a stale generated document (A5.4, A7.2)

- **Trigger:** load reports a generated document stale (UC1.14) and Load passes that on (UC4.6), or a customizer wants
  a generated document brought up to date after updating plugins.
- **Entry points:** Skill: the `reference` skill's Customize mode, which reads the recorded picks and request from
  the trace (UC2), runs the generator, shows the draft, and writes it once the customizer approves. Code:
  `reference customize <name>` with the same target; the command runs no model.
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
- **Entry points:** Skill: Load mode asks (UC4.2), or Customize mode (UC18). Code: `reference customize <name>` with
  the picks, given as steps or as a file holding the whole `extends` list.
- **Inputs:** a bare name; one or more steps, bottom first, each a `<plugin>` or `default`, optionally with the keys
  `merge`, `extends`, and `sections` (the top-level sections, by heading, that it contributes); the tier written to
  (`repo` by default, or `user`); the root.
- **Outcome:** `<name>.md` in that tier's folder holds an `extends` listing the steps. With no body, it is a selection
  (K16). The name then resolves through that stack (K14), as K23 says. A step with `sections` contributes only those
  sections, each with its operation; its other sections are not used. A selection is a contribution, so `list` marks
  it and the trace explains it.
- **Extensions:**
  - UC9.1 A picked plugin is no longer installed: it is skipped with a warning (R55). When every step is gone, the
    selection counts as not written and the stack falls through; a name left ambiguous is asked again (UC4.2).
  - UC9.3 The `repo` and `user` tiers pick differently: the `repo` one builds the stack and the `user` one's `extends`
    is `not used` (R8, UC7.6).

### UC11 — Remove a customization (A5.2)

- **Trigger:** a customizer wants a `repo`, `user`, or project-folder contribution gone, or an author wants one gone
  from their plugin's or skill's source.
- **Entry points:** Skill: the `reference` skill's Delete mode. Code: `reference delete <name>`.
- **Inputs:** a bare name; where it is deleted from (the `repo` tier by default, the `user` tier, a folder's
  project section, or a plugin's or skill's source folder); the root.
- **Outcome:** `delete` removes only that file, and reports what answers the name afterwards: its status, and the stack
  with what built it. The status can be `ambiguous`, with the options, when the file held the selection that ordered
  the plugins. A name left `missing` or `ambiguous` is an answer, not a failure (R43).
- **Extensions:**
  - UC11.1 No contribution there: a no-op whose answer says nothing was there and what answers the name now.
    An installed plugin's, a managed, or an installed skill's contribution is never deleted.
  - UC11.2 A qualified name: refused as a usage error, naming the bare name to use.
  - UC11.3 A dry run prints the path and the answer afterwards, and deletes nothing.
  - UC11.4 The file also holds a selection (`extends`): both go, and the report says the selection went too and how to
    restore it.
  - UC11.5 A plugin's or skill's source folder: only that folder's file goes, and only when the folder is one the
    author owns in this repository.
  - UC11.6 A non-Markdown name: its file goes, with its metadata file (K31); a selection that is a metadata file alone
    goes by itself.

## Criteria

Edge IDs are in [graph.md](./graph.md).

**Writing (UC5, UC9, UC11, UC20, UC18)**

- R60 (UC5, E26): `create` never overwrites a file with a body, nor a file that answers the name in another form. On a
  file holding only a selection, it adds the body and keeps the `extends`.
- R26 (UC5, UC18, E28): `create` and `customize` write the file even when a `replace` or `remove` above would hide it,
  because the hiding contribution may change later. They warn, naming the hiding contribution. The trace shows the file
  is not applied (R9), and `where` marks it hidden.
- R83 (UC18): picks on a target holding a body keep the body; when that body records a request, the output suggests
  customizing again with it.
- R84 (UC20, UC18): the generator's input never includes the target file itself, managed text, the tier above the
  target, or personal text. A managed contribution's `extends` still builds the stack, being structure. For a `user`
  target the stack holds only the harness's enabled plugins (R13), so a `user` document means the same in every
  repository. `customize` can print this input without writing. With an interface named, the input is the interface's
  stub, followed by the name's current resolved reference when it is found. `load` offers no way to leave tiers out.
- R109 (UC18): picks under a managed contribution whose `extends` builds the stack (R8) are written, since the file
  is the customizer's, with a warning that names that managed contribution (R53).
- R85 (UC20, UC18): Customize mode shows the draft and writes only once the customizer approves; with no user present,
  it writes nothing. The written body holds no managed contribution's text. Revising (UC20), it tells the customizer of
  a recorded source that is gone before generating, and revises the main document before its project sections.
- R107 (UC5): Create mode shows the user where each section came from and offers the full document.
- R30 (UC11, E32): `delete` removes only the file at the place chosen, with its metadata file for a non-Markdown name
  (R95), never a managed contribution or an installed copy, and reports the status and stack afterwards; when the file
  held a selection, the report says so. A name left `missing` or `ambiguous` is reported, not a failure. With no
  file there, it is a no-op saying nothing was there and what answers the name now.
- R111 (UC18): an implementation of an interface can be written by request for a name nothing implements, or for
  one already found, whose stack the whole document then replaces. The name must fall under the interface's namespace.
  The written document is whole and records the interface and its version. A `missing` name under a found interface's
  namespace is not customized without naming the interface. Naming the interface with a project folder writes a project
  section instead (UC18.14).
