---
spec-type: behavioral
---

# reference/interfaces — an implementation is known to meet the interface it declares

Part of [reference](../README.md). Its What, key terms, actors, adapters, names, and output contract apply here;
IDs are shared across the parent and its children.

**Non-goals (this child):**

- N16 Interface composition: an interface that includes others, or a document that implements several. A name fits
  one interface's namespace, so these would need implementations found by what a document declares. In this version
  `implements` names one interface (UC6.3).

## Use Cases

### UC6 — Publish and check interfaces (A6.3)

- **Trigger:** a plugin author publishes an interface, or wants to know a contribution meets the interface it
  declares; or a consumer wants the implementations it can load.
- **Entry points:** Skill: the `reference` skill's Create mode (an interface document), Inspect mode (check), and Find
  mode (implementations). Code: `reference check [name...] [--trace]`;
  `reference implementations <id> [--accept <versions>] [--trace]`; `checkReferences`, `referenceImplementations`.
- **Inputs:** an interface document, `<id>.interface.md` in the plugin's `references/`, listing the implementation's
  sections in order, each marked required or not, with a line saying what it holds; names, or none; an interface id
  and the versions it accepts; the root; the detected harness.
- **Outcome:** an interface document is valid when its `interface` block meets the format (Interfaces criteria). `check`
  validates each document, composed as UC1 composes it, against the interface it declares, or an interface document
  against its own shape; any failure is an entry in the result, which CI reads, and the exit stays 0 (R43). An
  implementation fails when a required section is left out or marked unsupported; an optional one left out is listed
  unsupported. The line saying what a section holds guides implementers (UC5.5 stubs each section with it) and is never
  checked. `implementations` lists the ones that pass, with its `pin` (a plugin's qualified name, or a `repo` or `user`
  implementation's bare name), tier, description, and unsupported sections; with `--trace`, also the version, and the
  ones left out, each with its reasons (R38).
- **Extensions:**
  - UC6.1 A named reference is `missing`, `ambiguous`, or `invalid`: it fails with its status code as the check name
    (`reference-missing`, `reference-removed`, `reference-ambiguous`, or `reference-invalid`), an entry in the result.
  - UC6.2 A reference declares no `implements` and is not an interface: fails the `kind` check.
  - UC6.3 `implements` is malformed, lists more than one interface, or names an interface that is missing, ambiguous,
    or malformed: failure.
  - UC6.4 No names: every interface document and every implementation is checked. A name several plugins hold is
    also checked as each `<plugin>/<name>`, so each author sees their own result. Each skill's default is checked as
    its skill loads it, subject to UC3.5.
  - UC6.5 `implementations` of an unknown interface: refused, `interface-unknown` (exit 1).
  - UC6.6 A skill's default is never listed by `implementations`: it has no qualified name to load it by.
  - UC6.8 Composing a checked name raises a warning that is a defect in the document itself (the codes R33 lists): its
    `compose` check fails, so `check` is the strict gate while `load` still answers. A warning that depends on what is
    installed or chosen, such as `alias-not-used` or `section-not-held`, is passed on and never fails `compose`.
  - UC6.9 A plugin's or a default's delta records a base version (UC5, in `sources`) that differs from the installed
    base: `check` warns, naming both versions, and does not fail. Load says nothing: the warning is for the delta's
    author.
  - UC6.10 An interface adds a required section, or marks an existing one required: its author raises the interface's
    `version`, so implementations that declare the old one fail `version` until they are updated (UC15.5). `check`
    does not enforce the raise; it has no previous version to compare with.
  - UC6.11 A `repo`, `user`, or project-section file that a `replace` or `remove` above hides: `check` warns
    `reference-hidden` (`repo-hides-user` for a `user` file under this repository's `repo` contribution), naming the
    hiding contribution, and does not fail (R112).
  - UC6.12 `implementations` lists nothing: axi's empty answer, exit 0 (R43).
  - UC6.13 A `repo` or `user` implementation of a `many` interface's `<id>.<key>`, written by `customize --implements`
    (R111): `implementations` lists it under its bare name as its `pin`, with its `tier`, and the consuming skill loads
    it by that name (UC12.2). UC6.6 still holds: a skill's default is never listed.

### UC15 — Implement another skill's interface (A6.4)

- **Trigger:** a plugin author wants their plugin to answer an interface another skill publishes with a full document
  of its own, not by building on the owner's default: for example, `cyber-asana` shipping
  `project-tracker.capabilities.asana`.
- **Entry points:** Skill: the `reference` skill's Create mode, then Inspect mode. Code:
  `reference create <name> --implements <id> --plugin <plugin folder>` (UC5.5), then `reference check <name>` (UC6).
- **Inputs:** the interface id and version; the name: `<id>` when the interface's cardinality is `one`, or
  `<id>.<key>`, with a key the plugin chooses, when it is `many`; the plugin's folder.
- **Outcome:** the plugin ships `references/<name>.md` declaring `implements: <id>@<version>`, with `merge: replace`,
  so it loads by itself and nothing below it applies. It is in effect once the plugin is installed: for `many`, the
  interface's consumers find it with `implementations` (UC6) and load it by its qualified name; for `one`, it answers
  the name as UC1 resolves it. `check` tells the author whether it meets the interface.
- **Extensions:**
  - UC15.1 Cardinality `one`, and only the owner's default besides: the plugin's document answers, with the warning
    UC1.10 gives until a selection names it, or none when its own `extends` names `default` (R56).
  - UC15.2 Cardinality `one`, and another plugin implements it too: the name is `ambiguous` (UC1.2) until the
    customizer picks (UC4.2, UC9).
  - UC15.3 Cardinality `many`, and another plugin ships the same key: the name is `ambiguous` (UC1.2), and both are
    listed under `excluded` by `implementations --trace`.
  - UC15.4 It fails its interface check: `check` fails, `implementations` leaves it out (its reason is under `excluded`
    with `--trace`), and load still answers it with a warning (UC1.8).
  - UC15.5 The interface moves to a version its consumers accept and the implementation does not declare: `check`
    fails `version`, and `implementations` leaves it out.
  - UC15.6 The plugin that publishes the interface is not installed: `check` fails `interface-found` (UC6.3); the
    document still loads by its name.
  - UC15.7 The author wants to change only some of the owner's sections: that is extending, UC7, not this.

## Criteria

Edge IDs are in [graph.md](./graph.md).

**Interfaces (UC6)**

- R63 (UC6, E52): An interface document is the reference `<id>.interface`; its body is prose for implementers. Its
  frontmatter `interface` block holds `cardinality` (`one`: the implementation is named `<id>`; `many`: each is named
  `<id>.<key>`), `version` (a positive integer), `versions` (the versions its consumers accept, positive integers,
  default `[version]`), and `sections` (the implementation's top-level sections in order, each listed once, each a
  `heading` with an optional `required`, default `false`, and an optional one-line `holds`; a plain string is short for
  `{heading: <string>}`). `cardinality`, `version`, and `sections` are required; `versions` and, per section,
  `required` and `holds` have the defaults given. A missing required key, or a malformed key, optional ones included,
  fails the `interface` check, naming each problem; any other key is ignored.
- R64 (UC6, E36): A `required` section that an implementation leaves out, or whose first line is `**Unsupported.**`,
  fails the `required` check, naming each such section. Every other section is optional. An implementation may hold
  sections the interface does not list, anywhere; `order` passes when the listed headings that are present appear in the
  listed order; a listed heading that appears twice fails `order` (the repeat also raises `heading-repeated`, R7).
  `holds` is never checked.
- R33 (UC6, E35): A checked name that is `missing`, `ambiguous`, or `invalid` fails with its status code as the check
  name (`reference-missing`, `reference-removed`, `reference-ambiguous`, or `reference-invalid`). A document checked
  that neither declares `implements` nor is an interface document fails the check `kind`. `check` runs these checks on
  an implementation's composed document, each named in the output in kebab-case: `interface-found` (`implements` is one
  `<id>@<version>` naming a found, valid interface, or an older id the interface lists in `aliases`, with a
  `reference-renamed` warning, R96), `version`, `name`, `order`, and `required`; an interface document gets the
  `interface` check (R63). Every document checked also gets `compose`, which fails only on a warning that is a defect in
  the document itself: `frontmatter-invalid`, `merge-unknown`, `marker-unknown`, `marker-unmatched`, `heading-repeated`,
  `remove-body-ignored`, `extends-invalid`, `extends-self`, `file-ignored`, `format-mismatch`, `metadata-ignored`,
  `interface-not-composed`, `alias-invalid`, and `default-in-tier`. The other warnings depend on what is installed or
  chosen: `extends-step-missing`, `extends-all-missing`, `extends-not-used`, `section-not-held`, `alias-not-used`,
  `default-not-selected`, `default-folder-missing`, `reference-stale`, `reference-renamed`, `repo-hides-user`,
  `interface-check`, `base-moved`, and `reference-hidden` (R112). They are passed on and never fail `compose`. Any
  failure is an entry in the result, and the exit stays 0 (R43). `version` passes when the `<version>` in `implements`
  is one of the `versions` the interface lists (R63). `name` passes when the document's name, without a `<plugin>/`
  prefix, is `<id>` for an interface of cardinality `one`, or `<id>.<key>` with a non-empty `<key>` for `many`. `check`
  does not check project sections, which declare no `implements` (K24), so `project-section-key-ignored` and
  `project-section-not-markdown` are not part of `compose`.
- R34 (UC6, E36): An optional listed section left out, or whose first line is `**Unsupported.**`, is listed
  `unsupported`.
- R35 (UC6, E37): `implementations <id>` lists an implementation only when it passes `check` for that interface; every
  other candidate is left out, and `--trace` shows it under `excluded` with each reason (R38). A candidate is a plugin's
  implementation, listed by its qualified name as its `pin`, or a `repo` or `user` implementation of a `many`
  interface's `<id>.<key>`, written by `customize --implements` (R111), listed by its bare name as its `pin` with its
  `tier`; the consuming skill loads it by that name (UC12.2). When a plugin also holds that `<id>.<key>`, both are
  listed: the plugin's by its qualified name, the `repo` or `user` one by the bare name, which is what loading the bare
  name returns. A skill's default is never listed. `--accept` replaces the interface's accepted versions.
  `implementations` of an unknown interface is refused (`interface-unknown`, exit 1); with nothing listed it gives axi's
  empty answer (exit 0).
- R36 (UC6, E38): `check` with no names covers every interface document and implementation found. A name several
  plugins hold is also checked as each `<plugin>/<name>`, and each skill's default as its skill loads it.
- R37 (UC1, UC15, E39): `load` prints a document that fails its interface check, with a warning naming the failed
  check.
- R86 (UC6, E60): `check` on a plugin or default file whose `extends` names another plugin compares the version it
  recorded in `sources` with that plugin's installed version; when they differ, it warns, naming both, and the check
  still passes. `load` gives no such warning.
- R87 (UC15, E37): Two plugins holding the same `<id>.<key>` of a `many` interface make that name `ambiguous`:
  `implementations --trace` lists both under `excluded` until a customizer picks one (UC9), and then lists only the
  pick. A plugin's `merge: replace` implementation of a `one` interface answers over the owner's default as R56 says.
- R112 (UC6, E68): `check` warns `reference-hidden` for a `repo`, `user`, or project-section file that a higher
  `replace` or `remove` hides (a managed one over a `repo` file or a project section; this repository's `repo` one over
  a `user` file, which keeps its code `repo-hides-user`), naming the hiding contribution. The warning is passed on and
  never fails a check, `compose` included.
