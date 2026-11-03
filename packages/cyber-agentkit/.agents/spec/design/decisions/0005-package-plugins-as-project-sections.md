# 0005 — A workspace package's plugins reach its folder as project sections

**Status:** accepted (2026-11-03). Settles the follow-up [0003](0003-generated-scoped-references.md) left open on R13;
the rest of 0003 stands. The design lives in the [reference spec](../../reference/README.md) (K36, UC21, R115).

- **A package plugin adds a project section, never a plugin layer (K36, R115).** The plugin tier still reads only the
  root's `package.json`, so the main document stays the same from every working folder (0003). A plugin a package
  declares reaches its folder the way every folder-specific instruction does: delivered up front, wrapped with its
  folder (N15, N17).
- **The folder's own section follows the plugin's, and wins in that folder (R90).** A customizer's section for the
  folder is written over what the plugin supplies, as `repo` applies over the stack.
- **A plugin the plugin tier holds, or an outer package declares, adds no section.** It already reaches the folder.
- **A package plugin's `merge`, `extends`, `implements`, and `aliases` are dropped silently.** They are valid on the
  plugin's own file, which also serves repositories that put it in the stack; a warning would blame the package for
  the plugin's authoring.
- **Which `package.json` counts follows project folder discovery.** Any one in a folder git does not ignore, so no
  workspace configuration of any package manager is parsed.
- Rejected:
  - A separate main document per package, composed with the package's plugins added to the stack. The repository's
    written `extends` would leave the package's plugin `not used`, two implementations with no order between them
    make the name `ambiguous`, and a second whole document doubles what the agent reads.
