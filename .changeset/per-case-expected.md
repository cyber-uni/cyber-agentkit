---
"cyber-agentkit": minor
---

`skill test` keeps a skill's expected result as one entry per case, keyed by its ID, in `evals/expected.json`. Each
entry records the case's result per criterion, the model, when it was recorded, and the hashes of its own definition and
its scope's inputs. An accept, `skill accept` or `skill test --accept`, now takes a run of some cases (`--case`) or one
the usage limit stopped, and writes only the entries of the cases that run finished; every other entry stays as it was,
and a case the evals no longer hold loses its entry. A case with no entry whose runs pass gets one without an accept. A
criterion's expected result is computed from the entries of the cases that test it, and `skill report` gives the oldest
date when they differ. The new `skill carry` carries entries forward to the current inputs with a reason, without a run;
a carried entry is shown as carried, never as a pass from a run. A version 1 `expected.json` is still read as it is, and
is written in the new form on the next accept.

In the `skill test` JSON report, `savedAsExpected: true` is replaced by `expectedWritten`, which names the cases written
and whether by an accept or by a first pass; `notSavedAsExpected` lists each case left without an entry with why, and
`expectedHeld` lists the cases held back for sandbox failures.
