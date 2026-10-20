---
"cyber-agentkit": minor
---

Add reference interfaces. An `<id>.interface` reference declares a contract in its `interface:` frontmatter: cardinality, version, accepted versions, and the implementation's top-level sections in order. Every section is optional, and an implementation may hold sections the interface does not list. A reference implements one interface with `implements: <id>@<version>`.

- `reference implementations <id> [--accept 1,2]` lists the implementations a consumer can load, with each one's pin, description, and unsupported sections; `--trace` adds the ones left out, with why. The library exports `referenceImplementations`.
- `reference check [name...]` checks implementations, composed as `show` composes them, and interface documents, and exits 1 on any failure. Its `compose` check fails a document whose composing raised a warning. The library exports `checkReferences`. `show` warns when a document fails its interface check.
- `reference create <id>.<key> --implements <id>` starts an implementation from the interface's sections, each stubbed `**Unsupported.**`, with `merge: replace`.
- An interface document is never composed: a higher contribution of it, and an `extends` or `merge` on it, is ignored with a warning.
- The `reference` skill loads the implementations of an interface, and creates and checks implementations.
