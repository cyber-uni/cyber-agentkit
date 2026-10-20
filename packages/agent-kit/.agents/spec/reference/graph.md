# references — decision graph

Decisions a consumer can observe when a name is resolved, found, written, or checked. Criteria in
[README.md](./README.md) cite the edge IDs. E53 was proposed and dropped; it is not reused.

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
  held -->|no| missing(["E12 missing"])
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
  found --> warn{"E13 warnings?"}
  warn -->|yes| soft["on stderr, or in warnings; exit unchanged"]
```

| Edge | Decision | Outcome |
| --- | --- | --- |
| E12 | every name `found`, or `where` on an ambiguous name | exit 0; a name not `found`, a failed check, or a refused write exits 1; a usage error exits 2 |
| E13 | a warning | never changes stdout or the exit code |
| E40 | the output format | only the fields that answer; `--metadata` and `--trace` add the rest (R38) |
| E41 | a failure or warning | a stable `code`; the wording is not a contract |

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

## The skill's fallback

| Edge | Decision | Outcome |
| --- | --- | --- |
| E23 | the command did not run | the skill reads its own `references/<name>.default.md`; never for a name the command reported |
| E49 | `ambiguous`, with a user present | every option listed, the pick written with `reference select`; with no user, not loaded |
| E24 | a fallback used, or a name not loaded | reported to the user with the reason, except a name a `remove` turned off |
| E25 | an `invalid` name | its path is never read |

## Writing

```mermaid
flowchart TD
  c([create name]) --> q{"E27 qualified name?"}
  q -->|yes| e1(["error: the bare name to use"])
  q -->|no| where{"E26 where: --scope, --plugin, or --default?"}
  where -->|"more than one"| e2([usage error, exit 2])
  where -->|"a folder with no manifest or SKILL.md, or outside the repository"| e1
  where -->|ok| exists{"E26 the file there already?"}
  exists -->|"with a body"| e1
  exists -->|"only a selection"| keep[add the body and merge, keep extends]
  exists -->|no| conflict{"E30 --template with --implements, or an unknown interface?"}
  keep --> conflict
  conflict -->|yes| e1
  conflict -->|no| title{"E34 a title template?"}
  title -->|yes| e1
  title -->|no| hidden{"E28 a replace or remove above hides it?"}
  hidden -->|yes| e1
  hidden -->|"no, or the folder is not a layer"| mode["E29 merge: --merge, else the template's, else patch; --implements writes replace and every section stubbed Unsupported"]
  mode --> dry{"E31 --dry-run?"}
  dry -->|yes| print([path and content, nothing written])
  dry -->|no| wrote(["E33 written: path and a hint to show; --trace gives the trace"])
  s([select name option...]) --> sq{"E27 qualified name?"}
  sq -->|yes| e1
  sq -->|no| opt{"E50 each option default or a plugin holding the name?"}
  opt -->|no| e1
  opt -->|yes| sel["extends written bottom first; body and other keys kept"]
  clear([select name --clear]) --> has{"E51 a selection in that tier?"}
  has -->|no| e3(["error: what answers the name now"])
  has -->|yes| unsel["extends removed; a file left empty is deleted"]
  d([delete name]) --> dq{"E27 qualified name?"}
  dq -->|yes| e1
  dq -->|no| there{"E32 a file at the place chosen?"}
  there -->|no| e3
  there -->|yes| ddry{"E31 --dry-run?"}
  ddry -->|yes| dprint([path and the answer afterwards, nothing deleted])
  ddry -->|no| rm["deleted; status and stack afterwards; a selection that went is named"]
```

| Edge | Decision | Outcome |
| --- | --- | --- |
| E26 | where `create`, `select`, or `delete` writes | `select`: project or user `<name>.md`; `create` and `delete` also a plugin's or skill's source folder in the repository; never managed or an installed copy |
| E34 | a template with no `description` | written, with a hint |
| E21 | `show`, `where`, `list`, `search`, `check`, `implementations` | write no file |

## Checking interfaces

```mermaid
flowchart TD
  k([check name]) --> kind{"E35 an interface, an implementation, or neither?"}
  kind -->|neither| kf([failure, exit 1])
  kind -->|interface| shape{"E52 the interface block well formed?"}
  shape -->|no| kf
  shape -->|yes| comp
  kind -->|implementation| found{"implements one id@version naming a found, valid interface?"}
  found -->|no| kf
  found -->|yes| checks["version, name, order on the composed document"]
  checks --> sections["E36 sections open and optional; a listed one left out or Unsupported is listed unsupported"]
  sections --> comp{"compose: did composing raise a warning?"}
  comp -->|yes| kf
  comp -->|no| ok{any other check failed?}
  ok -->|yes| kf
  ok -->|no| kp([pass, exit 0])
  i([implementations id]) --> pass{"E37 passes check for that interface?"}
  pass -->|yes| listed["listed: pin, description, unsupported"]
  pass -->|no| excl[excluded, each with its reasons]
```

| Edge | Decision | Outcome |
| --- | --- | --- |
| E38 | `check` with no names | every interface document and implementation; a name several plugins hold also as each `<plugin>/<name>`; each skill's default as its skill loads it |
| E39 | `show` of a document failing its interface | printed, with a warning naming the check |
