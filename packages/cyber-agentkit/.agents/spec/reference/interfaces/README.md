---
spec-type: behavioral
---

# reference/interfaces — an implementation is known to meet the interface it declares

Part of [reference](../README.md). Its What, key terms, actors, adapters, names, and output contract apply here;
IDs are shared across the parent and its children.

## Use Cases

### UC6 — Publish and check interfaces (A6.3)

- **Trigger:** a plugin author publishes an interface, or wants to know a contribution meets the interface it
  declares; or a consumer wants the implementations it can pin.
- **Entry points:** Skill: the `reference` skill's Create mode (an interface document), Inspect mode (check), and Find
  mode (implementations). Code: `reference check [name...]`; `reference implementations <id> [--accept <versions>]`;
  `checkReferences`, `referenceImplementations`.
- **Inputs:** an interface document, `<id>.interface.md` in the plugin's `references/`, listing the implementation's
  sections in order, each marked required or not, with a line saying what it holds; names, or none; an interface id
  and the versions it accepts; the root; the detected harness.
- **Outcome:** an interface document is valid when its `interface` block meets the format (Interfaces criteria).
  `check` validates each document, composed as UC1 composes it, against the interface it declares, or an interface
  document against its own shape; any failure fails the result. An implementation fails when a required section is left
  out or marked unsupported; an optional one left out is listed unsupported. The line saying what a section holds guides
  implementers (UC5.5 stubs each section with it) and is never checked. `implementations` lists the ones that pass,
  with qualified name, tier, version, description, and unsupported sections, and the ones left out, each with its
  reason.
- **Extensions:**
  - UC6.1 A named reference is `missing`, `ambiguous`, or `invalid`: reported with that status, as a failure.
  - UC6.2 A reference declares no `implements` and is not an interface: failure.
  - UC6.3 `implements` is malformed, lists more than one interface, or names an interface that is missing, ambiguous,
    or malformed: failure.
  - UC6.4 No names: every interface document and every implementation is checked. A name several plugins hold is
    also checked as each `<plugin>/<name>`, so each author sees their own result. Each skill's default is checked as
    its skill loads it, subject to UC3.5.
  - UC6.5 `implementations` of an unknown interface: error.
  - UC6.6 A skill's default is never listed by `implementations`: it has no qualified name to pin.
  - UC6.8 Composing a checked name raises a warning: its `compose` check fails, so `check` is the strict gate while
    `load` still answers.
  - UC6.9 A plugin's delta records a base version (UC5) that differs from the installed base: `check` warns, naming
    both versions, and does not fail. Load says nothing: the warning is for the delta's author.
  - UC6.10 An interface adds a required section, or marks an existing one required: its author raises the interface's
    `version`, so implementations that declare the old one fail `version` until they are updated (UC15.5). `check`
    does not enforce the raise; it has no previous version to compare with.

### UC15 — Implement another skill's interface (A6.4)

- **Trigger:** a plugin author wants their plugin to answer an interface another skill publishes with a full document
  of its own, not by building on the owner's default: for example, `cyber-asana` shipping
  `project-tracker.capabilities.asana`.
- **Entry points:** Skill: the `reference` skill's Create mode, then Inspect mode. Code:
  `reference create <name> --implements <id> --plugin <plugin>` (UC5.5), then `reference check <name>` (UC6).
- **Inputs:** the interface id and version; the name: `<id>` when the interface's cardinality is `one`, or
  `<id>.<key>`, with a key the plugin chooses, when it is `many`; the plugin's folder.
- **Outcome:** the plugin ships `references/<name>.md` declaring `implements: <id>@<version>`, with `merge: replace`,
  so it loads by itself and nothing below it applies. It is in effect once the plugin is installed: for `many`, the
  interface's consumers find it with `implementations` (UC6) and load it by its qualified name; for `one`, it answers
  the name as UC1 resolves it. `check` tells the author whether it meets the interface.
- **Extensions:**
  - UC15.1 Cardinality `one`, and only the owner's default besides: the plugin's document answers, with the warning
    UC1.10 gives until a selection names it.
  - UC15.2 Cardinality `one`, and another plugin implements it too: the name is `ambiguous` (UC1.2) until the
    customizer picks (UC4.2, UC9).
  - UC15.3 Cardinality `many`, and another plugin ships the same key: the name is `ambiguous` (UC1.2), and both are
    listed under `excluded` by `implementations`.
  - UC15.4 It fails its interface check: `check` fails, `implementations` leaves it out with the reason, and load
    still answers it with a warning (UC1.8).
  - UC15.5 The interface moves to a version its consumers accept and the implementation does not declare: `check`
    fails `version`, and `implementations` leaves it out.
  - UC15.6 The plugin that publishes the interface is not installed: `check` fails `interface found` (UC6.3); the
    document still loads by its name.
  - UC15.7 The author wants to change only some of the owner's sections: that is extending, UC7, not this.

## Criteria

Edge IDs are in [graph.md](./graph.md).

**Interfaces (UC6)**

- R63 (UC6, E52): An interface document is the reference `<id>.interface`; its body is prose for implementers. Its
  frontmatter `interface` block holds `cardinality` (`one`: the implementation is named `<id>`; `many`: each is named
  `<id>.<key>`), `version` (a positive integer), `versions` (the versions its consumers accept, positive integers,
  default `[version]`), and `sections` (the implementation's top-level sections in order, each listed once). A missing
  or malformed key fails the `interface` check, naming each problem; any other key is ignored.
- R64 (UC6, E36): Every section is optional; a `required` mark on a listed section is ignored. An implementation may
  hold sections the interface does not list, anywhere; `order` compares only the listed ones, each at most once.
- R33 (UC6, E35): `check` runs these checks on an implementation's composed document, each named in the output:
  `interface found` (`implements` is one `<id>@<version>` naming a found, valid interface), `version`, `name`, and
  `order`; an interface document gets the `interface` check (R63). Every document checked also gets `compose`, which
  fails when composing it raised any warning. Any failure fails the result.
- R34 (UC6, E36): A listed section left out, or whose first line is `**Unsupported.**`, is listed `unsupported`.
- R35 (UC6, E37): `implementations <id>` lists an implementation only when it passes `check` for that interface; every
  other candidate is under `excluded` with each reason. A skill's default is never listed. `--accept` replaces the
  interface's accepted versions.
- R36 (UC6, E38): `check` with no names covers every interface document and implementation found. A name several
  plugins hold is also checked as each `<plugin>/<name>`, and each skill's default as its skill loads it.
- R37 (UC1, E39): `show` prints a document that fails its interface check, with a warning naming the failed check.

## Open questions

- **Q13.** Interface composition (traits, mixins): an interface that includes others, and a document that implements
  several. A name fits one interface's namespace, so these need implementations found by what a document declares,
  not by its name. Parked: `implements` names one interface (UC6.3).
