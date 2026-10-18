# references — decision graph

Decisions a caller can observe when a name is resolved. Criteria in [README.md](./README.md) cite the edge IDs.

```mermaid
flowchart TD
  start([show name]) --> valid{E1 a valid name?}
  valid -->|no: file, path, bad character| reject([rejected: nothing read, exit 1])
  valid -->|yes| qual{E2 qualified?}
  qual -->|yes| pinned[read that plugin's layers and plugin layers overriding it]
  qual -->|no| all[read every layer]
  pinned --> iface
  all --> iface{E16 an interface document?}
  iface -->|yes| lowest[lowest copy answers, higher copies ignored with warning]
  lowest --> plugins2{two plugins hold it?}
  plugins2 -->|yes| ambiguous
  plugins2 -->|no| found
  iface -->|no| held{any layer holds it?}
  held -->|no| missing([E12 missing: exit 1])
  held -->|yes| order{E8 plugin copies order by overrides?}
  order -->|one holder, or ordered| chain
  order -->|E9 unordered pair, or unnamed holder| ambiguous([E10 ambiguous: qualified names, exit 1])
  chain[E3 highest tier first, nearer folder first] --> mode{copy's merge mode?}
  mode -->|E4 first-wins or none| stop[chain ends, lower copies shadowed]
  mode -->|E5 combine| stack[print above the copy below]
  mode -->|E6 merge-sections| sections[replace, combine, or remove named sections]
  mode -->|E7 unknown value| warnfw[read as first-wins, warn]
  stack --> chain
  sections --> chain
  warnfw --> stop
  stop --> found([found: document, exit 0])
  found --> warn{E13 warnings?}
  warn -->|yes| stderr[stderr only, exit unchanged]
```

Layer reading, before any name is resolved:

| Edge | Decision | Outcome |
| --- | --- | --- |
| E14 | project tier | `--root` and each folder up to the repository root; `--root` alone with no repository root above |
| E15 | plugin tier | enabled plugins of the detected harness, plus declared (not transitive) package dependencies that ship `references/` |
| E11 | `--trace` given | every layer checked is reported with its outcome |
| E17 | a layer is skipped (MDM policy, no install folder) | appears in the trace with its reason; contributes no copy |
| E18 | `list` | one row per name per layer; a pattern keeps exact matches only |
| E19 | `search` | match kinds ranked `name` to `body`, then by name |
| E20 | no match | explicit zero, exit 0 |
| E21 | any subcommand here | writes no file (barred edge) |
