---
"cyber-agentkit": major
---

`reference load` now delivers each project section, a `.agents/references/<name>.md` in a folder below the root that git does not ignore, after the main document: in text as `<project folder="...">...</project>` in path order, and in structured output as `projectSections` records, which make the entry a record. The managed contribution applies over each project section, and `search` and `list --trace` cover them. In `list --trace` rows, `selection: true` is now `kind: selection`, and a project section's row has `kind: project-section` and its `folder`.
