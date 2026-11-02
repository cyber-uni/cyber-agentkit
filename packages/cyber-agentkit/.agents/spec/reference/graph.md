# reference — decision graph

The edges every child shares. Each child's `graph.md` holds its own; E53 was proposed and dropped, and is not
reused.

| Edge | Decision | Outcome |
| --- | --- | --- |
| E12 | the command answered or did what was asked, including a no-op, an empty answer, a name not `found`, a failed check, and `where` on an ambiguous name | exit 0; a refused write, or any other command that could not complete, exits 1 with one error value; a usage error exits 2 with one |
| E13 | a warning | in text, on stderr, and stdout is unchanged; under `--format json` or `toon`, in the record's `warnings` (R47); the exit code never changes |
| E40 | the output format | only the fields that answer; `--metadata` and `--trace` add the rest (R38) |
| E41 | a failure or warning | a stable `code`; the wording is not a contract |
| E21 | `load`, `where`, `list`, `search`, `check`, `implementations` | write no file |
