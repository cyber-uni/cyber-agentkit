---
"cyber-agentkit": patch
---

`reference load` and `reference check` now report a qualified-name override, a `<plugin>/<name>.md` in a subfolder of `.agents/references/` or `~/.agents/references/` (or a project folder's), with `reference-legacy-format`. No version read these files, so the override never applied. `reference migrate` plans each one, and `--write` moves it to `<name>.md` with `extends: [<plugin>]`. It leaves the file to you when the plugin is not installed (the row says what it would extend), when the name already has a file there, or when it sits in a project folder (the row gives the `reference customize` to run at the root).
