---
spec-type: behavioral
---

# reference — an agent loads exactly the instructions a skill names, composed from tiers that hold them

## What

A skill often needs instructions it does not carry itself: how this repository tracks issues, or which house style to
follow. Today it has three ways to get them, and each costs context or control. It can inline them, so every run loads
all of them and no one can change them without forking the plugin. It can ship them as skills only the agent invokes, so
each one's name and description load into every session, needed or not. Or it can search for them by frontmatter or by
grepping text, which loads documents the task does not need and leaves each skill to decide for itself which
contribution to follow.

This capability lets a skill ask for instructions by name, such as `project-tracker.capabilities.github`, and get
exactly that. The skill depends on the name, not on a file. Whoever places a contribution for the name decides what it
says: a plugin ships one, and a repository, a user, or a machine-wide policy can each place their own. Each contribution
declares what it builds on and how it applies over it: it replaces it, combines with it, patches some of its sections,
or removes it. One rule, the same for every skill, puts the contributions in order. A team can then customize a
plugin's instructions without forking it, and two skills asking for one name read the same thing, unless each answers
from its own default. Contributions come from authors who never coordinate, so a fault in one never stops the rest:
each name is answered with what can be found, and every fault is reported as a warning.

**Non-goals:**

- N1 Installing, enabling, or removing plugins. That is [dependencies](../dependencies/README.md).
- N2 Finding references by meaning. Results are returned in a deterministic order.
- N3 Reading anything but Markdown by name, or any path. A name is never a path.

**Key terms** (shared terms: [glossary](../glossary.md)):

- K1 **tier**: where a contribution lives: `managed`, `project`, `user`, `plugin`, `default`. Their order is K17. A
  write goes to `project`, which reaches everyone working in the repository, or `user`, which reaches only you, in every
  repository.
- K2 **layer**: one folder read for contributions. A tier reads one or more: the plugin tier one per plugin, the project
  tier one per folder from the root (K18) up to the repository root, the managed tier one per detected harness, beside
  that harness's own managed settings.
- K10 **contribution**: a reference file for a name, in one layer. A name may have several.
- K13 **default contribution**: a skill's own contribution of a name, `references/<name>.default.md` in the skill's
  folder. It forms the `default` tier when that skill loads the name. A name ending `.default` is reserved for it.
- K4 **qualified name**: `<plugin>/<name>`. It makes that plugin, with what it builds on, the stack for one call.
- K5 **merge operation**: how a contribution applies over what is below it. `replace` puts mine in place of everything
  below. `patch` (the default) keeps what is below and puts my text in place of the text it matches by heading path.
  `combine` keeps what is below and adds my text after the text it matches. `remove` drops what is below. The same
  four apply to a whole contribution (frontmatter `merge`), to a step, and to one section (a `<!-- merge: ... -->`
  marker). A heading path is read from each document's own top heading level, so `# Review` and `## Review` match.
- K6 **status of a name**: `found`, `missing`, `ambiguous`, or `invalid` (not built).
- K7 **outcome of a layer** (in the trace): `used`, `shadowed`, `ambiguous`, `missing`, or `not read` or `not used`
  with a reason.
- K8 **interface**: a contract declared in a `<id>.interface` reference. An **implementation** declares
  `implements: <id>@<version>`.
- K9 **consumer**: a plugin or skill that loads references through this capability, by skill, command, or library.
- K14 **stack**: the plugin and default contributions under the managed, project, and user tiers, bottom first.
  Frontmatter `extends` lists it.
- K15 **step**: one entry of `extends`: a plugin or `default`, optionally with the keys (`merge`, `extends`) to use for
  that contribution in place of its own.
