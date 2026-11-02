---
spec-type: behavioral
---

# reference/formats — a name can be answered by a file that is not Markdown

Part of [reference](../README.md). Its What, key terms, actors, adapters, names, and output contract apply here;
IDs are shared across the parent and its children.

Some instructions are data, not prose: a JSON map of checks, a YAML table of labels. A skill that loads one should get
the file as written, from the same tiers, by the same name.

**Boundary.** A reference is a document fetched by name and layered across tiers. The open Agent Skills
specification names `scripts/`, `references/`, and `assets/` as skill folders (agentskills.io/specification): it calls
`references/` additional documentation an agent reads when needed, with no format restriction, and `assets/` static
resources a skill points to by path, data files such as lookup tables and schemas among them. This capability reads only
the `references/` folder and the tiers. It never reads `assets/`; [asset](../../asset/README.md) manages those files and resolves them by name.

**Non-goals (this child):**

- N10 Merging inside a non-Markdown file. No section, key, or path is patched or combined.
- N11 Creating or editing a non-Markdown reference through `create`; an author writes the file by hand, and a
  customizer generates one with `customize` (UC18).
- N12 Parsing or validating the content. The file is returned as text.

**Key terms:**

- K29 **format**: `markdown` for `<name>.md` and `<name>/README.md`; otherwise named by the extension: `json`,
  `yaml` (`.yaml` and `.yml`), `toml`, `txt`.
- K30 **format order**: when one folder holds several files for a name, the first of `.md`, `<name>/README.md`,
  `.json`, `.yaml`, `.yml`, `.toml`, `.txt` answers.
- K31 **metadata file**: `<name>.meta.md`, in the folder of a non-Markdown contribution. Its frontmatter holds what a
  Markdown contribution's would: `description`, `tags`, `extends`, and a generated document's record of its picks,
  sources, and request. It has no body. It is never a reference itself, so a name ending `.meta` is reserved for it.

## Use Cases

### UC13 — Load a reference that is not Markdown (A1.1, A5.1, A6.1)

- **Trigger:** a consumer names a reference that a tier holds as `<name>.json` (or another K29 extension).
- **Entry points:** Skill: Load mode. Code: `reference load <name>`; `loadReference`; the same for `where`, `list`,
  `search`, `check`.
- **Inputs:** a name, as for any reference.
- **Outcome:** the highest tier holding the name answers with its file as written, status `found`, format reported.
  Markdown behavior is unchanged.
- **Extensions:**
  - UC13.1 One folder holds several formats of a name: the K30 first answers; each other is ignored with a warning.
  - UC13.2 Contributions differ in format across tiers: a non-Markdown contribution replaces everything below it. A
    Markdown contribution above it is ignored with a warning, except a `merge: remove`, which turns the name off.
  - UC13.3 Several non-Markdown contributions: the highest answers whole; those below are shadowed.
  - UC13.4 A name ends in a K29 extension or `.meta`: `invalid`, as for `.md`.
  - UC13.5 A non-Markdown file has no frontmatter: its metadata file (K31) holds it. With none, it lists with an empty
    description, and nothing picks it.
  - UC13.6 The skill's default may be non-Markdown: `references/<name>.default.json`.
  - UC13.7 A customizer customizes a non-Markdown name (UC18): the generator writes a whole document in the format of
    the one it was generated from, never a delta, since nothing merges inside the file (N10). Its picks, sources, and
    request go in its metadata file (K31), and it goes stale as K26 says.
  - UC13.8 A project section in a format other than Markdown: not read, with a warning (UC1.17).
  - UC13.9 A customizer picks for a non-Markdown name (UC9): the pick is a metadata file with `extends` and no file
    beside it, the selection for that name. Nothing merges, so the top step's file answers whole.
  - UC13.10 A metadata file beside a Markdown contribution, or with neither a non-Markdown file nor `extends`: ignored,
    with a warning. A metadata file with a body: the body is ignored, with a warning, and the frontmatter still applies.

## Criteria

- R65 (UC13): `<name>.<ext>` for each K29 extension answers a name in every tier, in K30 order within a folder; the
  content is the file's text unchanged. A metadata file (K31) never answers a name.
- R66 (UC13): A result reports its `format` (K29); `load --metadata` and `--trace` carry it, and each trace layer's
  `file` shows the extension. `list` and `search` rows carry it for a non-Markdown name.
- R67 (UC13.1): Two formats in one folder: K30 first answers, each other warns `file-ignored`.
- R68 (UC13.2, UC13.3): The highest non-Markdown contribution replaces all below it, which are
  `shadowed by <contribution> (replace)`. A Markdown contribution above is `not used (format differs from <format>)`,
  with a warning `format-mismatch`, unless it is `merge: remove`.
- R69 (UC13.4): A name ending in a K29 extension is `invalid`, and nothing is read.
- R70 (UC13.5): A non-Markdown reference's metadata is its metadata file's frontmatter, without `extends` and the
  generated record (as for Markdown, UC8), plus `format`; with no metadata file, only `format`, and it lists with an
  empty description. `where` lists no sections for it.
- R92 (UC13.7): `customize` with a request for a non-Markdown name writes the body whole, in the format of the
  document it was generated from, never a delta, and writes the picks, sources with installed versions, and request to
  `<name>.meta.md` beside it. It goes stale as R75 says.
- R93 (UC13.9): A metadata file with `extends` and no non-Markdown file beside it is that tier's selection for the
  name: the stack is built from it, and the top step's file answers whole.
- R95 (UC11, UC13): `delete` on a non-Markdown name removes its file and the metadata file beside it; on a selection
  that is a metadata file alone, it removes that file.
- R94 (UC13.10): A metadata file beside a Markdown contribution, or with neither a non-Markdown file nor `extends`, is
  ignored with a warning. A body in a metadata file is ignored with a warning, and its frontmatter still applies.
- R71 (UC13): Markdown output, trace fields, and codes are unchanged for every name that no non-Markdown file answers.
- R72 (UC13): No reference command reads an `assets/` folder or accepts a path.
