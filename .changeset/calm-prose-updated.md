---
"cyber-agentkit": minor
---

Add the `prose-update` skill, the `prose-update` command (`classify` and `retire`), and the library functions `classify`, `parseHistory`, and `retire`. Given the wording a tool offers now, the text found in a file, and the wordings the tool retired, they divide the text into parts by heading, find the retired wording the found text descends from, and return for each part whether it is current, the merged text with the owner's sentences kept, or the sentences that collide. The same inputs give the same answer, with no model involved.
