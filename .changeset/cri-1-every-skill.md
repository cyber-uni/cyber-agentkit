---
"cyber-agentkit": patch
---

`/skill` now states that every skill needs a `## Done when` section, including a skill that only another skill loads, and that CRI-1 stays critical for all of them. A CRI-1 failure now shows the section to add: `## Done when`, then at least one `- **C1.** <a statement true or false of the result>` item.
