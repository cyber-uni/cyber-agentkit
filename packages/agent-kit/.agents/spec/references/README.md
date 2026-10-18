---
spec-type: behavioral
---

# references — a name resolves to the one document that answers it, or says why not

## What

A **reference** is a Markdown document an agent reads by name, such as `project-tracker.capabilities.github`. Copies of
one name can sit in several places: a machine-wide policy folder, the repository, the user's home, and each plugin.
Without one shared rule, every skill that loads a reference decides for itself which copy wins, and two skills answer
differently.

This capability is that rule. Given a name, it picks the copy that answers (or combines the copies the author asked to
combine), and when no single copy answers it says so and names what the caller can ask for instead. It also lists what
exists and explains each decision, so a person can see why a name resolved as it did. It is **read-only**: it never
writes a reference.

**Non-goals** (each excluded on purpose; the first four are their own nodes, not yet written):

- Writing: `create` and `delete`, and the rule that an override is written above, never over, a plugin's copy.
- Interfaces: `<id>.interface` documents, `implements`, `check`, and `implementations`. Resolution treats an interface
  document only as far as stated in R14.
- Reference-keyed overrides (alias, default marker, pin file): issue #110.
- Loading as an agent does it: the `reference` skill's Load mode, its fallback to the caller's own copy, and the
  report to the user.
- Finding documents by meaning. `search` is lexical and ranked; it promises an order of match kinds, not relevance.
- Reading anything but Markdown by name, or any path: a name is never a path.

**Key terms** (shared terms: [glossary](../glossary.md)):

- **tier**: where a copy lives. In precedence order, highest first: `managed`, `project`, `user`, `plugin`.
- **layer**: one folder read for references. A tier holds one or more layers.
- **qualified name**: `<plugin>/<name>`. It asks for that plugin's copy.
- **merge mode**: how a copy applies over the copies below it, set by its frontmatter `merge`: `first-wins` (default),
  `combine`, `merge-sections`.
- **status of a name**: `found`, `missing`, or `ambiguous`.
- **outcome of a layer** (in the trace): `used`, `shadowed`, `ambiguous`, `missing`, `not read` with a reason.

## Use Cases

**Actors.** A1 a skill (or the agent running it) that needs a document by name. A2 a user or agent asking why a name
resolved the way it did. A3 a user or agent finding what exists. A4 an admin or author who places copies in tiers and
is affected by the result without invoking it: their placement must win in the order they were promised.

| Actor | Goal |
| --- | --- |
| A1 skill | Get the one document that answers a name, the same on every harness and in every skill |
| A2 inspector | Learn which copy answered, which were set aside, and why |
| A3 finder | See every name that exists, or those matching a pattern or topic, each with its copy and status |
| A4 author or admin | Have a higher tier's copy beat a lower one, and a plugin's copy be overridable only as declared |

### UC1 — Resolve names (A1, A4)

- **Entry points:** `reference show <name>...`; backed by `resolveReference(name, layers)`.
- **Inputs:** one or more names, `--root` (default the current directory), the detected harness.
- **Outcome:** per name, in the order asked: the document on stdout (one name prints it bare; several print each in a
  `<reference name tier>` block), exit 0 when every name resolved.
- **Extensions:**
  - A name is missing: the entry is `status="missing"`, an `error:` line on stderr names it, exit 1.
  - A name is ambiguous (two plugins hold it and neither overrides the other): `status="ambiguous"`, the error lists
    the qualified names to ask for, exit 1.
  - A name is a file (ends `.md`) or not a name (a path, bad characters): the whole call is rejected, nothing is read,
    exit 1.
  - A qualified name whose plugin is not installed: missing, and the trace says no plugin by that name exists.
  - A copy has malformed frontmatter, an unknown `merge`, or a bad `overrides`: the copy still answers, with a warning
    on stderr and the documented default.
  - Two files in one folder answer one name (`<name>.md` and `<name>/README.md`): the first in the order answers, the
    other is ignored with a warning.
  - No name given: error, exit 1.

### UC2 — Explain a resolution (A2)

- **Entry points:** `reference show <name> --trace`; `reference where <name> [--caller <skill folder>]`.
- **Outcome:** `--trace` reports every layer checked with its path, the file that matched, its merge mode, and its
  outcome. `where` reports the slots in precedence order, which is `used`, and the project and user files an override
  could be written to, each with its scope.
- **Extensions:**
  - A layer is skipped (managed policy held in MDM, a plugin with no install folder): it appears with the reason.
  - A layer is a legacy or deprecated folder: it still answers and its status says to move it.
  - `where` on an ambiguous name: error naming the qualified names, exit 1.
  - `where` on a plugin or caller slot: reported read-only, never offered as a place to write.

### UC3 — List and search (A3)

- **Entry points:** `reference list [pattern]`; `reference search <query>`.
- **Outcome:** `list` gives one row per name per layer holding it, with tier, plugin, path, description, and the status
  resolution gave that layer. A pattern keeps exactly the names it matches. `search` gives matches best first.
