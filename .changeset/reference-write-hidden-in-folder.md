---
"cyber-agentkit": major
---

`reference create` now writes a file a `replace` or `remove` above hides, warning `reference-hidden` (or `repo-hides-user`) instead of refusing, and `create`, `delete`, and `where` take `--in <folder>` for a folder's project section (`in-not-below-root`, `in-folder-missing`, `in-folder-ignored`); `create` refuses a file answering the name in another form (`file-exists`), a plugin or default file extending a plugin with `merge: replace` (`extends-replace`), and an `--implements` name outside the interface (`name-outside-interface`), accepts `--merge` with `--default`, records `sources` for a plugin or default file that extends a plugin, and stubs each section with what it holds. `delete` removes a non-Markdown file's `<name>.meta.md` too and points to `reference customize --extends` for a lost selection; `where` now reports `files` (with `hiddenBy`), `headings`, and `used` instead of `places`; and `createReference` and `deleteReference` are exported.
