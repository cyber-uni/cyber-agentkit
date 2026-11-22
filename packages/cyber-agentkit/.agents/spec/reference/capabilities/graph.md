# reference/capabilities — decision graph

Decisions a consumer can observe. Criteria in [README.md](./README.md) cite the edge IDs; the parent's
[graph](../graph.md) holds the edges every child shares.

## Checking

| Edge | Decision | Outcome |
| --- | --- | --- |
| E80 | a name `<system>.capabilities` | checked as a capability reference: System, Detect, Verified first, in order, and no `implements`, or it fails |
| E81 | a section opening `**Partial.**` or `**Unsupported.**` | a sentence must follow, or it fails |
| E82 | a required section marked `**Partial.**` | present; listed partial by `implementations` |
| E83 | an interface id ending `.blueprints` | its cardinality must be `many`, or the interface fails |
| E84 | an implementation of a blueprint interface | its `<system>.capabilities` must be `found` and hold every feature its `Needs:` lines name, or it fails and `implementations` leaves it out |
| E85 | `implementations` of a blueprint interface | each blueprint with its system and its capability reference's Verified entries |

## Loading

| Edge | Decision | Outcome |
| --- | --- | --- |
| E86 | `load` of a blueprint | returned; a warning per needed feature the resolved capability reference marks unsupported, or one warning when that reference is not `found`; no command runs |
