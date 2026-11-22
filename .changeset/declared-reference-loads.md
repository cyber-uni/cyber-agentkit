---
'cyber-agentkit': minor
---

A skill declares the references it loads in its `SKILL.md` front matter, under the Agent Skills `metadata` map:
`metadata.references` for reference names and `metadata.reference-interfaces` for interfaces, each one string of
names separated by spaces. `reference uses`, `skill doctor`, and `reference defaults` read these lists, so they find a
skill's loads whatever language it is written in. A skill that declares neither is read instead: each backticked name
that resolves to a known reference counts as a load, and the English load line still does while skills migrate.
`reference uses` reports each load's `source` (`declared` or `detected`). The new `skill check` script check SHP-20
flags a load the lists leave out, a declared name the text never mentions, and names listed in bullets under a
"Load these with the `reference` skill" lead-in. The library exports `declaredLoads`, `detectedLoads`, and `knownBy`.
