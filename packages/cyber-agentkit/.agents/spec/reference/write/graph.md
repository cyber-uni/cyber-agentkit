# reference/write — decision graph

Decisions a consumer can observe. Criteria in [README.md](./README.md) cite the edge IDs; the parent's
[graph](../graph.md) holds the edges every child shares.

## Writing

```mermaid
flowchart TD
  c([create name]) --> q{"E27 qualified name?"}
  q -->|yes| e1(["refused: nothing written, the cause named (a qualified name gets the bare name to use)"])
  q -->|no| where{"E26 where: --scope, --in, --plugin, or --default?"}
  where -->|"more than one"| e2([usage error, exit 2])
  where -->|"a folder with no manifest or SKILL.md, or outside the repository"| e1
  where -->|ok| exists{"E26 the file there already?"}
  exists -->|"with a body"| e1
  exists -->|"only a selection"| keep[add the body and merge, keep extends]
  exists -->|no| conflict{"E30 --template with --implements, --implements or --merge with --in, or an unknown interface?"}
  keep --> conflict
  conflict -->|yes| e1
  conflict -->|no| title{"E34 a title template?"}
  title -->|yes| e1
  title -->|no| hidden{"E28 a replace or remove above hides it?"}
  hidden -->|yes| e1
  hidden -->|"no, or the folder is not a layer"| mode["E29 merge: --merge, else the template's, else patch (--plugin or --default: --merge only; --in: none); --implements writes replace and every section stubbed Unsupported"]
  mode --> dry{"E31 --dry-run?"}
  dry -->|yes| print([path and content, nothing written])
  dry -->|no| wrote(["E33 written: path and a hint to load; --trace gives the trace"])
  cu([customize name]) --> cq{"E27 qualified name or --plugin?"}
  cq -->|yes| e1
  cq -->|no| base{"E59 --base?"}
  base -->|yes| pbase(["the generator's input: picks applied, the default in the stack with --default, a managed extends applied; managed text, and the tier above or personal to the target, left out; nothing written"])
  base -->|no| inx{"E58 --in with --extends or --merge, --in for a name that is not Markdown, or only one of --request and --body?"}
  inx -->|yes| e1
  inx -->|no| what{"E58 --extends, --request, or both?"}
  what -->|neither| e1
  what -->|"--extends none"| has{"E51 extends in that tier?"}
  has -->|no| e3(["error: what answers the name now"])
  has -->|yes| unsel["extends removed; a file left empty is deleted"]
  what -->|"--extends steps"| opt{"E50 each step default or a plugin holding the name?"}
  opt -->|no| e1
  opt -->|yes| sel["extends written bottom first; a body is kept, and one recording a request gets a hint to customize again; under a managed extends that builds the stack, extends-not-used names it"]
  what -->|"--request and --body"| body{"E58 the target holds a body recording no request?"}
  body -->|yes| e1
  body -->|no| amb{"E58 the name ambiguous, and no --extends?"}
  amb -->|"yes: pick-required"| e1
  amb -->|no| gen["body written with extends, sources and installed versions, request, and merge"]
  d([delete name]) --> dq{"E27 qualified name?"}
  dq -->|yes| e1
  dq -->|no| there{"E32 a file at the place chosen?"}
  there -->|no| e3
  there -->|yes| ddry{"E31 --dry-run?"}
  ddry -->|yes| dprint([path and the answer afterwards, nothing deleted])
  ddry -->|no| rm["deleted; status and stack afterwards; a selection that went is named, with customize --extends"]
```

| Edge | Decision | Outcome |
| --- | --- | --- |
| E26 | where `create`, `customize`, or `delete` writes | `customize`: the `repo`, `user`, or a folder's `<name>.md`; `create` and `delete` also a plugin's or skill's source folder in the repository; never managed or an installed copy |
| E34 | a title template; a template with no `description` | refused; written, with a hint |
