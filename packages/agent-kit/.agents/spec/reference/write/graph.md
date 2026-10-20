# reference/write — decision graph

Decisions a consumer can observe. Criteria in [README.md](./README.md) cite the edge IDs; the parent's
[graph](../graph.md) holds the edges every child shares.

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
