# Reference registry

Two areas, each one Markdown file per entry:

- `interfaces/<id>.md`: a registered reference interface. The documentation site lists, shows, and
  searches them under "Reference interfaces".
- `capabilities/<system>.md`: a registered system, with the plugins that ship its capability
  reference, `<system>.capabilities`, and the blueprints built on it. The site lists, shows, and
  searches them under "Capability references".

Registering is optional. Using an interface or a capability reference never needs it, and
`reference` load, list, and check never read this folder.

## Interfaces

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
a pull request or an issue once you confirm.

## Capability references

One entry per system, so a plugin author can see whether a system is already described before
writing a capability reference of their own. Only `system` is required, and it must match the file
name. A system is one name segment, with no dot.

```md
---
system: asana
description: Asana, a work-management service.
plugins:
  - name: cyber-asana
    url: https://github.com/me/cyber-asana/blob/main/references/asana.capabilities.md
blueprints:
  - name: project-tracker.blueprints.asana.sections
    url: https://github.com/me/cyber-asana/blob/main/references/project-tracker.blueprints.asana.sections.md
tags: [tracker]
status: draft
---

How the plugins' capability references differ, and what each blueprint is for.
```

`plugins` lists each plugin that ships `<system>.capabilities`; `blueprints` lists each blueprint
built on it, by its full name, `<interface>.blueprints.<system>.<solution>`. Each is a name, or a
name with a `url`. A blueprint named for another system fails the entry.

Add one with `npx -y cyber-agentkit reference register <system>.capabilities`, with `--plugin` and
`--blueprint` for what is known. It looks the system up first, then opens a pull request or an
issue once you confirm. To add a plugin or a blueprint to a system already listed, edit its entry.

## Updates

An update or a removal is a pull request that edits the file. The site build fails on an entry with
a problem, or a link in its header that no longer resolves.
