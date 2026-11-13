---
"cyber-agentkit": minor
---

`/skill check` now judges how a skill is written, so a repository no longer keeps its own copy of the skill-design rules. Shape adds SHP-15 (no instruction the model would follow anyway, no opening paragraph that repeats the description), SHP-16 (no `## Why`, `## Rationale`, or `## Next Steps` section), SHP-17 (one default and when to leave it, not a menu), and SHP-18 (machine output on stdout, prose only behind `--verbose`). SHP-1 also fails a body over about 5,000 tokens, and SHP-4 asks that large reference material sit under `references/` with a stated load condition. Trigger adds TRG-8 (the description matches the body), and INT-3 also covers repeated text and stale composition. The new checks are warnings.