- K16 **selection**: a contribution with `extends` and no body. It picks the stack and changes nothing else.
- K17 **above and below**: the order contributions apply in, bottom first: the stack (its plugins and `default` in
  `extends` order, the first listed lowest; with no written `extends`, `default` lowest), then `user`, then `project`
  from the repository root down to the root (K18), then `managed` (each detected harness's managed folder). Each
  contribution applies over the result of everything below it, so a higher one wins where they conflict. Lower and
  higher mean below and above.
- K18 **root**: the folder the project tier starts from (default the current directory). The project tier reads it and
  each folder above it up to the repository root, and a project write goes to its `.agents/references/`.

## Use Cases

**Actors and goals.** A4 and A7 are affected by the outcome without invoking it.

| ID | Actor | Goal |
| --- | --- | --- |
| A1.1 | A1 consumer (a skill, or the agent running it) | Load exactly the instructions it names, composed as their contributions declare |
| A1.2 | A1 | When a name can't be answered, know the reason, since each needs a different next step, and carry on |
| A2.1 | A2 inspector (anyone) | Know what an agent reads for a name, and why |
| A3.1 | A3 finder (anyone) | Find the names that exist, to load one or customize one |
| A4.1 | A4 admin | Have a managed contribution reach every repository on the machine, above project and user ones |
| A5.1 | A5 customizer (a team for its repository, or a user for themselves) | Change what a skill reads without forking the plugin: replace, patch, combine with, or remove a plugin's contribution, and choose which plugins it builds on and in what order |
| A5.2 | A5 | Remove a customization, and learn what answers afterwards |
| A6.1 | A6 plugin author | Ship skills that load references by name, with defaults others can customize |
| A6.2 | A6 | Build on another plugin's contribution, or on the loading skill's default, as its author wrote it |
| A6.3 | A6 | Publish an interface, and know an implementation meets it |
| A7.1 | A7 agent user | Be told when the agent ran without instructions it asked for, or without the customizations placed for it |

**Child specs.** Each use case lives in the child that owns it; UC8 stays here.

| Child | Use cases | Criteria |
| --- | --- | --- |
| [resolve](./resolve/README.md) | UC1, UC2, UC3, UC7, UC10 | Composition, Stack, Reporting, Layers, Finding |
| [write](./write/README.md) | UC5, UC9, UC11 | Writing |
| [interfaces](./interfaces/README.md) | UC6 | Interfaces |
| [skill](./skill/README.md) | UC4, UC12 | Fallback |

### UC8 — Consumers read a stable output (A1.1)

- **Trigger:** a consumer's code (a skill's script, or a program using the library) needs fields from a result, not
  prose.
- **Entry points:** Code: `--format json` on `show`, `where`, `list`, `search`, `check`, `implementations`, `create`,
  `select`, and `delete`; the library functions return the same records.
- **Inputs:** a command and its arguments; the output format.
- **Outcome:** each result carries the same fields in every adapter: by default only those that answer the request, with
  `--metadata` and `--trace` adding the rest, so an agent pays for no detail it did not ask for, and a consumer reads
  status, metadata, and codes instead of prose (repobuddy reads `metadata.contract` from `show --metadata` and `match`
  from `search`). Removing or renaming a field is a breaking change. Each failure and warning carries a stable code; the
  human wording is not a contract. `metadata` is the composed frontmatter, key by key with the higher contribution
  winning, without `merge` and `extends`: those say how one contribution applies, and the trace carries each as written
  (UC2).
- **Extensions:**
  - UC8.1 A name not `found`: its entry carries the status and code, and the other names still resolve.
  - UC8.2 A warning in structured output goes in the entry's `warnings`, so a consumer reads every fault from one
    place.

**Surface trace.** `show`, `--trace`, `--default` (UC1, UC2, UC10, UC12); `--root` (all); `where`, `--default` (UC2);
`list`, pattern (UC3); `search` (UC3); `create` with `--merge`, `--template`, `--implements`, `--scope`, `--plugin`,
`--default`, `--dry-run` (UC5); `select` with `--scope`, `--clear` (UC9); `delete` with `--scope`, `--plugin`,
`--default`, `--dry-run` (UC11); `check` (UC6); `implementations`, `--accept` (UC6); `--format`, `--metadata` (UC8).
Frontmatter keys `merge`, `extends`, `implements`, `interface`, `description`, `tags` serve UC1, UC5, UC6, UC7, UC9; the
section marker `<!-- merge: ... -->` serves UC1 and UC7. File names `<name>.md` and `<name>.default.md` serve UC5, UC9,
UC11 and UC3, UC12. Informational, no contract: the trace's keys beyond those the Adapters group names.

## Criteria

Edge IDs are in [graph.md](./graph.md). An unmarked criterion is how 0.7.1 behaves. "(not built)" marks a decided
criterion the code does not meet yet; each has an issue or an answer recorded in Open questions.

**Adapters**

- R43 (UC1, UC6, UC8, E12): The command exits 0 when it did what was asked: every name `found`, or `where` on an
  ambiguous name. It exits 1 when a name is not `found`, a check fails, or a write is refused, and 2 on a usage error
  (no name, an unknown flag).
- R44 (UC1): In text, one name prints its document; several print each as `<reference name="...">...</reference>` in
  the order asked; a name not `found` prints `<reference name="..." status="..." />` in its place.
- R45 (UC1, UC8, E13): In text, a failure is an `error: <code>: <message>` line and a warning a
  `warning: <code>: <message>` line, both on stderr. Neither changes stdout, and a warning never changes the exit code.
- R46 (UC2): `--trace` in text writes to stderr a summary line (status, stack, what built it), then each section's
  heading path with its contributions and operations, then each layer; stdout stays the plain document.
- R47 (UC8): `--format json` or `toon` writes one document to stdout, with the fields R38 gives; a warning goes only in
  the entry's `warnings`, not on stderr.
