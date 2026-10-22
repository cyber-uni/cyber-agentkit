---
spec-type: behavioral
---

# asset — a skill's static files are listed, read, written, and deleted by relative path

Related to [reference](../reference/README.md), which it deliberately does not share tiers or merging with.

## What

The open Agent Skills specification names `assets/` as a skill folder for static resources: templates, images, data
files such as lookup tables and schemas (agentskills.io/specification). A skill points to an asset by path. A reference
is fetched by name and composed across tiers; an asset is not, so the `reference` skill never takes it over. An author
still needs to add, change, and remove those files without hand-editing paths. This capability gives that: plain file
operations on one skill's `assets/` folder, with no tiers and no merging.

**Non-goals:**

- N1 Tiers, plugin layering, `extends`, or any merge. A file is the file at its path.
- N2 Reading anything outside the skill's `assets/` folder.
- N3 Parsing or validating content. Text is returned as written.
- N4 Writing to an installed copy of a skill. A write targets a skill's source folder in the repository.

**Key terms:**

- K1 **skill folder**: a folder holding `SKILL.md`.
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

## Criteria

- R1 (UC1): `list` returns `path` and `bytes` for every regular file under `assets/`, sorted by path; none is zero rows,
  stated explicitly.
- R2 (UC1.2, UC1.6): No operation touches a file outside `<skill folder>/assets/`.
- R3 (UC1): `create` fails on an existing path; `update` fails on a missing one; each writes the folder it needs.
- R4 (UC1): `delete` removes the file and the folders it leaves empty up to `assets/`, never `assets/` itself.
- R5 (UC1.1): A write needs a skill folder inside the repository and outside `node_modules`.
- R6 (UC1.3, UC1.4, UC1.5): Refusals exit 1 and misuse exits 2, each with a stable code on stderr.
- R7: No operation reads or writes a reference tier, and no reference command reads `assets/`.

## Open questions

None.
