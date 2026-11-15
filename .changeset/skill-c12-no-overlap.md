---
"cyber-agentkit": patch
---

The `skill` skill's eval case `work-adds-skill` now asks for an on-call handoff skill that no sample skill covers, so it tests C12 without the research step rightly stopping to ask about adopting `release-notes`. Its C12 checks now also require the README's Research section and a report of `check`'s result, so a run without the skill no longer passes them.
