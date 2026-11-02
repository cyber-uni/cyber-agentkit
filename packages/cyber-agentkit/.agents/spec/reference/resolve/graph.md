# reference/resolve — decision graph

Decisions a consumer can observe. Criteria in [README.md](./README.md) cite the edge IDs; the parent's
[graph](../graph.md) holds the edges every child shares.

## Resolving a name

```mermaid
flowchart TD
  start([load name]) --> valid{"E1 a valid name?"}
  valid -->|"no: .md, .default, .meta, a path, a bad character"| invalid(["invalid: nothing read, other names go on"])
  valid -->|yes| qual{"E2 qualified plugin/name?"}
  qual -->|yes| pinned["stack: that plugin and what its own extends brings in; a written extends is not used"]
  qual -->|no| iface{"E16 an interface document?"}
  iface -->|yes| lowest["never composed: the lowest answers, higher copies, extends, and merge ignored with a warning"]
  lowest --> twoi{two plugins hold it?}
  twoi -->|yes| ambiguous
  twoi -->|no| found
  iface -->|no| held{any layer holds it?}
  held -->|no| missing(["missing"])
  held -->|yes| written{"E8 a written extends in managed, repo, or user?"}
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
  overdef -->|yes| warnsel["answers; warning names the plugin and reference customize --extends"]
  overdef -->|no| leftout
  warnsel --> leftout
  pinned --> nearer
  leftout --> nearer{"E57 both repo and user hold one?"}
  nearer -->|yes| both["both apply, repo over user; the user one's extends is not used"]
  nearer -->|no| compose
  both --> compose["E3 the stack bottom first in K17 order, then user, then repo, then managed, each with its own operation"]
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
  body -->|"no: a managed remove is on top"| missing
  body -->|"no: another remove is on top"| projonly{"E54 any project section?"}
  projonly -->|no| missing
  projonly -->|yes| sections
  body -->|yes| sections["E54 project sections after the main document, in path order; managed applied over each; merge, extends, implements, aliases in one ignored with a warning"]
  sections --> found(["found: the resolved reference, every project section inlined"])
  found --> stale{"E56 a repo, user, or project-section document's recorded source version changed, or the source gone?"}
  stale -->|yes| stalew["stale: still used; reference-stale warning"]
  stale -->|no| warn
  stalew --> warn{"warnings? (parent E13)"}
  warn -->|yes| soft["on stderr, or in warnings; exit unchanged"]
```

## Reading layers

| Edge | Decision | Outcome |
| --- | --- | --- |
| E14 | the root and the `repo`, `project`, `user`, and managed tiers | the root: the nearest `.git` folder up, else `--root`, else the working folder; `repo`: the root's `.agents/references/`; `project`: each `.agents/references/` strictly below it that git does not ignore (by any ignore file git reads); `~/.agents/references/`; `references/` in the current harness's managed folder only, and none when detection names no harness or more than one |
| E15 | the plugin tier | enabled plugins of the detected harness, plus declared (not transitive) package dependencies that ship `references/` |
| E43 | `--default <skill folder>` | `<skill folder>/references/<name>.default.md` read as the `default` tier; an old `references/<name>.md` copy is not |
| E22 | a `governances/` folder | never read |
| E17 | a layer skipped for a reason | in the trace with its reason; adds no contribution |
| E11 | `--trace`, or `where` | every layer with its outcome, project sections, and a generated document's sources; `where` gives the places to write, with `--in` a folder's, and the heading paths |

## Finding names

| Edge | Decision | Outcome |
| --- | --- | --- |
| E18 | `list` | one row per name; `--trace` gives one per layer and per skill default; a pattern keeps exact matches |
| E19 | `search` | each name resolved as `load` would, and each project section searched (its match carries its `folder`); match kinds ranked `name` to `body`, then by name |
| E20 | no match | an explicit zero, exit 0 |
| E48 | skill defaults | found in the skill folders the detected harness reads; on an unverified harness none, and the answer says so |

## Renames

| Edge | Decision | Outcome |
| --- | --- | --- |
| E65 | a name or a file name listed in another name's `aliases`, and held by no contribution as its own | resolves the new name, with a `reference-renamed` warning; listed by two names, `ambiguous` |
