# Conclusion: a skill design interface and who owns it

## Last updated

November 2026

## Question

Issue #153 proposes a `skill-design` reference interface: the stages a skill author goes through, with separation of concerns as one aspect. Do the skill-writing tools not yet surveyed change the proposed aspect list, and which plugin should define the interface, provide the front-facing skill, and supply the implementations?

## Verdict

1. **The aspect list needs a lifecycle group, and A11 is not an empty gap.** Nine sources are now read. Only one, rebelytics' task-observer, has a step for separating configuration from process (the three-container rule). No source has the step as #153 frames it: a named reference with a default inside the skill, which another team can override.
2. **Add two optional aspects, Distribution and Lifecycle.** Fold writing style and the content budget into Shape and Trigger. Leave session learning and failure attribution out: they automate running the process and are not steps in it.
3. **Ownership: cyber-agentkit owns everything a user needs to start; aced and universal-plugin are extenders** (decided by the owner, November 2026; supersedes option O1).
   - `cyber-agentkit` owns the interface contracts (one interface per aspect), a default for every aspect, the scan helper, and the front door `/skill`, a routing skill. It already ships skills for its own features.
   - `aced` extends with its eval loop and audits. `universal-plugin` extends with per-harness manifests and distribution. aced's existing authoring skills are removed gradually (Q7).
4. **Substitutability is pre- and post-conditions, not text.** Each aspect is a pure function: an override may differ from the default in any way as long as its output meets the aspect's postcondition. So each aspect interface states its inputs and a checkable output.

## Reference material

| Role | Owner | Why |
| --- | --- | --- |
| R1 Defines the interfaces | cyber-agentkit | Owns the reference mechanism, depends on no other agent-layer package, and is the home of the interface registry (#151) |
| R2 Front-facing skill `/skill` | cyber-agentkit | A front door in another plugin would need that plugin installed before the contract and defaults are reachable |
| R3 Default for every aspect, Concerns, scan helper | cyber-agentkit | Owns the reference feature; Compatibility defaults rest on its harness research |
| R3 Extension, eval loop and audits | aced | Holds the structural audit and eval loop |
| R3 Extension, per-harness manifests and distribution | universal-plugin | Already derives each harness's files from one manifest |

| New candidate aspect | Seen in |
| --- | --- |
| Distribution | Vercel skills CLI; rebelytics |
| Lifecycle (probation, pruning, retirement with harvest, rollback) | autoharness; rebelytics; Memento-Skills |
| Sibling reconciliation (families, umbrella skills, shared core) | autoharness; rebelytics |
| Writing style and content budget | plugin-dev skill-development |

## Confidence

High on what each source says: all were read in the primary text. Medium on the generalization that no source separates configuration from process the way #153 means. Ownership is a decision, not a finding.

## Strongest supporting evidence

- Rebelytics states the three-container rule in terms close to Concerns step 1: "would a different person running this skill need a different value here?" Its precedence rule (config can never relax a rule) was considered as an answer to substitutability and withdrawn: it would make the default untouchable. Q2 is handled by customizing a family of references (Q1: many interfaces).
- Distribution appears in two sources and lifecycle in three, independently.

## Strongest weakening evidence

- plugin-dev moves schemas, policies, and templates into bundled reference files. This is close to A11 but its motive is context size, not letting a consumer swap a choice.
- Rebelytics' config is a private per-user file, not a named overridable reference. It is prior art for the test, not for the mechanism.

## What is not supported

- That any surveyed tool offers interchangeable implementations of a skill-authoring process.
- That Vercel's `init` command has any design process.

## Where evidence is thin

- Unread: the plugin-dev `skill-creator-original` reference, autoharness `skills_guard.py` and `format_spec.md`, rebelytics `weekly-review.md`, and the Memento-Skills `dream/` package. The Memento "dream" consolidation claim rests on its README.
- Whether the removal of aced's authoring skills covers all five (define-skill, skillify, improve-skill, improve, define-governance) is not settled. `define-governance` is a sibling for rule sets, which `/skill` routes to (A2).
- Decided: Q1 many interfaces; Q2 handled by extending `reference customize` to a family by wildcard; Q4 a default for every aspect in cyber-agentkit; Q7 gradual; Q9 pre- and post-conditions per aspect.
- Decided: aspect interfaces are named family, dot, aspect, each with a one-implementation setting, and no interface named for the family itself exists, so nothing collides with the many-implementations naming (id, dot, key). The family is a naming convention; a wildcard in customize and in the implementations listing is new work, and the spec lists interface composition as a non-goal today. Read in the spec and code; not exercised by a test.
- Decided: `/skill` has four commands, create, check (or doctor), fix (or improve), and enhance. Scan is the Concerns aspect's helper (`reference scan`), not a mode, which closes Q5 and Q6. Command meanings are a proposed reading recorded on the issue. The core aspects are a fixed sequence for create; the others are an open set found through the family wildcard, which enhance runs.
- Decided: the commands are create, check, fix, and enhance. Core versus open aspects is a convention in the `/skill` text (it names the four core aspects and their order); no interface flag. A plugin cannot add a core aspect; a field can be added later if needed.
- Deferred: whether the removal covers all of aced's authoring skills.

## What should be checked again later

- Re-verify the sources above: they are repositories and change.
- Read the unread files listed above and revise the aspect list if they add a stage.
