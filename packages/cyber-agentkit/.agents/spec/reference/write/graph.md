# reference/write — decision graph

Decisions a consumer can observe. Criteria in [README.md](./README.md) cite the edge IDs; the parent's
[graph](../graph.md) holds the edges every child shares.

## Writing

Outcomes of `create`, `customize`, and `delete`:

- A write goes to one place, never to managed text or an installed copy (E26).
- A name already holding a hand-written body is never overwritten.
- A contribution that a `replace` or `remove` above would hide is written, with a warning (E28).
- `delete` with no file at the place chosen is a no-op that says what answers the name now (E32).
- A refused or invalid request writes nothing and names the cause.
- A dry run prints what would change and changes nothing.
- A write reports the path and points to `load` for the resolved reference.

| Edge | Decision | Outcome |
| --- | --- | --- |
| E26 | where `create`, `customize`, or `delete` writes | `customize`: the `repo`, `user`, or a folder's `<name>.md`; `create` and `delete` also a plugin's or skill's source folder in the repository; never managed or an installed copy |
| E28 | the file written is hidden by a higher `replace` or `remove` | written, with a warning naming the hiding contribution |
| E32 | `delete` finds no file at the place chosen | a no-op saying nothing was there and what answers the name now |
