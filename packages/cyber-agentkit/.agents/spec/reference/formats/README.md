---
spec-type: behavioral
---

# reference/formats — a name can be answered by a file that is not Markdown

Part of [reference](../README.md). Its What, key terms, actors, adapters, names, and output contract apply here;
IDs are shared across the parent and its children.

Some instructions are data, not prose: a JSON map of checks, a YAML table of labels. A skill that loads one should get
the file as written, from the same tiers, by the same name.

**Boundary.** A reference is a document fetched by name and layered across tiers. The open Agent Skills specification
names `scripts/`, `references/`, and `assets/` as skill folders (agentskills.io/specification): it calls `references/`
additional documentation an agent reads when needed, with no format restriction, and `assets/` static resources a skill
points to by path, data files such as lookup tables and schemas among them. This capability reads only the `references/`
folder and the tiers. It never reads `assets/`; [asset](../../asset/README.md) manages those files and resolves them by
name.

**Non-goals (this child):**

- N10 Merging inside a non-Markdown file. No section, key, or path is patched or combined.
- N11 Creating or editing a non-Markdown reference through `create`; an author writes the file by hand, and a
  customizer generates one with `customize` (UC18).
- N12 Parsing or validating the content. The file is returned as text.

**Key terms:**

- K29 **format**: the kind of a reference file: `markdown`, `json`, `yaml`, `toml`, or `txt`.
- K31 **metadata file**: a file beside a non-Markdown contribution that carries its description and picks, and a
  generated document's record of its sources and request. It has no body. It is never a reference itself.

## Use Cases

### UC13 — Load a reference that is not Markdown (A1.1, A5.1, A6.1)

- **Trigger:** a consumer names a reference that a tier holds as a non-Markdown file, such as `<name>.json`.
- **Entry points:** Skill: Load mode. Code: `reference load <name>`; `loadReference`; the same for `where`, `list`,
  `search`, `check`.
- **Inputs:** a name, as for any reference.
- **Outcome:** the highest tier holding the name answers with its file as written, status `found`, format reported.
  Markdown behavior is unchanged.
- **Extensions:**
  - UC13.1 One folder holds several formats of a name: one answers; each other is ignored with a warning.
  - UC13.2 Contributions differ in format across tiers: a non-Markdown contribution replaces everything below it. A
    Markdown contribution above it is ignored with a warning, except a `merge: remove`, which turns the name off.
  - UC13.3 Several non-Markdown contributions: the highest answers whole; those below are shadowed.
  - UC13.5 A non-Markdown file has no frontmatter: its description comes from a companion metadata file (K31). With
    none, it lists with an empty description.
  - UC13.6 The skill's default may be non-Markdown: `references/<name>.default.json`.
  - UC13.7 A customizer customizes a non-Markdown name (UC18): the generator writes a whole document in the format of
    the one it was generated from, never a delta, since nothing merges inside the file (N10). Its picks, sources, and
    request go in its metadata file (K31), and it goes stale as K26 says.
  - UC13.8 A non-Markdown name has no project sections (UC1.17): a Markdown project section found for it is not
    delivered, and neither is a non-Markdown file in a project folder; each is warned about.
  - UC13.9 A customizer picks for a non-Markdown name (UC9): the pick is recorded in a metadata file. Nothing merges,
    so the top step's file answers whole.

## Criteria

- R65 (UC13): A non-Markdown name is answered in every tier but `project`, whose sections are Markdown only (R99); the
  content is the file's text unchanged. A metadata file (K31) never answers a name.
- R66 (UC13): A result reports its `format` (K29).
- R67 (UC1.6, UC13.1): Two files for a name in one folder: one answers, the other is warned about.
- R68 (UC13.2, UC13.3): The highest non-Markdown contribution replaces all below it. A Markdown contribution above it
  is not used and is warned about, unless it is `merge: remove`.
- R92 (UC13.7): `customize` with a request for a non-Markdown name writes the whole document, never a delta, and
  records its picks, sources with installed versions, and request in the metadata file. It goes stale as usual (K26).
- R95 (UC11, UC13): `delete` on a non-Markdown name leaves no orphan metadata file behind.
- R71 (UC13): Markdown output is unchanged for every name that no non-Markdown file answers.
- R72 (UC13): No reference command reads an `assets/` folder or accepts a path.
