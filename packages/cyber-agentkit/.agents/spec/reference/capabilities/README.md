---
spec-type: behavioral
---

# reference/capabilities — what a system can do is written once, and every way of using it builds on that

Part of [reference](../README.md). Its What, key terms, actors, adapters, names, and output contract apply here;
IDs are shared across the parent and its children. The design is
[decision 0008](../../design/decisions/0008-capability-references-and-blueprints.md); the research is
`.research/capability-references`.

A skill that works with an outside system, such as an issue tracker, needs two things it should not carry itself:
what that system can do (which features it has, from which version or tier, and what was found by running it), and
how to do the skill's operations on it. Written together, as one implementation per system, the facts about the system
repeat in every way of using it, so a system that can be used several ways (Asana can model levels as sections, a
custom field, or parent tasks) repeats them several times, and a team whose setup lacks a feature has to patch each
copy. This capability keeps the two apart: a **capability reference** says what one system can do, and a **blueprint**
says how to fulfill a consumer's interface on that system, one whole solution per file, building on the capability
reference by name.

**Non-goals (this child):**

- N19 Comparing a system's version or tier with a reference when a name is loaded, or running any command at load. A
  step that fails leads to a report (UC33); the comparison runs only when someone asks for it (UC32).
- N20 Capability references for a harness. Harness facts live in this package's code, each citing research.
- N21 Assembling a blueprint from independent pieces with declared constraints between them. A blueprint is one whole
  solution; a choice its author knows is independent is its own reference, loaded by name (K41).
- N22 Warning on the age of a capability reference's verification. No threshold is evidence-based.
- N23 Enforcing what a capability reference holds beyond its shape. Linking the system's docs for general behavior and
  holding what they do not say is guidance for authors, never a check.

**Key terms:** K40 to K44 are in the parent's [list](../README.md).

## Use Cases

### UC29 — Describe a system once (A6.7)

- **Trigger:** a plugin author, or whoever knows a system best, wants skills and blueprints to know what it can do,
  such as cyber-asana describing Asana.
- **Entry points:** Skill: the `reference` skill's Create mode (primary), then Inspect mode. Code: `reference create
  <system>.capabilities`, then `reference check`; `createContribution`, `checkReferences`.
- **Inputs:** the system's name; the plugin's folder; what the author knows and has verified.
- **Outcome:** the plugin ships `references/<system>.capabilities.md`. `create` stubs System, Detect, and Verified;
  the Create mode suggests linking the system's docs for general behavior and holding the decisions a skill makes, the
  setup's differences, and what running it found (N23). `check` passes it when its shape is right.
- **Extensions:**
  - UC29.1 System, Detect, or Verified is missing, or they are not the first three sections in that order: `check`
    fails it.
  - UC29.2 A section is `**Partial.**` or `**Unsupported.**` with no sentence after it: `check` fails it.
  - UC29.3 It declares `implements`: `check` fails it; a capability reference implements no consumer's interface.
  - UC29.4 Two plugins ship the same capability reference: the name is `ambiguous` until a customizer picks (UC9),
    as for any name.

### UC30 — Offer a way to use a system for a consumer's interface (A6.8)

- **Trigger:** a plugin author wants a consumer's skills to work on a system without a change to them, one way among
  possibly several, such as cyber-asana offering `project-tracker.blueprints.asana.sections` and
  `project-tracker.blueprints.asana.custom-field`.
- **Entry points:** Skill: the `reference` skill's Create mode (primary), Inspect mode, and Find mode. Code: `reference
  create <name> --implements <id>`, `reference check`, `reference implementations <id>`.
- **Inputs:** the blueprint interface and its version; the system and the solution's name; the plugin's folder.
- **Outcome:** the plugin ships the blueprint, declaring `implements: <id>@<version>`, with `Needs:` lines in the
  sections that rely on a feature. `check` passes it when it meets its interface, its capability reference resolves,
  and every needed feature exists there. `implementations <id>` lists it with its system, its capability reference's
  Verified entries, and its partial and unsupported sections, so a user picks among a system's blueprints by what each
  does and how well it is verified. The pick is the existing selection or the consumer's routing.
- **Extensions:**
  - UC30.1 Its capability reference is not `found`: `check` fails it, and `implementations` leaves it out with that
    reason.
  - UC30.2 A `Needs:` line names a feature its capability reference lacks: `check` fails it.
  - UC30.3 A blueprint interface declares cardinality `one`: the interface document fails `check`.
  - UC30.4 The capability reference ships in another plugin: the blueprint's plugin lists that plugin as a dependency
    ([dependencies](../../dependencies/README.md)); without it, UC30.1.

### UC31 — Describe a setup that differs from the system's docs (A5.6)

- **Trigger:** a team's setup lacks a feature or runs an older version, such as a self-hosted GitLab tier without
  epics.
- **Entry points:** Skill: the `reference` skill's Customize mode. Code: `reference customize <system>.capabilities`.
- **Inputs:** the capability reference; what differs, in the team's words; the tier.
- **Outcome:** one customization of the capability reference, written as UC5 writes any. Every blueprint that needs a
  feature the team marked unsupported is flagged when loaded here, with no edit to any blueprint.
- **Extensions:**
  - UC31.1 A blueprint needs a feature the resolved capability reference marks unsupported: `load` returns the
    blueprint with a warning naming the section and the feature.
  - UC31.2 The capability reference is not `found` when a blueprint loads: the blueprint loads, with a warning.

### UC32 — Examine the system a capability reference describes (A6.7, A7.3)

- **Trigger:** an author is about to update Verified; or a user's step failed and they want to know whether their
  system differs from what the reference says.
- **Entry points:** Skill: the `reference` skill's Doctor mode, `/reference doctor <system>.capabilities` (primary).
- **Inputs:** a capability reference's name; the system on this machine.
- **Outcome:** the agent runs the reference's Detect, and reports the version and tier it found, each feature whose
  version line or level disagrees with that, and the Verified entry for what it found, with what to do next: update
  Verified (author), patch the reference for this repository (UC31), or report to the author. The report is written to
  be sent as is. It changes no file.
- **Extensions:**
  - UC32.1 The name is not a capability reference: an error; nothing is run.
  - UC32.2 Detect finds that this is not the system, or a needed tool is missing: the report says so, and no feature
    is compared.
  - UC32.3 The version found is one Verified does not cover: the report says the reference is unverified for it.

### UC33 — A step fails while following a blueprint (A7.3)

- **Trigger:** a consuming skill's step fails while it follows a blueprint.
- **Entry points:** Skill: the `reference` skill's load procedure, which a consuming skill follows.
- **Inputs:** the failed step; the blueprint and capability reference loaded.
- **Outcome:** the agent tells the user which blueprint and capability reference the step followed, and offers to
  examine the system (UC32), to report to the author at the plugin's repository when its manifest names one, with the
  doctor's report as the body, and, as a stopgap, to patch the capability reference here (UC31).
- **Extensions:** none, the use case is itself the failure path; a plugin whose manifest names no repository is
  reported without a link.

## Criteria

Edge IDs are in [graph.md](./graph.md).

**Capability references (UC29)**

- R137 (UC29, UC29.1, E80): A capability reference passes `check` only when its first three `##` sections are System,
  Detect, and Verified, in that order.
