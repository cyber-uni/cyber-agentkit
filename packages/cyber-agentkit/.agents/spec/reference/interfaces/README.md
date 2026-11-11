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
- N18 A general pattern over names. The only wildcard is a family (K39): `*` as the last segment, matching interfaces.
  Plain documents and implementations are customized and listed one name at a time.

## Use Cases

### UC6 — Publish and check interfaces (A6.3)

- **Trigger:** a plugin author publishes an interface, or wants to know a contribution meets the interface it
  declares; or a consumer wants the implementations it can load; or CI wants every warning load would raise, for every
  name, so a fault turns up before a skill happens to load the name.
- **Entry points:** Skill: the `reference` skill's Create mode (an interface document), Inspect mode (check), and Find
  mode (implementations). Code: `reference check`, `reference implementations`; `checkReferences`,
  `referenceImplementations`.
- **Inputs:** an interface document, `<id>.interface.md` in the plugin's `references/`, listing the implementation's
  sections in order, each marked required or not, with a line saying what it holds; names, or none; an interface id
  and the versions it accepts; the root; the detected harness.
- **Outcome:** an interface document is valid when its `interface` block meets the format. `check` validates each
  document, composed as UC1 composes it, against the interface it declares, or an interface document against its own
  shape. A plain document, which is neither, is checked for the defects composing it raises (UC6.8). Any failure is an
  entry in the result, which CI reads, not an error (R43). An implementation fails when a
  required section is left out or marked unsupported; an optional one left out is listed unsupported. The line saying
  what a section holds guides implementers (a new implementation is stubbed with it, UC5) and is never checked.
  `implementations` lists the ones that pass, with how to pin each, its tier, description, and unsupported sections; the
  ones left out can be shown with their reasons. For a `one` interface it also says which one is in use: the one a load
  of the name builds on.
- **Extensions:**
  - UC6.1 A checked name is `missing`, `ambiguous`, or `invalid`: it fails, an entry in the result. A name a `remove`
    turned off (UC3.4) is listed `missing` and does not fail: it is off on purpose.
  - UC6.3 `implements` is malformed, lists more than one interface, or names an interface that is missing, ambiguous,
    or malformed: failure.
  - UC6.4 No names: every name found is checked, plain documents included. A name several plugins hold is
    also checked as each `<plugin>/<name>`, so each author sees their own result. Each skill's default is checked as
    its skill loads it, subject to UC3.5.
  - UC6.5 `implementations` of an unknown interface: an error.
  - UC6.6 A skill's default is never listed by `implementations`: it has no qualified name to load it by.
  - UC6.8 Composing a checked name raises a warning that is a defect in the document itself: `check` fails it, so
    `check` is the strict gate while `load` still answers. A warning that depends on what is installed or chosen is
    passed on and never fails the check.
  - UC6.9 A plugin's or a default's delta records a base version (UC5) that differs from the installed base: `check`
    warns, naming both versions, and does not fail. Load says nothing: the warning is for the delta's author.
  - UC6.10 An interface adds a required section, or marks an existing one required: its author raises the interface's
    `version`, so implementations that declare the old one fail the version check until they are updated (UC15.5).
    `check` does not enforce the raise; it has no previous version to compare with.
  - UC6.11 A `repo`, `user`, or project-section file that a `replace` or `remove` above hides: `check` warns, naming
    the hiding contribution, and does not fail (R112).
  - UC6.12 `implementations` lists nothing: an empty answer, not an error (R43).
  - UC6.13 A `repo` or `user` implementation of a `many` interface's `<id>.<key>`, written by `customize`
    (R111): `implementations` lists it under its bare name, with its tier, and the consuming skill loads it by that
    name (UC12.2). UC6.6 still holds: a skill's default is never listed.
  - UC6.15 The name is a family (K39): UC24.
  - UC6.14 A name has project sections: the warnings load raises for them are passed on, each naming its file, and
    never fail. A project section declares no `implements` (K24), so it is not checked against an interface.

### UC15 — Implement another skill's interface (A6.4)

- **Trigger:** a plugin author wants their plugin to answer an interface another skill publishes with a full document
  of its own, not by building on the owner's default: for example, `cyber-asana` shipping
  `project-tracker.capabilities.asana`.
- **Entry points:** Skill: the `reference` skill's Create mode, then Inspect mode. Code: `reference create` for an
  implementation (UC5), then `reference check <name>` (UC6).
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
    left out of `implementations`, with the reason available.
  - UC15.4 It fails its interface check: `check` fails, `implementations` leaves it out (with its reason available),
    and load still answers it with a warning (UC1.8).
  - UC15.5 The interface moves to a version its consumers accept and the implementation does not declare: `check`
    fails, and `implementations` leaves it out.
  - UC15.6 The plugin that publishes the interface is not installed: `check` fails (UC6.3); the document still loads
    by its name.
  - UC15.7 The author wants to change only some of the owner's sections: that is extending, UC7, not this.

### UC24 — Pick or list for a family of interfaces (A5.3, A3.1)

