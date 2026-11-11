---
'cyber-agentkit': minor
---

`reference customize` and `reference implementations` accept a family, `<prefix>.*`, for every interface under a
prefix at once. One customize writes the same picks for each interface those picks can answer and names the ones it
skipped. `implementations` now also reports which implementation is in use for a `one` interface (`inUse`), with or
without a family.
