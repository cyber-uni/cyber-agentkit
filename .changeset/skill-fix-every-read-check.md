---
"cyber-agentkit": patch
---

The `skill` skill's `check` decides every `read` check it lists, one ID at a time, and `fix` decides them all before
its first repair, so a fault such as SHP-3 is no longer missed without a word. `fix` also writes its autonomy line
again at the top of the reply that ends the run, even when an earlier message already stated it.