- **Trigger:** a customizer wants one plugin to answer every interface of a family, such as the aspects of a skill
  that publishes one interface per aspect; or wants to see, for each interface of the family, which implementation
  answers it and which ones are available.
- **Entry points:** Skill: the `reference` skill's Customize mode and Find mode. Code: `reference customize <prefix>.*`
  with the steps, and `reference implementations <prefix>.*`; `customizeContribution` and `referenceImplementations`
  given the family.
- **Inputs:** the family; for customize, one list of steps, as UC9 takes them, without `sections`, and the tier.
- **Outcome:** customize writes, for each `one` interface of the family, the selection UC9 writes for those steps.
  The result lists each interface with what was written for it or why nothing was. `implementations` lists each
  interface of the family with what UC6 lists for it, including the implementation in use.
- **Extensions:**
  - UC24.1 A picked plugin implements some interfaces of the family and not others: the others keep what they had, and
    the result names them.
  - UC24.2 An interface of the family has cardinality `many`: customize skips it and names it, since a `many` interface
    has no single pick; `implementations` lists it as UC6 does.
  - UC24.3 No interface matches the family: an error, as an unknown interface is (UC6.5); nothing is written.
  - UC24.4 A step gives `sections`: an error, since sections differ per interface; nothing is written.
  - UC24.5 `*` anywhere but the last segment, or a name with `*` given where a family is not accepted: the name is
    `invalid` (R1).

## Criteria

Edge IDs are in [graph.md](./graph.md).

**Interfaces (UC6)**

- R64 (UC6, E36): A `required` section that an implementation leaves out, or marks unsupported, fails the check. Every
  other section is optional. An implementation may hold sections the interface does not list, anywhere; the listed
  sections that are present must appear in the listed order. `holds` is never checked.
- R34 (UC6, E36): An optional listed section left out, or marked unsupported, is listed as unsupported.
- R35 (UC6, E37): `implementations <id>` lists an implementation only when it passes `check` for that interface; every
  other candidate is left out, with each reason available. A candidate is a plugin's implementation, listed by
  its qualified name, or a `repo` or `user` implementation of a `many` interface's `<id>.<key>`, written by
  `customize` (R111), listed by its bare name with its tier; the consuming skill loads it by that name (UC12.2). When a
  plugin also holds that `<id>.<key>`, only the bare name is listed, since loading it returns the `repo` or `user` one;
  the plugin's is left out, with that reason. A skill's default is never listed. `implementations` of an unknown
  interface is an error; with nothing listed it is an empty answer, not an error.
- R36 (UC6, E38): `check` with no names covers every name found. A name several plugins hold is also checked as each
  `<plugin>/<name>`, and each skill's default as its skill loads it.
- R37 (UC1, UC15, E39): `load` prints a document that fails its interface check, with a warning naming the failed
  check.
- R86 (UC6, E60): `check` warns when a plugin or default file extends another plugin and the version it recorded
  differs from that plugin's installed version, and the check still passes. `load` gives no such warning.
- R87 (UC15, E37): Two plugins holding the same `<id>.<key>` of a `many` interface make that name `ambiguous`: both
  are left out of `implementations` until a customizer picks one (UC9), and then only the pick is listed. A plugin's
  `merge: replace` implementation of a `one` interface answers over the owner's default as R56 says.
- R112 (UC6, E68): `check` warns for a `repo`, `user`, or project-section file that a higher `replace` or `remove`
  hides, naming the hiding contribution. The warning is passed on and never fails a check.
- R116 (UC6, E70): `check` reports every warning `load` raises for a checked name. A defect in the document itself fails
  it, whether it is a plain document, an interface document, or an implementation; any other warning is passed on. A
  plain document passes when composing it raises no defect.
- R117 (UC6, E35): A checked name that is `missing`, `ambiguous`, or `invalid` fails, except a name a `remove` turned
  off, which is listed `missing` and passes.
- R129 (UC6, UC24, E37): For a `one` interface, `implementations` reports the implementation in use: the pin of the
  listed candidate, or `default`, that a load of the name builds on, or none when the name is not `found`.
- R118 (UC6, E71): `check` passes on every warning `load` raises for a name's project sections, each naming its file,
  and never fails a name for one.

**Families (UC24)**

- R130 (UC24, E77): A family (K39) matches every interface whose id starts with its prefix and a dot, at any depth, and
  nothing else.
- R131 (UC24, E78): `customize <family>` with steps writes, for each matched `one` interface those steps can answer,
  the same file `customize <id>` with those steps writes, in the tier asked.
- R132 (UC24.1, E78): An interface no step can answer keeps the contribution it had, and the result names it.
- R133 (UC24.2, E78): A matched `many` interface is skipped by `customize` and named in the result.
- R134 (UC24, E79): `implementations <family>` lists each matched interface, in name order, with what
  `implementations <id>` lists for it.
- R135 (UC24.3, UC24.4, E77): A family matching no interface, or a `customize` step with `sections` on a family, is an
  error, and nothing is written.
- R136 (UC24.5, E77): `*` anywhere but the last segment makes the name `invalid`, and a family given to any command
  other than `customize` and `implementations` is `invalid`.
