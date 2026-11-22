---
'cyber-agentkit': minor
---

`skill test` with no `--case` now runs only the stale cases: a case with no expected entry, or whose own definition,
or an input of its scope, changed since its entry was recorded. `--all` runs every case. The estimate and the test
budget count only the runs selected, and the report names, for each scope, the input that changed.

A skill's evals can be grouped in scopes. An eval folder `evals/<name>/evals.yaml` beside the instructions file
`references/<name>.md` holds that part's outcome cases, with paths relative to the folder; trigger cases, shared
settings, and rubrics stay in `evals/evals.yaml`. A scope's inputs are derived from the files the skill has: its
instructions file and everything that file links or names, in turn; its eval folder; and the sections of `SKILL.md`
every part reads, where a router table row belongs to the scope of the file it links. The trigger scope's inputs are
the description and the descriptions of the plugin's other skills. A named reference counts by the content a run
resolves. Whitespace and line wrapping are not changes, and a change to the built scripts, the harness, or the
Verification implementation is reported without selecting a case. `skill carry --scope` takes any scope. An expected
entry recorded before this release has other hashes, so the first test after it runs every case once.
