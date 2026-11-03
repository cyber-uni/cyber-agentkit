---
"cyber-agentkit": major
---

`reference show` is renamed `reference load` (no alias), and `ReferenceCommands.show` is now `load`. Errors follow clibuilder's axi contract: a command that cannot complete (exit 1) or was called wrongly (exit 2) prints one error value on stdout with a stable `code` from the new `referenceCodes` table, and a command that answered exits 0, including `load` for a name not found (`<reference name status code>` in text), a failing `check`, `where` on an invalid name, and an empty `list`, `search`, or `implementations`. Library functions throw the exported `ReferenceError` with that code, and a name a `remove` turned off now has the code `reference-removed`.
