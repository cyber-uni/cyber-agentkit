---
'cyber-agentkit': minor
---

A reference's `extends` step can now name another reference as `<plugin>/<reference>`, and YAML and JSON references
merge key by key. A file in the managed, repo, or user tier picks the reference; a plugin's own `extends` cannot, and is
skipped with a warning. A data file that writes `extends` merges over what its steps bring: mappings merge, an array
replaces the lower one, and `null` removes a key. TOML and plain text still answer whole, and `check` warns. A cycle
in a written `extends` is now reported, like one among plugins. `customize` writes only the keys you change plus the
`extends` line, and `check` fails on a named reference that is missing, a cycle, or data that does not parse. A
generated document's sources record the reference a step named. A `<plugin>/<name>` entry in a version 1 `overrides`
is no longer read as the plugin: `reference migrate` leaves it to you, with a warning. The reference format is now
2.1, because an older reader treats an `extends` list holding a slash step as not written.

`skill test`'s sandbox takes its `extends` from the reference system. Put `extends:
[cyber-agentkit/skill-design.test.sandbox.<template>]` in `skill-design.test.sandbox.meta.md` beside a YAML file of
only the settings you change. The `extends` key inside the YAML still works, with a warning to move it.
