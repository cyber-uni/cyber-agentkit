# Customize a reference

Customize changes what a skill reads for a name, for the repository, for the user alone, or for one folder. The customizer picks what the name builds on, says in their own words what to change in the prose, or both. The `customize` command writes the file and its record and runs no model; you run the generator.

With no user present, write nothing. When the command cannot run, write nothing and say so.

## 1. Read what the name is now

1. Run `load <name> --trace`. Add `--default <skill folder>` when a skill loads the name, and use it in every command below.
2. Note the status, the stack, and each `repo`, `user`, or project-section layer. A layer that records a `request` is generated. A layer whose outcome is `stale` goes to [Revise a stale document](#5-revise-a-stale-document).

## 2. Choose the target

Ask who the change is for, and use that target's flags in every command below:

| Who it is for | Flags |
| --- | --- |
| everyone working in this repository | (none) |
| only the user, in every repository | `--scope user` |
| work in one folder of the repository | `--in <folder>` |

Run `where <name>` with those flags. Tell the customizer the file it writes, who it reaches, and what hides it. A hidden target is still written, with a warning.

## 3. Pick what it builds on

Skip this step for `--in <folder>`: a project section takes no picks.

1. The options are the plugins that hold the name, each `<plugin>/<name>`, and `default` when a skill has one. An ambiguous name lists them in its `options`.
2. Ask the customizer which to build on, bottom first, even when only one is left.
3. Run `customize <name> --extends <step>... --dry-run` with the target's flags. A step is a plugin's name, `<plugin>:<merge>` (such as `house-style:combine`), or `default`. For steps that contribute only some sections, write the whole `extends` list to a YAML file and pass `--extends-file <file>`. To remove the picks, pass `--extends none`.
   To pick for every interface of a family at once, such as the aspects of one skill, give the family `<prefix>.*` as the name with the same `--extends` steps and no `sections`. Each `one` interface a step can answer gets the picks; one no step holds keeps what it had, and a `many` one is skipped; the result names both.
4. Show the path and the content. On approval, run it without `--dry-run`.

The picks record, as `declined`, every plugin holding the name that they leave out, so load stops asking about it. When load warns `plugin-not-selected` about a plugin installed later, ask the customizer whether to add it to the picks or leave it out; to leave it out, write the same picks again.

Picks alone write a selection, or change only `extends` on a file that has a body. When that body records a request, the output suggests customizing again with it: offer step 4.

## 4. Change the prose by request

1. If the name is ambiguous, do step 3 first. Write the customizer's request, in their own words, to a temporary file.
2. Run `customize <name> --base` with the target's flags and any new `--extends` picks. It prints what the generator reads, and writes nothing. It leaves out the target file, managed text, the tier above the target, and personal text.
3. Spawn a generator subagent. Give it the prompt in [The generator](#the-generator), the printed base, and the request. Say whether to write a delta (the default) or a whole document (the customizer asked to replace everything). If you cannot spawn a subagent, follow that prompt yourself, reading only the base and the request.
4. Write the draft to a temporary file. Run `customize <name> --request <request file> --body <draft file> --dry-run` with the target's flags, adding `--merge replace` for a whole document.
5. Show the customizer the path and the draft. If they decline, write nothing. If they change the request, start this step again with the new request.
6. Only after they approve, run the same command without `--dry-run`.
7. Run `load <name> --trace`. The written file must be `used`, or the trace names what hides it.

If `customize` refuses with `body-not-generated`, the target holds a body written by hand. Offer Update mode, or deleting it first.

### Implement an interface by request

To implement an interface for the name, add `--implements <id>` to the `--base` and to the write. The base then starts with the interface's stub. The draft is a whole document that holds every section of the interface, in its order. With `--in <folder>`, it is a project section for that folder alone, so one package can implement the interface its own way. After the write, run `check <name>`; it must pass.

A name that is `missing` under a found interface's namespace needs `--implements <id>`; `customize` refuses it otherwise and says how to name the interface.

## 5. Revise a stale document

Load reports a generated document `stale` when a plugin it was built from changed or is gone. Revise it from its recorded request; the customizer does not restate it.

1. From `load <name> --trace`, read the stale layer's `request`, its picks (`extends` in its `frontmatter`), and its `sources`.
2. If a source's status is `missing`, its plugin is gone. Tell the customizer before you generate anything. They pick again (step 3), or go on without it.
3. Revise the main document first: the `repo` or `user` document. Then revise each stale project section, one at a time, with `--in <folder>`. Each project section records the main document it was written against.
4. For each one, write its recorded request to a file and follow step 4 with the same target. The recorded picks apply unless the customizer picked again. The base never holds the stale document, so the request is not applied over its own earlier result.
5. A JSON, YAML, TOML, or text document is regenerated whole.

If the customizer declines, write nothing; the document stays stale.

## The generator

Give the generator subagent this prompt, followed by the base and the request:

> You write one reference document for the `reference` skill of `cyber-agentkit`. You get a base document and a customizer's request.
>
> - Apply the request to the base. Change only what the request asks for.
> - Write one concise document of instructions an agent follows. Leave out rationale and history.
> - Keep every heading path you use exactly as the base has it, so later loads match it. Add a new section only when the request needs one.
> - For a delta (the default), write only the sections you change, each under its heading path from the base. To drop a section, write its heading followed by `<!-- merge: remove -->`.
> - For a whole document, write every section, in the base's order.
> - For a project section, write only what differs for work in that folder.
> - For an interface, keep every section of the stub, in its order. Replace each stub with its content, or keep `**Unsupported.**` with one sentence on why. A required section cannot stay unsupported.
> - Use top-level `##` sections and no `#` title. Write no frontmatter; the command records it.
> - Use only the base and the request. Never add text from anywhere else, such as managed or admin instructions, or other files you can see.
> - Reply with the document alone.
