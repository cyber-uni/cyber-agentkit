---
"cyber-agentkit": patch
---

`skill check` flags a skill that reads a reference's bundled default directly instead of loading it with the `reference` skill (SHP-19). The default is the fallback only for when that command cannot run, so the user and plugin override tiers still apply.
