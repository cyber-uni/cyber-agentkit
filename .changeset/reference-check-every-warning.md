---
"cyber-agentkit": minor
---

`reference check` now reports every warning `load` raises, for every name. With no names it checks plain documents too: a defect such as an unknown `merge` value or malformed frontmatter fails the `compose` check, and a warning that depends on what is installed or chosen, such as a stale generated document, is passed on under `warned`. An ambiguous name fails; a name a `remove` turned off is listed `missing` and passes. A project section's warnings are passed on, each naming its file. Naming a plain document no longer fails the `kind` check, which is gone.
