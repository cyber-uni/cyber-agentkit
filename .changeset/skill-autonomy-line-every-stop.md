---
"cyber-agentkit": patch
---

The `skill` skill opens every `create`, `fix`, and `enhance` reply with its autonomy line, even when the run stops
before any change, and takes the test budget from `skill-design.autonomy` as loaded instead of assuming one. Its ways to
trim a skill over its length limit move to `fix`'s steps.
