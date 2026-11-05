# Skill design interface (November 2026)

## Question

See `conclusion.md`. Issue #153 proposes the interface; this topic records the survey gaps it listed (Q8) and the ownership decision.

## Scope

In: the stages each surveyed tool walks a skill author through, whether any separates configuration from process, and which plugin should own each role. Out: implementing the interface, the scan command's name (Q5), and the registry (#151).

## Source angles

- Anthropic plugin-dev `skill-development` skill (authoring process)
- Vercel `skills` CLI (scaffolding and distribution)
- autoharness, one-skill-to-rule-them-all, Memento-Skills (automation and lifecycle)
- The nine-source survey already in #153 (aced, universal-plugin, skill-creator, the Agent Skills specification, mattpocock/skills)

## Findings

### Vercel skills CLI
`init` only writes a SKILL.md template with placeholder headings. It has no design stages. It contributes distribution (GitHub or URL install, a registry, an internal flag) and a table of about 50 per-harness skill folders (data for Placement and Compatibility). E1.

### plugin-dev skill-development
Six ordered steps: understand with examples, plan resources, create structure, edit resources first then the skill, validate, iterate. Covers A1, A3, A4, A7, A9, A10. Adds writing style, a content budget, and a taxonomy of resource kinds. Its split of knowledge from procedure is motivated by context size. E2, E3.

### autoharness
Automation with a lifecycle on top: it captures lessons from sessions, prefers patching to creating, merges narrow skills into umbrella skills, and prunes unused ones after probation. Adds lifecycle and sibling reconciliation. E4.

### one-skill-to-rule-them-all
A real process, the richest of the three. Authoring rules cover open-source versus internal, a pre-flight check, progressive disclosure, description readers, runtime prerequisites, hostile tests for shipped scripts, and three eval scenarios written first. Adds upstream checks, skill families, retirement with harvest, and licensing. Its three-container rule is the only A11 prior art. E5, E6.

### Memento-Skills
A runtime that attributes a failure to one skill, rewrites it in isolation, gates it, and deploys or rolls back. Its bundled skill-creator is a modified copy of Anthropic's. Adds rollback and failure attribution. E7.

### Ownership
Decided by the owner: O1, split by role. Considered and not chosen: aced owns everything (a plugin that does not use aced could not implement the interface without depending on it), and a new neutral plugin (a fourth plugin, and aced's rules would have to move out).

## Contradictions

- #153 cites the plugin-dev skill in the claude-code repository. It is in the claude-plugins-official repository.
- #153 guessed that the three stars-index tools were automation only. That holds for autoharness and the Memento runtime, not for rebelytics.

## Open questions

See "Where evidence is thin" in `conclusion.md`.

## Sources consulted

- https://github.com/vercel-labs/skills
- https://github.com/anthropics/claude-plugins-official/blob/main/plugins/plugin-dev/skills/skill-development/SKILL.md
- https://github.com/tigerless-labs/autoharness
- https://github.com/rebelytics/one-skill-to-rule-them-all
- https://github.com/Memento-Teams/Memento-Skills
