---
"cyber-agentkit": minor
---

An interface document's `aliases` now also rename the document itself, so a plain reference that becomes an interface keeps its name. For an interface whose cardinality is `many`, `reference load <old name>` resolves the interface document with a `reference-renamed` warning. `<old id>.interface` resolves it for either cardinality. A `repo` or `user` file under the old name applies as the interface document and is reported with `reference-renamed` and `interface-not-composed`, since an interface is never composed. `reference check <old name>` checks the interface document, and `reference implementations <old id>` lists the interface's implementations. For a `one` interface, `<old id>` still names the implementation, so a plain reference that becomes a `one` interface still uses the plugin's rename table.
