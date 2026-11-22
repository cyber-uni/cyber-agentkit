---
'cyber-agentkit': minor
---

Recognize blueprints. An interface whose id ends in `.blueprints` is a blueprint interface, and `reference check`
fails it, with the new `blueprint` check, unless its cardinality is `many`. A blueprint, named
`<id>.<system>.<solution>`, builds on its capability reference, `<system>.capabilities`: `check` fails one whose
capability reference cannot be found, one whose `Needs:` line names a feature that reference has no section for, and
one whose name has no solution. `reference implementations` leaves a failing blueprint out with the reason, and lists
each other one with its `system`, its `capability` reference, and that reference's `verified` entries.

Loading a blueprint warns, with the new `feature-unsupported` code, naming the section and the feature, for each
needed feature the capability reference, as resolved here, marks `**Unsupported.**`; `check` reports the warning and
does not fail on it. A blueprint whose capability reference is missing still loads, with a warning. Loading runs no
command and compares no version.
