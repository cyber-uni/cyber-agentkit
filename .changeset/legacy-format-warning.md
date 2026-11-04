---
"cyber-agentkit": minor
---

`reference load` and `reference check` now warn `reference-legacy-format` on each file still in a form version 1 wrote: `merge: merge-sections` (now no `merge`, since `patch` is the default), `merge: first-wins` (now `merge: replace`), `overrides` (now `extends`), a skill's default at `references/<name>.md` (now `<name>.default.md`, warned when the skill's folder is given), and a selection `reference select` wrote in a folder below the root. Each is still read as before, and the warning names its 2.0 form and the fix: `reference migrate`. `merge-sections` and `first-wins` no longer warn `merge-unknown`, and `check` still fails the `compose` check on them. A plugin can declare renames in `references/_renames.yaml`, a mapping of each older name to its new name; a load of an older name warns `reference-renamed` with the new name, and an entry that is not a pair of bare names warns `rename-invalid`.
