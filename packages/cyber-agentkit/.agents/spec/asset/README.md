---
spec-type: behavioral
---

# asset — a skill's static files are listed, read, written, and deleted by relative path

Related to [reference](../reference/README.md), which it deliberately does not share tiers or merging with.

## What

The open Agent Skills specification names `assets/` as a skill folder for static resources: templates, images, data
files such as lookup tables and schemas (agentskills.io/specification). A skill points to an asset by path. A reference
is fetched by name and composed across tiers; an asset is not, so the `reference` skill never takes it over. This capability gives an author two things: plain file
operations on one skill's `assets/` folder, by path, with no tiers and no merging; and, separately, loading a file by
name through the tiers, so a plugin, the project, or the user can change which file a skill loads by placing its own (a JSON
permission allow/deny list, say).

**Non-goals:**

- N1 Merging or extending. Every file in an `assets/` layer is read as written, Markdown included: no frontmatter, no
  `merge`, no `extends`, no sections. The highest tier holding a name answers whole. By-path operations (UC1) have no
  tiers.
- N5 Choosing among plugins by a selection file. With nothing to order plugins, a name two plugins hold is ambiguous
  until a tier answers or a qualified name picks one.
- N2 Reading anything outside the skill's `assets/` folder.
- N3 Parsing or validating content. Text is returned as written.
- N4 Writing to an installed copy of a skill. A write targets a skill's source folder in the repository.

**Key terms:**

- K1 **skill folder**: a folder holding `SKILL.md`.
- K3 **by-name call**: `load`, `names`, `where`, or `select`. The reference engine reads `assets/` where references
  read `references/` (K4); resolution, statuses, and warnings are those of [reference](../reference/README.md).
- K4 **asset tiers**: the project and user tiers read `.agents/assets/`, a plugin's and a harness's managed tier
  `assets/`, and the skill's own `assets/<name>.<ext>` is the `default` tier, with no `.default` marker.
- K2 **asset path**: a relative path inside `<skill folder>/assets/`, with `/` separators, no `..`, no absolute path,
  no backslash.

## Use Cases

### UC1 — Manage a skill's assets (A1: skill author)

- **Entry points:** Skill: `/asset`. Code: `asset list|show|create|update|delete --skill <skill folder>`.
- **Outcome:** `list` gives every file under `assets/` as an asset path with its size. `show <path>` prints a text
  file. `create <path>` writes a new file from `--content` or `--from <file>`. `update <path>` replaces an existing
  file. `delete <path>` removes it and any folder it leaves empty.
- **Extensions:**
  - UC1.1 The folder is not a skill folder, or sits outside the repository or inside `node_modules`: refused.
  - UC1.2 The path breaks K2: refused, and nothing is read or written.
  - UC1.3 `create` on an existing file, `update` or `show` or `delete` on a missing one: refused, naming which.
  - UC1.4 `show` on a binary file: refused with its size; use the path.
  - UC1.5 `--content` and `--from` both or neither on `create` and `update`: usage error.
  - UC1.6 A symlink under `assets/` that leaves the folder: not listed, not read, not written.

### UC2 — Override which asset a skill loads (A2: skill author, plugin author, project or user)

- **Entry points:** Skill: `/asset`. Code: `asset load <name> --default <skill folder>`; `asset names`; `asset where
  <name>`; `loadAsset(name, {defaultSkill, ...})`.
- **Outcome:** `load` answers from the highest tier holding the name (managed, project, user, plugin, the skill's
  own file), with the file as written. `where` shows where an override goes; `names` lists the names held.
- **Extensions:**
  - UC2.1 Several plugins hold the name and no tier does: `ambiguous`, naming each `<plugin>/<name>`. A tier file, or a
    qualified name, answers.
  - UC2.2 Missing, invalid name, or an absent skill folder: as for references.

## Criteria

- R1 (UC1): `list` returns `path` and `bytes` for every regular file under `assets/`, sorted by path; none is zero rows,
  stated explicitly.
- R2 (UC1.2, UC1.6): No operation touches a file outside `<skill folder>/assets/`.
- R3 (UC1): `create` fails on an existing path; `update` fails on a missing one; each writes the folder it needs.
- R4 (UC1): `delete` removes the file and the folders it leaves empty up to `assets/`, never `assets/` itself.
- R5 (UC1.1): A write needs a skill folder inside the repository and outside `node_modules`.
- R6 (UC1.3, UC1.4, UC1.5): Refusals exit 1 and misuse exits 2, each with a stable code on stderr.
- R7: By-path operations read or write no tier, and no by-name call reads a `references/` folder. No reference command
  reads `assets/`.
- R8 (UC2): A by-name call reads `.agents/assets/` in the project folders and `~/.agents/assets/`, each enabled or
  dependency plugin's `assets/`, each detected harness's managed `assets/`, and the skill's `assets/` as the `default`
  tier (K4).
- R9 (UC2): The skill's `assets/<name>.<ext>` is the default; a `<name>.default.*` there is not special.
- R10 (UC2): No `select`, `extends`, `merge`, or frontmatter applies to an asset; such text is part of the file.
- R11 (UC2): `loadAsset` answers as `load` does.
- R78 (UC2.1): A name two plugins hold, with no tier file, is `ambiguous` with each `<plugin>/<name>` as an option; a
  tier file or a qualified name resolves it.

## Open questions

None.
