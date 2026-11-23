---
'cyber-agentkit': minor
---

Warn when a shared section makes one edit re-run every eval scope. The new Shape check SHP-22 of `skill check`
warns when the shared sections of a skill's `SKILL.md` link a file, or name a reference section, that the parts' own
instructions use in fewer than all of the parts. It names the link or section, the parts that use it, and how many
cases an edit to it would re-run, and its fix is to move the text or the link into the parts that use it. It stays a
warning and hides no dependency. `skill test --estimate` adds the same hint when a single input stales every scope.
