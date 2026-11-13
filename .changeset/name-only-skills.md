---
"cyber-agentkit": minor
---

`skill check` recognizes a name-only skill, one another skill loads by name and no user request should match, by its description: `By name only`, or a `Partial Skill:` lead. For such a skill it checks that the description takes that form with no trigger phrase (TRG-5, a critical script check) and carries no operational detail or trigger language (TRG-6, a read check and a warning), skips TRG-1 and TRG-4, and asks VER-2 for `skip` trigger cases only. A check that does not apply is reported with the new `skipped` status, counted in the report's `skipped` total, and an aspect whose checks all pass or are skipped passes.
