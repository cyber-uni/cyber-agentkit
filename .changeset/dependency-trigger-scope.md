---
'cyber-agentkit': minor
---

Cover the descriptions of dependency plugins' skills in a skill's trigger scope. When a skill's plugin declares
`dependencies`, `skill test`, `skill carry`, `skill migrate`, and the stale-case check now hash the description of every
skill in those plugins, and the ones they need in turn, beside the skill's own. A dependency that rewords a description
makes the trigger cases stale, so they run again and show whether the right skill still loads.
