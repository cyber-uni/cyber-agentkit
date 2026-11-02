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
  where -->|"--in outside the root"| e2
  where -->|"a folder with no manifest or SKILL.md, or outside the repository"| e1
  where -->|ok| exists{"E26 the file there already?"}
  exists -->|"with a body"| e1
  exists -->|"only a selection"| keep[add the body and merge, keep extends]
  exists -->|no| conflict{"E30 --template with --implements or with --merge remove, --implements or --merge with --in, or an unknown interface?"}
  keep --> conflict
  conflict -->|"yes: a flag combination"| e2
  conflict -->|"yes: an unknown interface"| e1
  conflict -->|no| title{"E34 a title template?"}
  title -->|yes| e1
  title -->|no| hidden{"E28 a replace or remove above hides it?"}
  hidden -->|yes| hwarn["warning reference-hidden or repo-hides-user, naming the hiding contribution; written all the same"]
  hidden -->|"no, or the folder is not a layer"| mode
  hwarn --> mode["E29 merge: --merge, else the template's, else patch (--plugin or --default: --merge only; --in: none); --implements writes replace and every section stubbed Unsupported"]
  mode --> dry{"E31 --dry-run?"}
  dry -->|yes| print([path and content, nothing written])
  dry -->|no| wrote(["E33 written: path and a hint to load; --trace gives the trace"])
  cu([customize name]) --> cq{"E27 qualified name or --plugin?"}
  cq -->|yes| e2
  cq -->|no| base{"E59 --base?"}
  base -->|yes| pbase(["the generator's input, never the target file itself: picks applied, the default in the stack with --default, a managed extends applied; for a folder, the outer project sections too, not its own nor deeper ones; the interface's stub with --implements on a missing name; managed text, and the tier above or personal to the target, left out; nothing written"])
  base -->|no| inx{"E58 --in with --extends, --merge, or --implements, --in outside the root, or only one of --request and --body?"}
  inx -->|yes| e2
  inx -->|no| inm{"E58 --in for a name that is not Markdown?"}
  inm -->|yes| e1
  inm -->|no| what{"E58 --extends, --request, or both?"}
  what -->|neither| e2
  what -->|"--extends none"| has{"E51 extends in that tier?"}
  has -->|no| e3(["refused, exit 1: what answers the name now"])
  has -->|yes| unsel["extends removed; a file left empty is deleted"]
  unsel --> cw
  what -->|"--extends steps"| opt{"E50 each step default or a plugin holding the name?"}
  opt -->|no| e1
  opt -->|yes| sel["extends written bottom first; a body is kept, and one recording a request gets a hint to customize again; under a managed extends that builds the stack, extends-not-used names it"]
  sel --> cw
  what -->|"--request and --body"| body{"E58 the target holds a body recording no request?"}
  body -->|yes| e1
  body -->|no| amb{"E58 the name ambiguous, and no --extends?"}
  amb -->|"yes: pick-required"| e1
  amb -->|no| miss{"E67 the name missing under a found interface's namespace?"}
  miss -->|"yes, and no --implements"| e1
  miss -->|"yes, with --implements"| gimp["body written from the interface's stub and the request: implements id@version, merge replace, no sources"]
  miss -->|no| gen["body written with extends, sources and installed versions, request, and merge"]
  gimp --> cw
  gen --> cw
  cw{"E28 a replace or remove above hides the file?"}
  cw -->|yes| cwarn["written all the same; warning reference-hidden or repo-hides-user, naming the hiding contribution"]
  cw -->|no| cdone([written])
  d([delete name]) --> dq{"E27 qualified name?"}
  dq -->|yes| e1
  dq -->|no| there{"E32 a file at the place chosen?"}
  there -->|no| e3
  there -->|yes| ddry{"E31 --dry-run?"}
  ddry -->|yes| dprint([path and the answer afterwards, nothing deleted])
  ddry -->|no| rm["deleted; status and stack afterwards, missing or ambiguous included, exit 0; a selection that went is named, with customize --extends"]
```

| Edge | Decision | Outcome |
| --- | --- | --- |
| E26 | where `create`, `customize`, or `delete` writes | `customize`: the `repo`, `user`, or a folder's `<name>.md`; `create` and `delete` also a plugin's or skill's source folder in the repository; never managed or an installed copy |
| E34 | a title template; a template with no `description` | refused; written, with a hint |
| E67 | `customize` with `--implements`, or a `missing` name under a found interface's namespace without it | the stub is the base and the document records `implements` with `merge: replace`; without `--implements`, refused `implements-required` (R111) |
