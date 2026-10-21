---
"cyber-agentkit": minor
---

Rebuild reference resolution around a stack. Breaking.

Contributions compose bottom first: the plugins and the calling skill's default (the stack), then user, then project, then managed. Each applies over everything below it with one of four operations, written as frontmatter `merge`, on a step of `extends`, or on one section as `<!-- merge: <operation> -->`:

- `patch`, the default: keeps what is below and puts each section's text in place of the text it matches by heading path. **A file with no `merge` used to be `first-wins` and replace everything below; it now patches.** Write `merge: replace` to keep the old behavior.
- `combine`: keeps what is below and adds each section's text after the text it matches. **Lower text now comes first, and where combined text conflicts, the later (higher) text wins**; the document says so once at the top. It used to put the higher layer first and let the first one win.
- `replace`: drops everything below.
- `remove`: drops everything below. With nothing above it, the name is `missing`.

`merge-sections` and `first-wins` are gone (an unknown `merge` is read as `patch`, with a warning), and so is `overrides:`. Frontmatter `extends` lists what a contribution builds on, bottom first: plugins by their manifest name, and `default`. The highest written `extends` in the managed, project, or user tier builds the stack; otherwise the plugins' own `extends` order them, and plugins nothing orders make the name `ambiguous`. A qualified `<plugin>/<name>` builds that plugin's own stack.

- New `reference select <name> <option>... [--scope user] [--clear]` writes the `extends` that settles an ambiguous name or picks a stack.
- A skill ships its default as `<skill>/references/<name>.default.md`; `show --default <skill folder>` (and `where --default`) reads it as the `default` tier. `create` and `delete` take `--plugin <plugin folder>` and `--default <skill folder>` for a plugin's or a skill's source in the repository, and `create` takes `--merge <operation>`.
- Output is agent-first. In `--format json`, `show` gives each found name's content as a string, and a record only for a failure or warnings; `--metadata` adds `status` and `metadata` (which leaves out `merge` and `extends`), and `--trace` adds the trace. `list` gives one row per name (`--trace` adds the rows per layer). `search` no longer echoes the query. `check` gives the failures and a pass count. `implementations` gives each `pin`, `description`, and `unsupported`. Empty fields are left out.
- Every warning is `{code, message}`; a name not found carries `reference-missing`, `reference-ambiguous`, or `reference-invalid`, and an ambiguous name's choices are `options` (was `plugins`). In text, failures and warnings print as `error: <code>: <message>` and `warning: <code>: <message>`. `<reference>` blocks no longer carry `tier`. `where` on an ambiguous name exits 0.
- A bad name is a status (`invalid`) in its own entry instead of an error that fails the whole call, and the library never throws for one. A name ending `.default`, or qualified by an npm package name, is invalid.
- Only `<name>.md` and `<name>/README.md` answer a name; `<name>/index.md` and `<name>/SKILL.md` no longer do. The library's own managed folders (`/etc/buddy-agent-harness/...` and equivalents) and every `governances/` folder are no longer read. A dependency joins the plugin tier only when it has a plugin manifest, named by the manifest's `name`.
