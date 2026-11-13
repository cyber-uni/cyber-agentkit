# Reference interface registry

One Markdown file per registered reference interface, in `interfaces/`, named `<id>.md`. The
documentation site lists, shows, and searches them under "Reference interfaces".

Registering is optional. Using an interface never needs it, and `reference` load, list, and check
never read this folder.

An entry has a header and a free-text body. Only `id` is required, and it must match the file name.

```md
---
id: release-notes-source
description: Where a release's notes come from.
plugins:
  - name: my-plugin
    url: https://github.com/me/my-plugin
implementations:
  - name: changesets
    url: https://github.com/me/my-plugin/blob/main/references/release-notes-source.changesets.md
usage:
  - name: my-plugin:release
tags: [release]
status: draft
interface: https://github.com/me/my-plugin/blob/main/references/release-notes-source.interface.md
---

Why the interface exists, and how implementations differ.
```

`plugins`, `implementations`, and `usage` each list a name, or a name with a `url`. The entry
points at the interface document; it never copies it.

Add one with `npx -y cyber-agentkit reference register <id>`. It looks the id up first, then opens
a pull request or an issue once you confirm. An update or a removal is a pull request that edits
the file. The site build fails on a link in an entry's header that no longer resolves.
