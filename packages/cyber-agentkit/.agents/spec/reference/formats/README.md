---
spec-type: behavioral
---

# reference/formats — a name can be answered by a file that is not Markdown

Part of [reference](../README.md). Its What, key terms, actors, adapters, names, and output contract apply here;
IDs are shared across the parent and its children.

Some instructions are data, not prose: a JSON map of checks, a YAML table of labels. A skill that loads one should get
the file as written, from the same tiers, by the same name.

**Assets by name.** A skill can also ask for a file of its `assets/` folder by name, through the same tiers and
`select`, so another plugin, the project, or the user can change which file the skill loads (a JSON permission
allow/deny list, say). The tiers read an `assets/` folder where references read `references/`: the project and user
tiers `.agents/assets/`, a plugin's and a harness's managed `assets/`, and the skill's own `assets/<name>.<ext>` as
the default tier. This is opt-in per call (K21); without it nothing in `assets/` is read.

**Boundary.** A reference is a document fetched by name and layered across tiers. The open Agent Skills
specification names `scripts/`, `references/`, and `assets/` as skill folders (agentskills.io/specification): it calls
`references/` additional documentation an agent reads when needed, with no format restriction, and `assets/` static
resources a skill points to by path, data files such as lookup tables and schemas among them. This capability reads only
the `references/` folder and the tiers. It reads `assets/` only for an assets call (K21); [asset](../../asset/README.md) manages the files themselves, by path.

**Non-goals (this child):**

- N4 Merging inside a non-Markdown file. No section, key, or path is patched or combined.
- N5 Creating or editing a non-Markdown reference through `create`; an author writes the file by hand. `delete` is
  not offered for one either (Q5).
- N6 Parsing or validating the content. The file is returned as text.

**Key terms:**

- K19 **format**: `markdown` for `<name>.md` and `<name>/README.md`; otherwise named by the extension: `json`,
  `yaml` (`.yaml` and `.yml`), `toml`, `txt`.
- K21 **assets call**: a `show`, `list`, `where`, `select`, or `delete` with `--assets`, or the library with
  `folder: 'assets'`. It swaps the folder every tier reads to `assets/`; resolution, `select`, statuses, and output are
  otherwise as for references. A skill's default is `<skill folder>/assets/<name>.<ext>`, with no `.default` marker, so
  a file already there is overridable.
- K20 **format order**: when one folder holds several files for a name, the first of `.md`, `<name>/README.md`,
  `.json`, `.yaml`, `.yml`, `.toml`, `.txt` answers.

## Use Cases

### UC13 — Load a reference that is not Markdown (A1.1, A5.1, A6.1)

- **Trigger:** a consumer names a reference that a tier holds as `<name>.json` (or another K19 extension).
- **Entry points:** Skill: Load mode. Code: `reference show <name>`; `loadReference`; the same for `where`, `list`,
  `search`, `check`.
- **Inputs:** a name, as for any reference.
- **Outcome:** the highest tier holding the name answers with its file as written, status `found`, format reported.
  Markdown behavior is unchanged.
- **Extensions:**
  - UC13.1 One folder holds several formats of a name: the K20 first answers; each other is ignored with a warning.
  - UC13.2 Contributions differ in format across tiers: a non-Markdown contribution replaces everything below it. A
    Markdown contribution above it is ignored with a warning, except a `merge: remove`, which turns the name off.
  - UC13.3 Several non-Markdown contributions: the highest answers whole; those below are shadowed.
  - UC13.4 A name ends in a K19 extension: `invalid`, as for `.md`.
  - UC13.5 A non-Markdown file has no frontmatter: `description` and `extends` do not apply; it is a leaf that
    nothing selects or extends. It lists with an empty description.
  - UC13.6 The skill's default may be non-Markdown: `references/<name>.default.json`.

### UC14 — Override which asset a skill loads (A1.1, A5.1, A6.1)

- **Trigger:** a skill ships a data file in its `assets/` (a permission list) and a plugin, the project, or the user
  wants a different one used.
- **Entry points:** Code: `reference show <name> --assets --default <skill folder>`;
  `reference select <name> <option>... --assets`; `loadReference(name, {folder: 'assets', defaultSkill})`.
- **Outcome:** the name answers from the highest tier holding it, whole for a data file (UC13); `select` picks among
  plugins and the skill's file as for references.
- **Extensions:** none beyond UC13 and the reference extensions, which apply unchanged; a skill folder that does not
  exist warns, as `--default` does.

## Criteria

- R65 (UC13): `<name>.<ext>` for each K19 extension answers a name in every tier, in K20 order within a folder; the
  content is the file's text unchanged.
- R66 (UC13): A result reports its `format` (K19); `show --metadata` and `--trace` carry it, and each trace layer's
  `file` shows the extension. `list` and `search` rows carry it for a non-Markdown name.
- R67 (UC13.1): Two formats in one folder: K20 first answers, each other warns `file-ignored`.
- R68 (UC13.2, UC13.3): The highest non-Markdown contribution replaces all below it, which are
  `shadowed by <contribution> (replace)`. A Markdown contribution above is `not used (format differs from <format>)`,
  with a warning `format-mismatch`, unless it is `merge: remove`.
- R69 (UC13.4): A name ending in a K19 extension is `invalid`, and nothing is read.
- R70 (UC13.5): A non-Markdown reference has no metadata but `format`; `where` lists no sections for it.
- R71 (UC13): Markdown output, trace fields, and codes are unchanged for every name that no non-Markdown file answers.
- R72 (UC13): Without an assets call nothing in an `assets/` folder is read, and no command accepts a path.
- R73 (UC14): An assets call reads `.agents/assets/` in the project folders and `~/.agents/assets/`, each enabled or
  dependency plugin's `assets/`, each detected harness's managed `assets/`, and the skill's `assets/` as the `default`
  tier. It reads no `references/` folder.
- R74 (UC14): In an assets call, the skill's `assets/<name>.<ext>` is the default contribution, and a `<name>.default.*`
  there is not special. Resolution, composition (R65 to R68), statuses, and warnings are those of references.
- R75 (UC14): `select` with `--assets` writes its selection to `.agents/assets/<name>.md` (or the user's, plugin's,
  or skill's `assets/`), and `delete` with `--assets` removes a file there, a data file included.
- R76 (UC14): `create`, `search`, `check`, and `implementations` take no assets call.
- R77 (UC14): The library's `loadReference` takes `folder: 'assets'` and answers as the assets call does.

## Open questions

- **Q5.** Whether `delete` should remove a non-Markdown contribution (N5).
