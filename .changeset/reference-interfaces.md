---
"@cyberuni/agent-harness": minor
---

Add reference interfaces. An `<id>.interface` reference declares a contract in its `interface:` frontmatter: cardinality, version, accepted versions, tiers, and ordered sections, each optional unless marked `required`. A reference implements it with `implements: <id>@<version>`.

- `reference implementations <id> [--accept 1,2]` lists the implementations a consumer can load, with each one's pin, tier, description, and unsupported sections, and every one left out with why. The library exports `referenceImplementations`.
- `reference check [name...]` checks implementations, resolved with every override merged, and interface documents, and exits 1 on any failure. The library exports `checkReferences`. `show` warns when a resolved document fails its interface check.
- `reference create <id>.<key> --implements <id>` starts an implementation from the interface's sections.
- A plugin's copy can declare `overrides: [<plugin>]` to sit above another plugin's copy of the same name, instead of making the name ambiguous. A pin to the overridden plugin still applies it.
- An interface document is not overridable: a higher-tier copy is ignored with a warning.
- The `reference` skill loads the implementations of an interface, and creates and checks implementations.
