---
'cyber-agentkit': minor
---

`skill attest <folder> <C3 | case id> <url> [--note …] [--by …]` records that a criterion or case passed in the
skill's real use, where the link shows it, instead of in a run. It goes in the `attested` list of
`evals/expected.json` with `source: "attested"`, the link, the time, and a fingerprint of `SKILL.md` and
`references/`. Any run result in the file stays, and an accepted run keeps the list. `skill test` and `skill report`
show it as "attested (link)", never as a pass rate, and mark it "attested, stale: skill changed since" once the skill
changed. A run's result still decides `changed` and `moved`, and a failing run is never hidden by an attested pass. A
`not-tested` entry with a current attestation counts as passed when `skill test` decides whether to save its first
result as expected. `skill check` counts an attested criterion as covered for VER-3 and VER-13, and the new warning
VER-15 reports a criterion attested with no rubric, a stale attestation, and one that names no criterion. The `skill`
skill gains an `attest` command.
