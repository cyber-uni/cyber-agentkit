---
'cyber-agentkit': minor
---

A skill whose evals are grouped in scopes keeps each scope's expected result in its eval folder:
`evals/<name>/expected.json` holds the entries of that part's cases, and `evals/expected.json` holds the trigger and
root entries, the settings of the last write, and the attested passes. Each scope keeps its own past accepted results
in its `accepted/` folder, and an accept moves only the file of a scope whose entry it replaces. `skill test`,
`skill accept`, `skill carry`, and `skill report` read every scope's file as one. The single-file form, one
`evals/expected.json` for every case, is still read, and is split on the next write.
