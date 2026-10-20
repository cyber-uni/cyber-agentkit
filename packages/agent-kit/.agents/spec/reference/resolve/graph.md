# reference/resolve — decision graph

Decisions a consumer can observe. Criteria in [README.md](./README.md) cite the edge IDs; the parent's
[graph](../graph.md) holds the edges every child shares.

## Resolving a name

```mermaid
flowchart TD
  start([show name]) --> valid{"E1 a valid name?"}
  valid -->|"no: .md, .default, a path, a bad character"| invalid(["invalid: nothing read, other names go on"])
  valid -->|yes| qual{"E2 qualified plugin/name?"}
  qual -->|yes| pinned["stack: that plugin and what its own extends brings in; a written extends is not used"]
  qual -->|no| iface{"E16 an interface document?"}
  iface -->|yes| lowest["never composed: the lowest answers, higher copies, extends, and merge ignored with a warning"]
  lowest --> twoi{two plugins hold it?}
  twoi -->|yes| ambiguous
  twoi -->|no| found
  iface -->|no| held{any layer holds it?}
  held -->|no| missing(["missing"])
  held -->|yes| written{"E8 a written extends in managed, project, or user?"}
  written -->|yes| steps["the highest builds the stack: steps bottom first, each with its own merge and extends"]
  steps --> step{"E47 every step installed and holding the name?"}
  step -->|"some missing"| skip["skipped, with what only it brings in; warning"]
  step -->|"all missing"| fall["the extends counts as not written; warning"]
  fall --> written
  step -->|yes| leftout
  skip --> leftout["E9 a plugin or default left out: not used, never ambiguous"]
  written -->|no| own{"E10 the plugins' own extends order every holder?"}
  own -->|"no, or a cycle, or a plugin at two places"| ambiguous(["ambiguous: each plugin/name and the default as options"])
  own -->|yes| overdef{"E42 a plugin answers over the skill's default with no extends naming either?"}
  overdef -->|yes| warnsel["answers; warning names the plugin and reference select"]
  overdef -->|no| leftout
  warnsel --> leftout
  pinned --> compose
  leftout --> compose["E3 apply bottom first in K17 order, each with its own operation"]
  compose --> op{"the contribution's operation?"}
  op -->|"E46 no body"| nochange[changes nothing]
  op -->|"E6 patch, the default"| patch[each section's text in place of the text it matches by heading path]
  op -->|"E5 combine"| comb[each section's text after the text it matches]
  op -->|"E4 replace"| repl["everything below dropped: shadowed"]
  op -->|"E45 remove"| rem["everything below dropped; its body ignored with a warning"]
  op -->|"E7 unknown value"| unk["read as patch; warning"]
  unk --> patch
  patch --> marker{"E44 a merge marker on a section?"}
  comb --> marker
  marker -->|yes| sect[that operation for that section alone]
  marker -->|no| next
  sect --> next{more contributions above?}
  nochange --> next
  repl --> next
  rem --> next
  next -->|yes| op
  next -->|no| body{"something left with a body?"}
  body -->|"no: a remove is on top"| missing
  body -->|yes| found(["found: the composed document"])
  found --> warn{"warnings? (parent E13)"}
  warn -->|yes| soft["on stderr, or in warnings; exit unchanged"]
```

## Reading layers

| Edge | Decision | Outcome |
| --- | --- | --- |
| E14 | the project, user, and managed tiers | `.agents/references/` from the root up to the repository root; `~/.agents/references/`; `references/` in each detected harness's managed folder |
| E15 | the plugin tier | enabled plugins of the detected harness, plus declared (not transitive) package dependencies that ship `references/` |
| E43 | `--default <skill folder>` | `<skill folder>/references/<name>.default.md` read as the `default` tier; an old `references/<name>.md` copy is not |
| E22 | a `governances/` folder | never read |
| E17 | a layer skipped for a reason | in the trace with its reason; adds no contribution |
| E11 | `--trace`, or `where` | every layer with its outcome; `where` gives the places to write and the heading paths below |

## Finding names

| Edge | Decision | Outcome |
| --- | --- | --- |
| E18 | `list` | one row per name; `--trace` gives one per layer and per skill default; a pattern keeps exact matches |
| E19 | `search` | each name resolved as `show` would; match kinds ranked `name` to `body`, then by name |
| E20 | no match | an explicit zero, exit 0 |
| E48 | skill defaults | found in the skill folders the detected harness reads; on an unverified harness none, and the answer says so |
