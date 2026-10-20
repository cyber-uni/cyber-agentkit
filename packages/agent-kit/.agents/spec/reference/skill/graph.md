# reference/skill — decision graph

Decisions a consumer can observe. Criteria in [README.md](./README.md) cite the edge IDs; the parent's
[graph](../graph.md) holds the edges every child shares.

## The skill's fallback

| Edge | Decision | Outcome |
| --- | --- | --- |
| E23 | the command did not run | the skill reads its own `references/<name>.default.md`; never for a name the command reported |
| E49 | `ambiguous`, with a user present | every option listed, the pick written with `reference select`; with no user, not loaded |
| E24 | a fallback used, or a name not loaded | reported to the user with the reason, except a name a `remove` turned off |
| E25 | an `invalid` name | its path is never read |
