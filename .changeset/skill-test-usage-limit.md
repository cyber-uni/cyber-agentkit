---
"cyber-agentkit": minor
---

`skill test` reports a run that hits the account's usage limit as `limit reached`, not as not run. Once one does, no
new run starts. The runs the limit left count toward no pass rate, and a case with none of its runs finished reads as
not run. The result is marked incomplete: it is never saved as the expected result, and `skill accept` refuses it. The
report and the progress lines say the limit was reached, when it resets, and which runs are left. After the reset,
`skill test --resume` runs only those runs, with the options the stopped run had, and merges them into one result.
