---
'cyber-agentkit': patch
---

`skill test` exits 0 when the only gaps are planned skips, such as a case with an outside effect, a `not-tested`
criterion, or an attested pass, and exits 1 on a harness failure: a run that started and errored, or no run finished
though the plan ran some case. Each `notRun` entry now carries `kind`, `skipped` or `failed`, and the text report
starts each line with `skipped:` or `failed to run:`. A result saved before `kind` was recorded reads an entry that
names a run as a failure.
