---
name: reference
description: Use this skill when loading, creating, customizing, updating, deleting, migrating, finding, or inspecting a reference (a document agents read by name, Markdown or a JSON, YAML, TOML, or text file), or when wiring a skill to load one. Also use it to migrate reference files left in a version 1 form, or under a name a plugin renamed, as a `reference-legacy-format` or `reference-renamed` warning asks.
---

# Reference

Route the request to one mode, then follow that mode.

A **reference** is a document read by name. Each place that holds a **contribution** to a name is a **tier**:

- the plugins that ship the name, and the loading skill's **default** (`references/<name>.default.md` in its folder). They form the stack, bottom first, in the order `extends` gives.
- `user`: `~/.agents/references/`, for one person in every repository. It applies over the stack.
- `repo`: `.agents/references/` at the repository root, for everyone working in it. It applies over `user`.
- a **project section**: `.agents/references/<name>.md` in a folder below the root. It states only what differs for work in that folder, and follows the main document.
- `managed`: an admin's folder for the running harness. It applies over the main document and over each project section.

Each contribution applies with its `merge`: `patch` (the default) replaces the text a section matches, `combine` adds after it, `replace` drops everything below, and `remove` turns the name off. An **interface** is a contract, declared in a `<id>.interface` reference, that other references implement. What answers a name is the `reference` command's decision. Never decide it by reading tier folders yourself.

## Route

