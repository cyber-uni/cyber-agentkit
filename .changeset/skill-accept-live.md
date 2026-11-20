---
'cyber-agentkit': minor
---

`skill accept <folder> --criterion <ID> --live <url>` (or `--case <id>`) records that a criterion or case passed in
the skill's real use, with its evidence link, an optional `--note` and `--by`, the time, and a fingerprint of
`SKILL.md` and `references/`. It goes in the `live` list of `evals/expected.json`, beside any run result, and an
accepted run keeps it. `skill test` and `skill report` show it as "verified live (link)", never as a pass rate, and
mark it stale once the skill changed. A run's result still decides `changed` and `moved`, and a failing run is never
hidden by a live pass. `skill check` counts a live pass as covered for VER-3 and VER-13, and the new warning VER-15
reports a criterion verified live with no rubric, a stale live pass, and one that names no criterion.
