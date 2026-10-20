# reference — decision graph

The edges every child shares. Each child's `graph.md` holds its own; E53 was proposed and dropped, and is not
reused.

| Edge | Decision | Outcome |
| --- | --- | --- |
| E12 | every name `found`, or `where` on an ambiguous name | exit 0; a name not `found`, a failed check, or a refused write exits 1; a usage error exits 2 |
| E13 | a warning | never changes stdout or the exit code |
| E40 | the output format | only the fields that answer; `--metadata` and `--trace` add the rest (R38) |
| E41 | a failure or warning | a stable `code`; the wording is not a contract |
| E21 | `show`, `where`, `list`, `search`, `check`, `implementations` | write no file |
