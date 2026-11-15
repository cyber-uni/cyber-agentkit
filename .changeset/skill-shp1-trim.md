---
"cyber-agentkit": patch
---

`/skill fix` gives SHP-1 (the `SKILL.md` body is too long) ways to trim instead of "shorten it": drop dead text, move
a section one command reads to a reference, tighten the prose, or move checkable detail to a script. It estimates
what each saves before changing anything, offers them at `ask`, and at `apply-safe` and `apply` keeps each only when
`test` is no worse. The `skill` skill's own `SKILL.md` now passes SHP-1.
