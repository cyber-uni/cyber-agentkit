---
"cyber-agentkit": minor
---

`skill check` reads a router skill's per-command criteria: CRI-1, CRI-2, VER-3, and the other checks that map rubric IDs to criteria now read the `## Done when` of each `references/` file `SKILL.md` links, as well as `SKILL.md`'s own. A duplicate `C<n>` across files fails CRI-2 and names both files. `skill attest` and `skill report` read the same criteria.
