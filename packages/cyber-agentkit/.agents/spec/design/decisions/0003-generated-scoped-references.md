# 0003 — References are generated at authoring time and scoped by folder

**Status:** accepted (2026-11-02). The design lives in the [reference spec](../../reference/README.md); this record
keeps the reasons. It supersedes the pin file, default marker, and ambiguity hint that #110 proposed.

- **A model runs when a customizer writes, never when a name loads (N14).** Layering contributions mechanically
  produces instructions that work but cannot make them concise. A generator reads the resolved reference and the
  customizer's request, and writes one document that applies it. Load stays deterministic and needs no model.
- **Folder-specific instructions are project sections, delivered up front (N15).** A `.agents/references/<name>.md`
  below the root states only what differs in its folder, and load delivers every one after the main document, wrapped
  in `<project folder="...">`. Following the agent's working folder would need hooks or a reload, and some
  organizations turn hooks off.
- **No routing table; every project section is inlined (N17).** No one can predict which folders the agent touches
  after it loads a name, nor rely on the agent to open a route when its work moves. Behavior correctness outranks
  context cost.
- **Load applies the stack, then `user`, then `repo`, then managed (K23).** The earlier rule, "the nearest full
  document wins", belonged to the snapshot model and was dropped when merging came back. Keeping documents portable
  limits only what is written, not the order load applies them in.
- **Managed text never appears in a written file (R84, R85).** An admin's managed contribution is policy. The generator
  reads with managed text left out (`customize --base`), and the runtime merge applies it at load. A managed
  contribution's `extends` is structure, not text, so it still builds the stack the generator reads.
- **Staleness compares plugin versions only, with no content hash (N8).** A generated document records each source's
  plugin version; load reports it stale when one changes. A hash and a compiled cache at load were rejected: a changed
  request is a reason to generate again, not something load should detect.
- **A generator's input never includes the file it replaces (R84).** Otherwise revising a document applies the request
  over its own earlier result.
- **A file a `replace` or `remove` above would hide is written, with a warning.** The hiding contribution, managed
  ones included, may change later, so the customizer's intent is kept; `where`, `check`, and the trace show it is not
  applied.
- **Exit values follow clibuilder's `axi` contract (R43).** A command that answered exits 0, even when a name is
  not `found` or a check fails: those are statuses in the result. Exit 1 means it could not complete, exit 2 that it
  was called wrongly, each with one error value on stdout.
- **The plugin tier reads only the root's `package.json` (R13).** The nearest one to the working folder would change
  the main document with the folder a session starts in. A per-package difference goes in a project section:
  `customize --in <folder> --implements <id>` lets one monorepo package implement an interface its own way. Scoping a
  workspace package's plugins to its folder is a follow-up.
- **A plugin-root `references/` is this library's convention (R13).** It is not part of the Agent Plugins spec, and no
  harness reads it (`.research/skill-resolution`), so the plugin tier is this library's to define.
- **The skill passes `--default`.** Every detected harness tells a loaded skill its folder, but none hands it to a
  script (`.research/skill-resolution`, D).
- **A plugin or default file that extends a plugin may not `replace` it.** A copy would freeze every user on the
  base its author saw; the file states only the sections it changes, or is a snapshot with no `extends`.
- **A default's `merge` matters.** A default can extend a plugin through its own `extends`, and R8 brings each
  step's `extends` beneath it, so the default can sit above that plugin.
- **A `user` document uses only the harness's enabled plugins (R84).** It applies in every repository, so it must not
  depend on one repository's `package.json`.
- **The spec stays at design level; functional detail lives in the tests.** Four review rounds kept surfacing
  command-line edge cases: flag combinations, which error wins, option checks. Prose settles those poorly, and code
  and tests settle them well. The spec keeps the outcomes a skill, agent, customizer, or admin relies on, and the
  statuses a skill acts on. Code names, exit lists, flag rules, and field lists left it for the build issue as test
  cases; commit `cc92439` holds the last full text. This departs from the design-spec rule that counts the public
  names a consumer depends on, such as error codes, as outcome: here the tests own them.
- Rejected:
  - A pin file and a default marker (#110): a written `extends` selection does the same job and records the order.
  - Briefs (`.brief.md`): a brief does nothing until someone generates, and its author cannot test it.
  - A notice for contributions that are not applied: noise.
- A written `extends` is the whole stack: a plugin installed later waits until a customizer adds it. A notice for that
  case is a follow-up.
