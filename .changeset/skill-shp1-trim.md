---
'cyber-agentkit': patch
---

The `skill` skill's main instructions are back under the 5,000-token limit its own `skill check` enforces (SHP-1): the Fix steps for the Shape and Trigger aspects now live in the `fix` command's instructions, and the Intent draft step in `create`'s.

`skill check` gets a decision aid for SHP-3: a step that filters, sorts, groups, counts, or formats data by fixed rules fails it, however short, unless it runs a script.
