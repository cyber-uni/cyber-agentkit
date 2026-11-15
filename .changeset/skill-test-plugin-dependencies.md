---
"cyber-agentkit": minor
---

`skill test` now loads the plugins a skill's plugin declares in `dependencies`, and theirs, in both arms. Claude Code
does not start a plugin whose dependency is missing, so before this every run of such a plugin loaded no skill and
was still scored. Each dependency comes from a folder passed with the new `--plugin <folder>` option, else from Claude
Code's installed plugins. The test stops before any run with `error: dependency-missing:` when a dependency is found
in neither, and with `error: plugin-load:` when Claude Code reports that a plugin a run loads does not load.
`--backend plugin-eval` cannot load a second plugin, so it stops with `error: dependency-unsupported:` for a plugin
that declares dependencies.