- R138 (UC29.2, E81): A section of any reference or implementation whose first line is `**Partial.**` or
  `**Unsupported.**` with no sentence after it fails `check`.
- R139 (UC29.3, E80): A capability reference that declares `implements` fails `check`.
- R140 (UC29): `create <system>.capabilities` stubs System, Detect, and Verified, in that order, each saying what it
  holds.
- R141 (UC29, N23): `check` reads only a capability reference's shape (R137 to R139, R138's markers, version lines);
  nothing about what a section says fails it.

**Support levels (UC29, UC30)**

- R142 (UC30, E82): A required section marked `**Partial.**` is present for R64; `implementations` lists each partial
  section beside the unsupported ones.

**Blueprints (UC30)**

- R143 (UC30.3, E83): A blueprint interface whose cardinality is not `many` fails `check`.
- R144 (UC30.1, E84): A blueprint whose `<system>.capabilities` is not `found` fails `check`, and `implementations`
  leaves it out with that reason.
- R145 (UC30.2, E84): A blueprint whose `Needs:` line names a feature its capability reference has no section for fails
  `check`.
- R146 (UC30, E85): `implementations` of a blueprint interface gives, for each blueprint, its system and its
  capability reference's Verified entries, beside what R35 lists.

**Setups (UC31)**

- R147 (UC31.1, E86): `load` of a blueprint warns, naming the section and the feature, for each needed feature the
  capability reference, resolved for the same working folder, marks `**Unsupported.**`; the blueprint is still
  returned.
- R148 (UC31.2, E86): `load` of a blueprint whose capability reference is not `found` returns the blueprint with a
  warning.
- R149 (UC29, UC31, N19): `load` runs no command and compares no version for a capability reference or a blueprint.

**Doctor (UC32, UC33)**

- R150 (UC32): Doctor mode changes no file.
- R151 (UC32.1): Doctor mode on a name that is not a capability reference stops with an error before running anything.
- R152 (UC32, UC32.2, UC32.3): The doctor's report gives the version and tier found, or that the system was not
  detected; each feature whose version line or level disagrees with what was found; and the Verified entry covering
  it, or that none does.
- R153 (UC33): The load procedure tells a consuming skill, when a step fails while following a blueprint, to name the
  blueprint and capability reference and offer UC32, a report to the author, and UC31.

## Open questions

None.

## References

- Decisions: [0008](../../design/decisions/0008-capability-references-and-blueprints.md); issue #366.
- Research: `.research/capability-references`.
- Interfaces, cardinality, `check`, and `implementations`: [interfaces](../interfaces/README.md).
- The first consumer: repobuddy's tracker skills, whose `project-tracker.capabilities` interface this design renames
  to a blueprint interface (0008).