- **Extensions:**
  - Nothing matches: the output states zero explicitly; exit 0.
  - Search with an empty query: error, exit 1.
  - A name two plugins hold and neither overrides: `list` marks it ambiguous with the qualified names; `search` returns
    it once per plugin.

**Surface trace.** `show` and `--trace` (UC1, UC2), `--root` (all), `where` and `--caller` (UC2), `list` and its
pattern (UC3), `search` (UC3). `create`, `delete`, `check`, `implementations` belong to the nodes named in Non-goals.
Informational, no contract: the field layout of the trace beyond the keys named in R9, and the global `--format`.

## Criteria

Edge IDs are in [graph.md](./graph.md).

**Names**

- R1 (UC1, E1): A name with a `.md` suffix, a path separator other than one `<plugin>/` prefix, or a character other than
  letters, digits, `-` and `.` is rejected, nothing is read, and the exit code is 1.
- R2 (UC1, E2): `<plugin>/<name>` reads only that plugin's layers, plus plugin layers whose copy of the name declares
  `overrides` naming that plugin.

**Precedence**

- R3 (UC1, E3): With no merge modes set, the answer is the copy in the highest tier in the order `managed`, `project`,
  `user`, `plugin`; within a tier, the nearer project folder and the earlier layer win.
- R4 (UC1, E4): A copy with `merge: first-wins`, or none, ends the chain: every copy below it is `shadowed`.
- R5 (UC1, E5): A copy with `merge: combine` prints above the copies below it, each marked with its layer, highest first.
- R6 (UC1, E6): A copy with `merge: merge-sections` replaces, combines, or removes only the `##` sections it names
  (by `<!-- merge: replace|combine|remove -->`, default replace) and keeps the rest of the copy below.
- R7 (UC1, E7): An unknown `merge` value is read as `first-wins` with a warning; an unknown section merge is read as
  `replace` with a warning.

**Plugins**

- R8 (UC1, E8–E10): When two plugins hold a name and one's copy lists the other in `overrides`, the overrider sits above;
  when every holder is ordered this way the name is `found`. Any holder left unordered (a pair that override each other,
  or a holder no copy names) makes the name `ambiguous`, with `<plugin>/<name>` for each choice, exit 1.

**Reporting**

- R9 (UC2, E11): `--trace` lists, for every layer checked, `tier`, `plugin`, `path`, `found`, `candidate`, `merge`, and
  `outcome`; a layer below a `first-wins` copy reads `shadowed by <tier> (first-wins)`, and an overriding plugin copy
  reads `used (overrides <plugin>)`.
- R10 (UC1, E12): A missing name exits 1 with `status="missing"` for that name and an `error:` line on stderr; the other
  names asked still print.
- R11 (UC1, E13): A warning is printed on stderr as `warning: ...` and never changes the exit code or stdout.

**Layers**

- R12 (UC1, E14): The project tier reads `.agents/references/` in `--root` and each folder above it up to the repository
  root (a `.git`, `pnpm-workspace.yaml`, or a `package.json` with `workspaces`); with no repository root above, `--root`
  alone. The user tier reads `~/.agents/references/`.
- R13 (UC1, E15): The plugin tier holds, for the detected harness, each enabled plugin's `references/`, and the declared
  `dependencies` and `devDependencies` of the nearest `package.json` that ship one; never a transitive package.
- R14 (UC1, E16): A higher copy of a `<id>.interface` name is ignored with a warning; the lowest copy answers; two
  plugins holding it make it `ambiguous`.
- R15 (UC2, E17): A layer skipped for a reason appears in the trace with that reason and contributes no copy.

**Finding**

- R16 (UC3, E18): `list` has one row per name per layer holding it; `list '<pattern>'` keeps exactly the names matching,
  where `*` is any run of characters and everything else is literal and case-sensitive.
- R17 (UC3, E19): `search` ranks match kinds in the order `name`, `prefix`, `close name`, `description`, `heading`,
  `body`, then by name; a name resolves as `show` would before it is searched.
- R18 (UC3, E20): `list` and `search` with no match print an explicit zero and exit 0.

**Read-only**

- R19 (all, E21): No subcommand in this node creates, changes, or deletes a file.

## Open questions

- **Q1.** Which of `merge: combine` and `merge-sections` is the supported way to add to a plugin copy is not decided
  here; both are specified as built. Needs the owner.
- **Q2.** R13's `devDependencies`: `declaredDependencies` reads what the code reads today; confirm this is intended
  before the criterion is frozen.
- **Q3.** Should `search` rank a plugin copy's tier into its order? It does not today; nothing says it should.

## References

- Interfaces and `overrides` design: issue #97 (closed), #107, #110.
- Name-pattern listing: issue #79.
- Harness facts for enabled-plugin layers and managed folders: `.research/harness-detection`.
- The agent-facing procedure that consumes this: `skills/reference/SKILL.md` and `skills/reference/references/load.md`.
