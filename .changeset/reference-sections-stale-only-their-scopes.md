---
'cyber-agentkit': patch
---

Make an edit to one section of a reference stale only the eval scopes that name it. A named reference with `##`
sections is hashed as its text before the first section plus each section the scope's own text names by its heading, so
`skill test` re-runs only the cases of scopes that depend on the edited section. A scope that names none of the
sections, or a reference with no sections, still goes stale on any change.
