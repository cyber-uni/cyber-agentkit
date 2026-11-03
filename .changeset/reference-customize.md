---
"cyber-agentkit": major
---

`reference select` and its `--clear` are removed in favor of `reference customize`, which picks what a name builds on (`--extends <step>...`, `--extends-file`, `--extends none`), writes a body generated from a request with its picks, sources, and request recorded (`--request <file> --body <file>`, with `--implements` for a whole implementation, `--in` for a folder's project section, and `<name>.meta.md` for a non-Markdown name), and prints the generator's input without writing (`--base`). It runs no model; `customizeReference` does the same from the library.
