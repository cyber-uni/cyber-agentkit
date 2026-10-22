---
name: asset
description: Use this skill when listing, reading, adding, changing, or deleting the static files in a skill's assets/ folder, such as templates, schemas, or JSON data a skill points to by path.
---

# Asset

An **asset** is a static file in a skill's `assets/` folder: a template, a schema, a lookup table, a JSON permission list. Two kinds of work:

- **By path**: manage the files themselves. No tiers, no merging.
- **By name**: load a file the way a reference loads, so a plugin, the project, or the user can override which file a skill uses by placing its own. The managed, project (`.agents/assets/`), user (`~/.agents/assets/`), and plugin tiers read `assets/` folders, and the skill's own `assets/<name>.<ext>` is the default. The highest tier holding the name answers with the file as written. Nothing merges or extends, Markdown included: frontmatter in an asset is just text. Choosing among plugins is a selection, a one-line `<name>.select` file.

For a Markdown document layered across tiers, use the `reference` skill.

## Route

| The request | Run |
| --- | --- |
| see which assets a skill holds | `list` |
| read a text asset | `show <path>` |
| add a new asset | `create <path>` |
| change an existing asset | `update <path>` |
| remove an asset | `delete <path>` |
| read the asset a skill loads by name, after overrides | `load <name> --default <skill folder>` |
| see which asset names exist | `names --default <skill folder>` |
| see where an override of a name would go | `where <name> --default <skill folder>` |
| choose which plugin's file, or the skill's own, answers a name | `select <name> <option> --default <skill folder>` |

## Run

Find the skill's source folder in the repository (the directory its `SKILL.md` is in), then run from anywhere:

```sh
node <this skill's folder>/scripts/asset.mjs <mode> [<path>] --skill <skill folder> --root <repository root>
```

- `<path>` is relative to `assets/`, with `/` separators and no `..`, such as `data/rules.json`.
- `create` and `update` take the text with `--content "<text>"` or a local file with `--from <file>`; pass exactly one.
- Never use `npx`, `pnpm dlx`, or any package runner, and never download anything.

`load`, `names`, and `where` read only. Ask the user before `create`, `update`, `delete`, or `select`, and name the file.

To make a skill use a different file, place one of the same name in a higher tier: `.agents/assets/<name>.<ext>` for the project, `~/.agents/assets/<name>.<ext>` for the user. When two plugins hold a name and no tier does, `load` reports it ambiguous and lists the options: run `select <name> <option>` (a plugin name, or `default` for the skill's own file; `--scope user` for yourself, `--clear` to undo), ask for `<plugin>/<name>`, or place the file in a tier. `where <name>` shows the folders. `create` never overwrites and `update` needs the file to exist.

## Read the result

Exit 0 means it did what was asked. Exit 1 is a refusal, and stderr says `error: <code>: <message>`: `exists`, `no-file`, `binary`, or `folder-invalid` (the folder is not a skill folder, or is an installed copy or outside the repository). Exit 2 is misuse: a path that leaves `assets/`, or both or neither of `--content` and `--from`. Report the message; do not retry with a different path to get around it.

`show` prints text only. A binary asset is pointed to by path, not shown.
