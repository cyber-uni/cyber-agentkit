---
'cyber-agentkit': minor
---

Add `reference register <id>`, which records a reference interface in the public registry so others can find it. It looks the id up first against the live registry: it stops on the same id, and shows near matches with why each matched, going on only past the ones named in `--seen`. It then opens a pull request adding the entry, or an issue carrying it, only with `--yes` or a forcing `--as`. With no network it says so and records nothing. The library exports the entry parser and the lookup (`parseInterfaceEntry`, `lookupInterface`, `readInterfaceRegistry`). `reference` load, list, and check never read the registry.
