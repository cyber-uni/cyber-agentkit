---
'cyber-agentkit': patch
---

`reference defaults` and the skill audit now read a load line whose reference name contains a dot, such as `project-tracker.levels`. A dotted name no longer goes unread, so its bundled `<name>.default.md` is no longer reported as an orphan, and an interface with a dotted id gets its copy.
