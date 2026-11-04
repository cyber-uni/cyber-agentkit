# reference — decision graph

The edges every child shares. Each child's `graph.md` holds its own; E53 was proposed and dropped, and is not
reused.

| Edge | Decision | Outcome |
| --- | --- | --- |
| E12 | the command answered or did what was asked, including a no-op, an empty answer, a name not `found`, and a failed check | exit 0; a command that could not complete exits 1 with one error value; a usage error exits 2 with one |
| E40 | the output format | only the fields that answer; the rest are opt-in |
| E41 | a failure or warning | a stable `code`; the wording is not a contract |
| E21 | `load`, `where`, `list`, `search`, `check`, `implementations`, `migrate` without `--write` | write no file |
