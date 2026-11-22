---
'cyber-agentkit': minor
---

Declare the harnesses you use, for harnesses detection cannot find, such as the Cursor IDE and Copilot in VS Code.
`cyber-agentkit harness add <id>...` writes the repo declaration (`.agents/references/harnesses.yaml`), or the user
one with `--scope user`; `harness remove` and `harness list` go with it. The repo and user declarations combine. An
ID that is not one of `harnessIds` is refused, and the error names the valid IDs.

`presentHarnesses({ all: true })` adds every declared harness with source `declared`, and each entry gains `sources`,
so a harness both detected and declared is listed once with both. `declaredHarnesses()` reads the declarations.
`cyber-agentkit` with no command reports `declared`, and `skill doctor --all-harnesses` checks each declared harness
and marks every report `detected: <source>` or `declared`.
