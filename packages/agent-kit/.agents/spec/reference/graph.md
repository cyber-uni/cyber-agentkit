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
| E22 | a legacy folder holds the name | answers below the tier's `references/` folder; status says to move it |
| E23 | fallback: name `missing` or command did not run | read the caller's copy |
| E24 | fallback used, or a name not loaded | reported to the user with the reason |
| E25 | name rejected | its path is never read; call repeated without it |

Writing, checking, and the consumer contract:

```mermaid
flowchart TD
  c([create name]) --> q{E27 qualified name?}
  q -->|yes| e1([error: bare name to use, exit 1])
  q -->|no| both{E30 --template with --implements, unknown interface, or barred tier?}
  both -->|yes| e1
  both -->|no| exists{E26 file already in that scope?}
  exists -->|yes| e1
  exists -->|no| hidden{E28 a higher first-wins copy hides it?}
  hidden -->|yes| e1
  hidden -->|no| below{E29 a copy below?}
  below -->|no| w[write as templated]
  below -->|yes, plain template| ms[write with merge-sections]
  below -->|yes, implementation| whole[write whole, warn it replaces]
  w --> dry{E31 dry-run?}
  ms --> dry
  whole --> dry
  dry -->|yes| print([print path and content, write nothing])
  dry -->|no| wrote([E33 write, trace shows new file used])
  d([delete name]) --> dq{E27 qualified name?}
  dq -->|yes| e1
  dq -->|no| has{E32 copy in that scope?}
  has -->|no| e1
  has -->|yes| rm[delete it, report what answers next]
  k([check name]) --> kind{E35 interface, implementation, or neither?}
  kind -->|neither| kf([failure, exit 1])
  kind -->|interface| shape[check its own shape]
  kind -->|implementation| eight[eight checks on the resolved document]
  shape --> kout{any failure?}
  eight --> kout
  kout -->|yes| kf
  kout -->|no| kp([pass, exit 0])
  i([implementations id]) --> pass{E37 passes check for that interface?}
  pass -->|yes| listed[listed with pin, unsupported]
  pass -->|no| excl[excluded with each reason]
```

| Edge | Decision | Outcome |
| --- | --- | --- |
| E26–E34 | `create` and `delete` | see the graph; R24 to R32 |
| E35, E36, E37, E38 | `check`, `implementations` | R33 to R36 |
| E39 | `show` of a document failing its interface | printed, warning names the check |
| E40 | `--format json` (not built) | fields in R38 |
| E41 | an unresolved name (not built) | stable `code` |
| E42 | project or user copy over plugin copies (not built) | warning names the plugins |
