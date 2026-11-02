# reference/skill — decision graph

Decisions a consumer can observe. Criteria in [README.md](./README.md) cite the edge IDs; the parent's
[graph](../graph.md) holds the edges every child shares.

## The skill's fallback

| Edge | Decision | Outcome |
| --- | --- | --- |
| E23 | the command did not run | the skill reads its own `references/<name>.default.md`; never for a name the command reported |
| E49 | `ambiguous`, with a user present | every option listed, the pick written with `reference customize --extends` at the chosen scope; with no user, not loaded |
| E24 | a fallback used, or a name not loaded | reported to the user with the reason, except a name a `remove` turned off |
| E25 | an `invalid` name | its path is never read |
| E61 | a warning in the load's result | passed on, one line each; a stale one names the changed plugins and Customize mode |

## Loading and following

| Edge | Decision | Outcome |
| --- | --- | --- |
| E62 | the working folder in the repository, and the load line asking for routes | `--root` only when it is not; the routing option and `--in` only when asked |
| E63 | instructions conflict | company and team, then the feature's own document, then the resolved reference; the work's folder's section over the main document, inner over outer |
| E64 | the work moves into a folder | its project section followed from then on; with routes, the name loaded again with `--in` |