| The request | Mode |
| --- | --- |
| a skill's instructions name references, or an interface's implementations, to load with this skill | [Load](#load) |
| find a reference for a topic, list them, or list an interface's implementations | [Find](#find) |
| read a reference, learn why it composed as it did, where a customization goes, or check it against its interface | [Inspect](#inspect) |
| write a new reference from text the author gives: for the repository, the user, a plugin to ship, or a skill's default; or stub an interface | [Create](#create) |
| edit the user's own reference file in place | [Update](#update) |
| choose what a name builds on, settle an ambiguous name, change what a reference says, or revise a stale one | [Customize](#customize) |
| remove a repo, user, or project-section contribution | [Delete](#delete) |
| bring reference files written for version 1 to the 2.0 form, or rename them as a plugin renamed their names, as a `reference-legacy-format` or `reference-renamed` warning asks | [Migrate](#migrate) |
| make a skill load a reference | [Wire a skill](#wire-a-skill) |

Ask only when the request fits two modes. Otherwise pick one; outside Load, say which. Invoked as `/reference` with no request, run `list` from [Find](#find) and ask what to do with one.

## Run the command

```sh
node <this skill's folder>/scripts/reference.mjs <subcommand> ...
```

`scripts/reference.mjs` is the package's `reference` command bundled into one file; it needs no `node_modules`. It finds the repository root from the working folder. Add `--root <repository root>` only when the working folder is not in the repository. A command that cannot complete exits 1 (or 2 for a usage error) and prints one error value on stdout, with `error` and `code` lines. A warning prints `warning: <code>: <message>` on stderr in text output, and does not change the exit code.

Outside Load, when the script is missing or cannot run, use `pnpm exec cyber-agentkit reference` when the package is a direct dependency, else `npx -y cyber-agentkit@2.1.0 reference`, with the same arguments. Load never falls back to a package runner.

## Load

Load [references/load.md](references/load.md) from this skill's folder and follow it, then return to the caller's work.

## Find

- For a topic, run `search <query>`. If nothing matches, say that nothing matched. Do not guess a name.
- When `search` carries a `count` field, it shows only the best matches. Run it again with `--full` when none of them fits.
- For every reference, run `list`. Add `--trace` for every contribution of each name and its outcome.
- For every name matching a pattern, run `list '<pattern>'`. `*` stands for any run of characters and the rest is literal.
- For the implementations of an interface, run `implementations <id>`. It lists each one a consumer can load, with its pin. Add `--trace` for each one it left out, with why.
- When `list` or `search` carries a `defaults` field, say that skills' defaults were not searched, and why.

## Inspect

- To read a reference, run `load <name>`. Add `--metadata` for its composed frontmatter.
- To learn why a name composed as it did, run `load <name> --trace`. Report the stack and what built it, the contribution each section came from, each project section, and each layer that was `shadowed`, `stale`, `not used`, or `not read`, with its reason.
- To check a reference, run `check <name>...`: an interface document against its shape, an implementation against its interface, and every document for defects. With no name, it checks every name and reports every warning `load` would raise. It exits 0; report each entry under `failed` with its check, and each under `warned` with its warnings.
- To learn where a customization goes, run `where <name>`. Add `--default <skill folder>` when a skill loads the name, and `--in <folder>` for a folder's project section. Report each file, who it reaches, and what hides it. A plugin's or a skill's default contribution is read-only; never offer it as a place to write.

## Create

Load [references/create.md](references/create.md) from this skill's folder and follow it.

## Update

Use Update only for a file the user wrote by hand under `.agents/references/` or `~/.agents/references/`.

1. Run `load <name> --trace`. Find the `used` layer for that file.
2. If its trace row records a `request`, it is generated. Never edit it by hand; go to [Customize](#customize).
3. Show the user the change and the path. On approval, edit the file.
4. Run `load <name> --trace` again. The file must be `used`, and `load <name>` must give no `marker-unmatched` warning.

## Customize

Load [references/customize.md](references/customize.md) from this skill's folder and follow it.

## Delete

1. Run `load <name> --trace`. Use the bare name.
2. Choose the place: the repository (the default), the user with `--scope user`, or one folder's project section with `--in <folder>`. An author may also delete from a plugin's or a skill's source folder in this repository with `--plugin` or `--default`. An installed plugin's, a managed, or an installed skill's contribution is never deleted; offer a customization with `merge: remove` through [Customize](#customize) instead.
3. Run `delete <name> --dry-run` with that place's flag. Show the user the path and what will answer the name afterwards, and say so when a selection goes with the file.
4. On approval, run it without `--dry-run`.
5. Run `load <name> --trace` again. The deleted file must be gone from the trace.

## Migrate

Use Migrate for files a customizer or an author wrote: under `.agents/references/` at the root or in a folder below it, under `~/.agents/references/`, or in a plugin's or a skill's source folder in this repository. `migrate` rewrites each version 1 form as its 2.0 form (`merge: merge-sections` is removed, `merge: first-wins` becomes `merge: replace`, `overrides` becomes `extends`, a skill's `references/<name>.md` becomes `<name>.default.md`, a qualified-name override `<plugin>/<name>.md` moves out of its subfolder to `<name>.md` with `extends: [<plugin>]`), and renames each file under a name a plugin renamed. It keeps the body and every other key.

1. Run `migrate`, with the names to limit it to, if any. For a plugin's source folder, add `--plugin <folder>`; for a skill's, add `--default <folder>` and the names the skill loads, since its other files may be its own documents. It prints the plan and writes nothing.
2. If it answers `0 changes`, say so and stop.
3. Show the user every row: the file, its tier, and the change. Say plainly that each `user` row edits a file in their home folder that no git history restores. For a `manual` row, show why; for a selection or a qualified-name override in a project folder, offer the `customize` command it gives, through [Customize](#customize).
4. With no user present, write nothing, and report the plan.
5. Only after the user approves, run the same command with `--write`.
6. Run `check` with the changed names. Report any `reference-legacy-format` or `reference-renamed` left, with its file.

## Wire a skill

A skill never runs the command itself. It carries one load line naming this skill and its package. Copy the line from the `README.md` in this skill's folder and replace the example names:

```text
Load `<name>` and `<name>` with the `reference` skill of `cyber-agentkit`.
Load the implementations of the `<id>` interface with the `reference` skill of `cyber-agentkit`.
```

A skill written for one harness may add that harness's typed form after the skill's name; the README lists each one. The skill may ship its own default of a name at `references/<name>.default.md` in its folder. Load adds it below every other contribution, and reads it on its own only when the command cannot run. A copy at `references/<name>.md` is not read as a default.

## Rules

- **Only Create, Update, Customize, Delete, and Migrate write.** Load writes only a pick the user made for an ambiguous name. Find, Inspect, and Wire a skill change no reference file.
- **Never edit, move, rename, or delete a reference an installed plugin or skill ships, or a managed one, not even to migrate it.** Customize it instead. Its callers load it by name.
- **Never edit a generated document by hand.** Customize it again with its request.
- **Write only what the user approves.** Show the file and its path before you write or delete it. A request to create a reference from text the user gives is its approval: write it, then show the file and its path. With no user present, write nothing.

## Done when

Before reporting done, check each of these against the result. Report any that fails.

- **C1.** A file written or deleted by Create, Update, Customize, Delete, or Migrate is under `.agents/references/` at the root or in a folder below it, under `~/.agents/references/`, or, for Create and Delete, in a plugin's or a skill's source folder in this repository.
- **C2.** No file in an installed plugin or skill, or in a managed folder, changed.
- **C3.** The file and its path were shown to the user before the write or the delete, or, for a Create from text the user gave, right after the write. A delete also said what answers the name afterwards. A migrate showed every row of its plan.
- **C4.** After a write, `load <name> --trace` reports the written file as `used`, or names what hides it.
- **C5.** A written reference that declares `implements` passes `check <name>`.
- **C6.** A Load, Find, or Inspect answer matches what the `reference` command printed. A search that matched nothing says so and names no reference.
