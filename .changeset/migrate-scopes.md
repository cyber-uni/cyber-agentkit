---
'cyber-agentkit': minor
---

`skill migrate <folder>` moves a skill's evals from one list into scopes without a run. It reports a plan and writes
it only with `--write`. Each trigger case with no `id` gets one made from its prompt, which `--id <from>=<id>`
changes. Each outcome case of `evals/evals.yaml` whose ID names an instructions file (`<name>` or `<name>-...` for
`references/<name>.md`) moves into `evals/<name>/evals.yaml`, with its comments and the files folder and setup script
only it names. The cases that name none stay at the root. The expected result splits into one per scope, with each
case's known-failure marks. An old trigger entry is matched by its prompt and an old outcome entry by its ID. Each one
matched is carried to the new inputs and marked `carried by migration`, keeping the date it was recorded. A case whose
old entry no longer matches gets none, and an entry that was already behind its inputs stays stale, so the next
`skill test` runs only those. The old expected result is kept in `evals/accepted/`. A skill not migrated keeps working
as one root scope.
