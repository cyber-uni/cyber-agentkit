---
name: reference
description: Use this skill when loading, creating, updating, deleting, finding, or inspecting a reference — a document agents read by name, Markdown or a JSON, YAML, TOML, or text file — or when wiring a skill to load one.
---

# Reference

Route the request to one mode, then follow that mode. A **reference** is a document fetched by name, usually Markdown. A JSON, YAML, TOML, or text file (`<name>.json`) is also one: it is never merged, and the highest tier holding it answers whole. Only `references/` is read. A skill's `assets/` files are resolved by name with the `asset` skill. Each place that holds a **contribution** to a name is a **tier**: managed, project, user, a plugin, or the loading skill's **default** (`references/<name>.default.md` in its folder). Contributions compose bottom first: the plugins and the default, in the order `extends` gives, then user, then project, then managed. Each applies with its `merge`: `patch` (the default) replaces the text a section matches, `combine` adds after it, `replace` drops everything below, and `remove` turns the name off. An **interface** is a contract, declared in a `<id>.interface` reference, that other references implement. What answers a name is the `reference` command's decision. Never decide it by reading tier folders yourself.

## Route

| The request | Mode |
| --- | --- |
| a skill's instructions name references to load with this skill | [Load](#load) |
| a skill's instructions name an interface whose implementations to load with this skill | [Load](#load) |
| write a new reference, for a project, for the user, for a plugin to ship, or as a skill's default | [Create](#create) |
| write a reference that implements an interface | [Create](#create) |
| change what an existing reference says, the user's own or a plugin's | [Update](#update) |
| choose which plugins a name builds on, or settle an ambiguous name | [Select](#select) |
| remove a project or user contribution, or a selection | [Delete](#delete) |
| find a reference for a topic, or see which ones exist | [Find](#find) |
| find the implementations of an interface | [Find](#find) |
| check that references have the shape their interface requires | [Inspect](#inspect) |
| see a reference, or learn why a name composed as it did | [Inspect](#inspect) |
| learn where a customization of a reference goes | [Inspect](#inspect) |
| make a skill load a reference | [Wire a skill](#wire-a-skill) |

Ask only when the request fits two modes. Otherwise pick one; outside Load, say which. Invoked as `/reference` with no request, run `list` from [Find](#find) and ask what to do with one.

## Run the command

```sh
node <this skill's folder>/scripts/reference.mjs <subcommand> ... --root <repository root>
```

`scripts/reference.mjs` is the package's `reference` command bundled into one file; it needs no `node_modules`. Pass `--root` every time, so the repository's own `.agents/references/` is read. A failure prints `error: <code>: <message>` and a warning `warning: <code>: <message>`, both on stderr.

Outside Load, when it is missing or cannot run, use `pnpm exec cyber-agentkit reference` when the package is a direct dependency, else `npx -y cyber-agentkit@1.2.0 reference`, with the same arguments. Load never falls back to a package runner.

## Load

Load `references/load.md` from this skill's folder and follow it, then return to the caller's work.

## Create

Load `references/create.md` from this skill's folder and follow it.

## Update

1. Run `show <name> --trace`. Use the bare name. If the name is ambiguous, go to [Select](#select) first.
2. Choose the folder to write: `.agents/references/` for the project, or `~/.agents/references/` for the user alone.
3. If the trace shows a `used` file with a body in that folder, it is the user's own contribution. Edit that file in place, then go to step 6.
4. Otherwise, write a customization above what is there. Run `where <name>` (add `--default <skill folder>` when a skill loads the name) for the heading paths of the document below each place. Write only the sections the user changes, each under the heading path it has there; `patch` keeps every section you do not name. To add after a section's text instead of replacing it, use `--merge combine`, or mark that one section `<!-- merge: combine -->` under its heading. To drop one section, mark it `<!-- merge: remove -->`.
5. Start it with `create <name> --dry-run`, adding `--scope user` for the user's folder and `--template <path>` with the file holding those sections. Show the user the path and content, then run it without `--dry-run` on approval.
6. Run `show <name> --trace` again. The written file must be `used`, and each section the user changed must list it.

## Select

1. Run `where <name>`. Its `options` are the plugins holding the name, each as `<plugin>/<name>`, and `default` when a skill's default holds it.
2. Ask the user which to build on, bottom first, even when one option is left. Ask whether it is for the project or the user alone.
3. Run `select <name> <option>...`, adding `--scope user` for the user alone. It writes `extends` into `<name>.md` and keeps any body the file has.
4. Run `show <name> --trace`. The stack must be what the user picked. To undo a selection, run `select <name> --clear`.

## Delete

1. Run `show <name> --trace`. Use the bare name: delete removes only a file under `.agents/references/` or `~/.agents/references/`, or, for an author, in a plugin's or a skill's source folder in this repository.
2. Choose the folder: `.agents/references/` for the project, or `~/.agents/references/` with `--scope user`. If the trace shows no file there, say so and stop. An installed plugin's, a managed, or an installed skill's contribution is never deleted; offer a customization with `merge: remove` through [Update](#update) instead.
3. Run `delete <name> --dry-run`, adding `--scope user` for the user's folder. Show the user the path and what will answer the name afterwards, and say so when a selection goes with the file.
4. On approval, run it without `--dry-run`.
5. Run `show <name> --trace` again. The deleted file must be gone from the trace.

## Find

- For a topic, run `search <query>`. If nothing matches, say that nothing matched. Do not guess a name.
- For every reference, run `list`. Add `--trace` for every contribution of each name and the outcome it gets.
- For every name matching a pattern, such as every provider of a shared prefix, run `list '<pattern>'`. `*` stands for any run of characters and the rest is literal, so it returns only exact matches, unlike `search`.
- For the implementations of an interface, run `implementations <id>`. It lists each one a consumer can load, with its pin; add `--trace` for each one it left out, with why.
- When `list` or `search` carries a `defaults` field, say that skills' defaults were not searched, and why.

## Inspect

- To read a reference, run `show <name>`; add `--metadata` for its composed frontmatter.
- To learn why a name composed as it did, run `show <name> --trace`. Report the stack and what built it, the contributions each section came from, and each layer that was `shadowed`, `not used`, or `not read`, with its reason.
- To check a reference against its interface, run `check <name>...`; with no name, it checks every interface document and implementation. Report each failure with its check. Exit 1 means at least one failed.
- To learn where a customization goes, run `where <name>`; when a skill loads the name, add `--default <that skill's folder>`. Report each place, who it reaches, and the heading paths below it. A plugin's or a skill's default contribution is read-only; never offer it as a place to write. If the user then wants the customization written, go to [Update](#update).

## Wire a skill

A skill never runs the command itself. It names this skill in one line; copy that line from the `README.md` in this skill's folder, and replace the example names. The skill may ship its own default of a reference at `references/<name>.default.md` in its folder. Load adds it below every other contribution, and reads it on its own only when the command cannot run.

## Rules

- **Only Create, Update, Select, and Delete write.** Load writes only a selection the user picked. Find, Inspect, and Wire a skill change no reference file.
- **Never edit, move, rename, or delete a reference an installed plugin or skill ships, or a managed one.** Update customizes it instead. Its callers load it by name.
- **Write only what the user approves.** Show the file and its path before you write or delete it.

## Validate

Before reporting a Create, Update, Select, or Delete done:

- The written or deleted file is under `.agents/references/` or `~/.agents/references/`, or, for Create and Delete, in a plugin's or a skill's source folder in this repository.
- No file in an installed plugin or skill, or in a managed folder, changed.
- The file and its path were shown to the user before the write or the delete, and a delete also said what answers the name afterwards.
- After Create or Update, `show <name> --trace` reports the written file as `used`.
- After Select, `show <name> --trace` reports the stack the user picked.
- After Delete, `show <name> --trace` no longer finds the deleted file.
- A created reference's top level is not a single heading holding all the others.
- A created reference that declares `implements` passes `check <name>`.
- `show <name>` gives no `marker-unmatched` warning for a file written or changed.
