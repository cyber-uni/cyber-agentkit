# reference/interfaces — decision graph

Decisions a consumer can observe. Criteria in [README.md](./README.md) cite the edge IDs; the parent's
[graph](../graph.md) holds the edges every child shares.

## Checking interfaces

A failure is an entry in the result, not an error. A defect in the document itself, found while composing, fails the
check; other warnings are passed on.

| Edge | Decision | Outcome |
| --- | --- | --- |
| E35 | a named reference `missing`, `ambiguous`, or `invalid`, or neither an interface nor an implementation | a failure entry |
| E52 | an interface's own block malformed | a failure entry |
| E36 | an implementation against its interface | a required section left out or marked unsupported fails; an optional one is listed unsupported |
| E60 | a plugin or default file whose recorded base version differs from the installed one | `check` warns, never a failure; `load` says nothing |
| E37 | `implementations` of an interface | an unknown interface is an error; otherwise the candidates that pass, or an empty answer |
| E38 | `check` with no names | every interface document and implementation; a name several plugins hold also as each `<plugin>/<name>`; each skill's default as its skill loads it |
| E39 | `load` of a document failing its interface | printed, with a warning naming the check |
| E68 | a `repo`, `user`, or project-section file hidden by a higher `replace` or `remove` | `check` warns, never a failure (R112) |
