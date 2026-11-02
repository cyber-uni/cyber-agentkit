---
"cyber-agentkit": minor
---

A reference can be renamed: a plugin's or a skill default's contribution lists its older names in `aliases`, a load of an older name resolves the new one with a `reference-renamed` warning, and a file still filed under an older name applies as the new name. An `extends` step's `sections` now limits it to those top-level sections, each with its own operation, warning `section-not-held` for one it lacks. A non-Markdown reference reads its description, tags, aliases, picks, and generated record from `<name>.meta.md` beside it, and a metadata file with `extends` alone is a selection. Combined text now carries the line `Where these sections conflict, the later text wins.` just before the first section it joined.