- R48 (UC1, UC8): Each library function returns full records: every field R38 lists, including those `--metadata` and
  `--trace` add; the command prints a subset. A name not `found`, `invalid` included, is a status in its record, never a
  thrown error. Warnings go in the record's `warnings` and are never printed.

**Names**

- R1 (UC1, E1): A name is `invalid` when it ends `.md`, or `.default` (that suffix names a default's file, K13), has a
  path separator other than one `<plugin>/` prefix, or a character other than letters, digits, `-` and `.`. Nothing is
  read for it, and the other names still resolve.
- R51 (UC1, E1): A `<name>.default.md` in a tier folder is ignored, with a warning that a default goes in a skill's
  `references/` folder.
- R2 (UC1, UC7, E2): `<plugin>/<name>` builds the stack from that plugin's contribution and what its own `extends`
  brings in; managed, project, and user contributions still apply over it. A written `extends` is not used, and a
  plugin extending the named one is left out.

**Consumers (UC8)**

- R38 (UC8, E40): A command prints only the fields that answer it; `--metadata` (on `show`) and `--trace` add more, and
  a field with nothing to say is left out. In `--format json` and `toon`:
  - `show`: one entry per name asked, in order. A `found` name with no warnings is its content as a string; otherwise a
    record of `name`, `status`, `content`, and `warnings`. A name not `found` is a record of `name`, `status`, `code`,
    and `options` when `ambiguous`. `--metadata` makes every entry a record and adds `status` and `metadata`. `--trace`
    adds `trace`: the stack, the contributions used (tier, plugin or skill, path, operation), the sections, and the
    layers.
  - `list`: rows of `name` and `description`, with `status` and `options` when not `found`; `--trace` adds the rows per
    layer (R16) with `tier`, `plugin` or `skill`, `path`, and outcome.
  - `search`: matches of `name`, `description`, and `match`; `--trace` adds `tier` and `plugin` or `skill`.
  - `check`: the entries that fail, each `name` and `failures` (each `check` and `message`), and the count that pass;
    `--trace` adds every entry with `kind` and `unsupported`.
  - `implementations`: each `pin`, `description`, and `unsupported`; `--trace` adds `name`, `tier`, `version`, the
    interface's `cardinality` and `accept`, and `excluded` with `name` and `reasons`.
  Removing or renaming one of these fields is a breaking change. The fields of `where`, `create`, `select`, and `delete`
  follow R57, R31, R61, R62, and R30, and are not a contract yet (Q4).
- R39 (UC8, E41): Every failure and warning carries a stable `code`; a warning in `warnings` is `{code, message}`. A
  name not `found` has `reference-missing`, `reference-ambiguous`, or `reference-invalid`; a check failure's code is its
  check's name (R33). The other codes are Q4. The human wording is not a contract.

**Read-only reads**

- R19 (UC1–UC3, UC6, E21): `show`, `where`, `list`, `search`, `check`, and `implementations` create, change, or delete
  no file. Only `create`, `select`, and `delete` write, each only where R24 allows; none writes in the managed tier or
  an installed copy of a plugin or skill.

## Open questions

- **Q4.** The codes for warnings and refused writes, and the fields of `where`, `create`, `select`, and `delete` (R38,
  R39). Needs the owner and a check with repobuddy, which parses the output today.
- **Q12.** For each harness: where a plugin's skills sit in its folder, how an installed plugin maps to its folder
  beyond the three in `.research/harness-detection` R7, which copy of a skill runs when several folders hold it, and
  whether the harness gives a running skill its own folder. Machine-wide admin skill folders are known for Claude Code,
  Codex, and OpenCode (`.research/machine-wide-content`). It blocks building the `default` tier and UC3's defaults, not
  the spec. Also: is a plugin-root `references/` folder part of the Agent Plugins spec, or a convention of ours?

## References

- Interfaces design: issue #97 (closed). Name-pattern listing: #79 (closed). #110 (open): its alias, default marker,
  and pin file are replaced by `extends` and selection (UC7, UC9). #107 (open): overrides and hard plugin dependencies.
- Output rules (R38, R43 to R48): clibuilder v12's `axi` output. A returned value goes to stdout in the asked format,
  diagnostics to stderr, errors coded; `--full` there means no truncation, so this spec's extra fields use `--metadata`.
- Harness facts for enabled-plugin layers and managed folders: `.research/harness-detection`.
- Machine-wide and managed content, including admin skill folders: `.research/machine-wide-content`.
- Skill folders package managers write (pnpm, `npx skills`) and which harnesses read them:
  `.research/package-manager-skills`.
- The agent-facing procedure: `skills/reference/SKILL.md` and `skills/reference/references/load.md`.
- Consumers surveyed: universal-plugin ADR 0017, cyberplace `skill-design`, repobuddy `project-tracker`, cynapse ADR
  0008, cyberfleet ADR 0024.
- Why rationale is linked, not inlined: `.research/design-spec-criteria`.
