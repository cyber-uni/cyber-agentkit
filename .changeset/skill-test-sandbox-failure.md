---
"cyber-agentkit": minor
---

`skill test` now reports a run whose shell the test sandbox broke (`bwrap: Can't create file at …: Read-only file system`) as a **sandbox failure**, not as a skill failure. Such a run counts toward no pass rate, the result lists it under `sandboxFailures` and counts it per case as `sandboxFailed`, and the report warns of it first. A result with sandbox failures is not saved as the expected result, by the first passing run or by `--accept`, until the author runs `skill accept` on it. The errors recognized live in one list, so more can be added. Results saved before this change read as before.
