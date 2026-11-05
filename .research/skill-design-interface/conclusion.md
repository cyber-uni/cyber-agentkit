# Conclusion: a skill design interface and who owns it

## Last updated

November 2026

## Question

Issue #153 proposes a `skill-design` reference interface: the stages a skill author goes through, with separation of concerns as one aspect. Do the skill-writing tools not yet surveyed change the proposed aspect list, and which plugin should define the interface, provide the front-facing skill, and supply the implementations?

## Verdict

1. **The aspect list needs a lifecycle group, and A11 is not an empty gap.** Nine sources are now read. Only one, rebelytics' task-observer, has a step for separating configuration from process (the three-container rule). No source has the step as #153 frames it: a named reference with a default inside the skill, which another team can override.
2. **Add two optional aspects, Distribution and Lifecycle.** Fold writing style and the content budget into Shape and Trigger. Leave session learning and failure attribution out: they automate running the process and are not steps in it.
3. **Ownership follows option O1, split by role** (decided by the owner, November 2026).
   - `cyber-agentkit` defines the interface (the contract only: section names, required or optional, the link to the agentskills.io floor) and owns the Concerns aspect, including the scan helper.
   - `aced` provides the front door and the default implementation. The front door is `/skill`, a routing skill. The existing aced authoring skills are removed in its favor.
   - `universal-plugin` implements Compatibility and Distribution.

## Reference material

| Role | Owner | Why |
| --- | --- | --- |
| R1 Defines the interface | cyber-agentkit | Already owns the reference mechanism, depends on no other agent-layer package, and is the natural home of the interface registry (#151) |
| R2 Front-facing skill | aced, as `/skill` | Users already know aced's skill authoring; `/skill` routes (A2) to the right artifact and loads the interface |
| R3 Meat, Intent / Shape / Trigger / Security / Verification | aced | Holds the five questions, three patterns, description rules, structural audit, eval loop |
| R3 Meat, Compatibility / Distribution | universal-plugin | Already derives each harness's files from one manifest |
| R3 Meat, Concerns and the scan helper | cyber-agentkit | Owns the reference feature the helper reads |

| New candidate aspect | Seen in |
| --- | --- |
| Distribution | Vercel skills CLI; rebelytics |
| Lifecycle (probation, pruning, retirement with harvest, rollback) | autoharness; rebelytics; Memento-Skills |
| Sibling reconciliation (families, umbrella skills, shared core) | autoharness; rebelytics |
| Writing style and content budget | plugin-dev skill-development |

## Confidence

High on what each source says: all were read in the primary text. Medium on the generalization that no source separates configuration from process the way #153 means. Ownership is a decision, not a finding.

## Strongest supporting evidence

- Rebelytics states the three-container rule in terms close to Concerns step 1: "would a different person running this skill need a different value here?" Its precedence rule (config wins for configuration, the skill wins for process, config can never relax a rule) is a ready answer for Q2.
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
- Q1 (one interface or many), Q2 (mixing), Q4 (required aspects), Q5 and Q6 (command name and visibility), Q7 (who moves aced onto the interface) and Q9 (checking substitutability) remain open. O1 leans toward Q1 answered "many", since each aspect then has a natural owner.

## What should be checked again later

- Re-verify the sources above: they are repositories and change.
- Read the unread files listed above and revise the aspect list if they add a stage.
