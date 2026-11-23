---
'cyber-agentkit': patch
---

Make an edit to one command's instructions stale only the cases that read it. A skill's root eval scope no longer
reads the router rows of `SKILL.md`, nor the instructions files they link, so `skill test` re-runs the root cases only
when the shared text of `SKILL.md` or a file the shared text reaches changes.
