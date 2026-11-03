---
"cyber-agentkit": minor
---

`reference load` now warns, with `plugin-not-selected`, when a plugin installed after a customizer picked what a name builds on also ships that name. Before, the plugin was left out with no word. The warning names the plugin and gives the `reference customize` commands that add it or leave it out. `reference customize` now records, in a new `declined` frontmatter key beside `extends`, every plugin holding the name that its picks leave out, so a plugin left out on purpose is not warned about again. To leave out a plugin load warns about, write the same picks again. When a managed `extends` builds the stack, there is no warning. A `user` pick counts only the harness's enabled plugins.
