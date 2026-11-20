# Attest a pass

Record that a criterion or case passed in the skill's real use, where a link shows it, for a check a run cannot judge
cheaply, such as one that needs a real merge request. It runs nothing.

## 1. Find it

Find the skill as [check](check.md) does.

## 2. Take the target and the link from the author

Attest only when the author asks to and names both: the criterion (such as `C3`) or the case ID, and the link to where
it passed, such as a merge request thread or a pipeline. When either is missing, ask for it and write nothing. Never
attest a pass on your own judgment, from a reply or log you read, or to make `check` pass.

## 3. Record it

```sh
node <this skill's folder>/scripts/cyber-agentkit.mjs skill attest <skill folder> <C3 | case id> <url> [--note "<what happened>"] [--by <who>]
```

It adds an entry to the `attested` list of `evals/expected.json`, with `source: "attested"`, the link, the note, who and
when, and a fingerprint of `SKILL.md` and `references/`. A run result already in the file stays, and an accepted run
keeps the list. A second attestation of the same target replaces the first.

## What it changes

- `test` prints `C3: attested (<url>)` beside the run's own line, never as a pass rate. When the run fails it, the line
  adds `this run fails it, and the run decides`: the run decides `changed` and `moved`.
- Once `SKILL.md` or a reference changes, `test`, `check`, and `report` mark it `attested, stale: skill changed since`.
  Ask the author to check the changed skill in real use again; never renew it for them.
- `check` counts an attested criterion as covered for VER-3 and VER-13, and VER-15 warns `attested, no rubric`.
- A `not-tested` entry with a current attestation counts as passed when `test` decides whether to save its first result
  as expected.

## Report

Say what was attested, the link, and the file written. A failure seen in real use is not attested: write a case that reproduces it, and mark it with [fails](fails.md).
