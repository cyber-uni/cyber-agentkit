# Design spec

Writes, revises, and reviews the design spec of a capability, and derives tests from it. A maintainer asks for it when
a capability needs its outcome pinned down before or alongside its code, or when a spec has to be judged ready. It hands
back a spec `README.md` (and a `graph.md` when the behavior branches) whose criteria an outsider can check without
reading the code, or a review that gives pass or fail for each spec criterion with the line that fails it. It does not
plan the implementation: tasks and stack choices go to the project tracker.

| Mode | When |
| --- | --- |
| Write | write a spec for a capability, backfill one for existing code, or change what a spec says |
| Review | judge a spec, or decide whether it is ready |
| Derive tests | turn a spec's criteria into the project's own tests |

The bar a spec is judged against is in [references/criteria.md](references/criteria.md), and the decision graph format
is in [references/decision-graph.md](references/decision-graph.md). The rationale is in
`.research/design-spec-criteria`. This skill lives in `.agents/skills/` and is used in this repository only.
