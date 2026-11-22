---
"cyber-agentkit": minor
---

A trigger case in a skill's `evals/evals.yaml` can now carry an `id`, as an outcome case does. The expected result, the history, `skill test --case`, `skill fails`, and the list of changed cases all name it by that ID, so adding or moving a trigger case no longer renames the ones after it. A trigger case with no `id` keeps its positional `trigger-<n>` and still works; the new VER-17 check warns on it. Every case ID must be unique in the skill, and no `id` may take the `trigger-<n>` form. `skill case add --expect fire|skip` adds a trigger case with its ID.
