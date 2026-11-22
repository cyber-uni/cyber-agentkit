# 0008 — What a system can do and how to use it are two references: a capability reference and blueprints

**Status:** accepted (2026-11-22). Settles issue #366 with the Council, questions Q1 to Q15. The design lives in the
[capabilities spec](../../reference/capabilities/README.md) (K40 to K44, UC29 to UC33); the research is
`.research/capability-references`.

## Decision

- **Capability references exist (Q1, O1).** A capability reference describes what one system can do. A skill reads it
  at run time, and an author reads it to write or customize a skill; neither is its defining purpose.
- **WHAT and HOW are separate references (Q5, O14).** A capability reference, `<system>.capabilities`, holds the
  facts about one system. A blueprint holds one way to fulfill a consumer's interface on that system. A system can
  have several blueprints, and the facts about it are written once.
- **Recognized by name, not frontmatter (Q2, O7; Q9, O29; Q13, O49).** A name ending `.capabilities` is a capability
  reference; an interface ending `.blueprints` is a blueprint interface, cardinality `many`. A blueprint's key is
  `<system>.<solution>`, and its first segment names its capability reference. Both suffixes are plural: the name
  addresses the set, the key one member, as `skill-design.aspects.*` does. This follows decision 0006, where a
  reference's form is in its name.
- **A built-in preamble (Q3, O8).** System, Detect, and Verified, required, first, in that order. Later sections are
  the system's features.
- **Thin content is a suggestion (Q6, O17 as guidance).** Link the system's docs for general behavior; hold what a
  skill decides on, what the setup changes, and what running it found. `check` never enforces it.
- **One blueprint is one whole solution (Q8, O24).** Choices that affect each other stay in one file. A choice its
  author knows is independent may be its own reference, loaded by name.
- **The HOW layer is called a blueprint (Q7, O25).** "Template" already means a file to copy and fill in; "setup" is a
  verb; "model" collides with AI models.
- **Version facts live with the system, support levels with the blueprint (Q4, O32).** Features carry `Since:` and
  `Until:`; every implementation section may be `**Partial.**` beside `**Unsupported.**`; a blueprint's `Needs:` lines
  name features, so a team's patch of a capability reference reaches every blueprint for that system.
- **"System" excludes harnesses (Q10, O35).** Anything a skill operates through commands or an API, remote or local.
  Harness facts stay in this package's code, citing research.
- **Nothing is compared at run time (Q11, O44).** Detect only tells which system is in use. A failed step leads the
  user to the doctor, a report to the author, or a local patch.
- **Capability references get a registry area of their own (Q14, O52).** One entry per system, listing the plugins
  that ship its capability reference and the blueprints built on it, beside the interface registry.
- **The user-facing page is written now, marked planned (Q15, O53).** Each build issue updates it as its part ships.
- **`/reference doctor` examines the system (Q12, O45).** `check` examines references statically; `doctor` examines,
  at run time, the system a capability reference describes. The glossary's verb entries say so.

## Why

- A new system arrives as files and the consumer does not change (repobuddy's decision 0003, point 4).
- Online docs cannot hold a team's own setup or what running a command found, and some environments forbid search.
  Those facts are a capability reference's main value, so it stays thin on what the docs already say.
- Combining WHAT and HOW repeats the system's facts in every way of using it, and a tier patch would land in each
  copy. Asana's several ways to model levels made that visible.
- Comparing versions at every run costs every run; a failure is rare and can carry its own report.

## Rejected

- A frontmatter marker for capability interfaces (O4): invisible in a file listing; the name already carries form.
- Guidance only (O5): nothing checks that two capability references agree.
- General interface composition (O6): reopens N16 for one case.
- One reference per system holding the HOW too (O15, O16): duplicates the facts per variant, or puts the user's pick
  inside a document.
- Assembling blueprints from pieces with constraints (O23): needs a constraint system and scatters one solution.
- Runtime comparison (O38) and an age warning on Verified (O39).
- `test`, `check --live`, or a separate `/capabilities` router for the doctor (O46 to O48).
- No registry for capability references (O51): nowhere to look up whether a system is already described.
- Writing the user page only with the build (O54): authors would have only the spec until then.

## Follow-up outside this repository

repobuddy's `project-tracker.capabilities` interface defines HOW, so under this design it becomes a blueprint
interface, `project-tracker.blueprints`, and its GitHub, GitLab, and Jira implementations split into a capability
reference per system and a blueprint each. A rename table (K38) carries the old names. The host-to-tracker mapping in
its skills moves into each capability reference's Detect. That work is repobuddy's to file.
