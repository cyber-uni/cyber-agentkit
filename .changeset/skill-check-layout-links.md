---
"cyber-agentkit": minor
---

`/skill check` now checks a skill's folder layout and links by script. SHP-2 also finds a plain-text path under the skill's own folders that names no file (`scripts/missing.sh`) and an `#anchor` link that matches no heading. New Shape checks: SHP-7, `SKILL.md` sits in its own folder directly under a `skills` root; SHP-8, a skill that ships to others points to no file outside its folder; SHP-9, `skill.json`, when present, is valid; SHP-10, the skill folder holds only the standard folders, and `agents/` holds YAML only; SHP-11, static resources are in `assets/` and the root holds no extra Markdown. SHP-7 to SHP-9 are critical; SHP-10 and SHP-11 are warnings.
