---
"cyber-agentkit": patch
---

`prose-update classify` no longer reports `tied-base` when one retired wording contains another. Among wordings that
share the most sentences with the found text, the base is the one with the fewest sentences the found text lacks, so a
section that still holds an older wording updates from it. `tied-base` remains for wordings still equal after that.
