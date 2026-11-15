---
'cyber-agentkit': minor
---

`skill case add` now writes the new case into `evals/evals.yaml` where it goes, and `skill case remove` cuts only
the removed case, so every other entry keeps its formatting: folded `script:` checks stay folded and `[C4]` stays
`[C4]`. `skill case add` also takes `--criteria C1,C2` and `--check <ID>=<script>` (repeatable), so a case's
criteria and `script` checks no longer go in by hand.
