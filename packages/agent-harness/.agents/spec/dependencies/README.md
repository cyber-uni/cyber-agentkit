---
spec-type: behavioral
concept: plugin-dependencies
---

# dependencies — what a plugin needs, what is missing, what to do

> STUB from the scaffold. `## What` and `## Use Cases` are seeded from `src/dependencies/SPEC.md` and
> `.research/plugin-dependencies-and-overrides`; `## Control Flow`, `## Scenario map`, and the `.feature` are authored in
> the explore grill.

## What

Tells an agent or user which plugins a plugin needs, which of them the running harness lacks, and what to do about
it. Claude Code enforces dependencies itself; every other harness ignores them, so nothing warns anyone. This node
serves those cases. It is read-only: it never installs, enables, or removes anything.

**Non-goals:** installing or removing plugins; reference-keyed overrides (separate node, #110); resolving versions.

## Use Cases

_To be enumerated by actor in the grill. Seeds from the draft:_

- A user asks what a plugin is missing (`checkPluginDependencies`).
- A plugin's own text points an agent at the `plugin-dependencies` reference.
- A user finds a plugin did not load on Claude Code.
- A sibling tool gates a feature on a plugin being present.

## References

Claims behind this node are in `.research/plugin-dependencies-and-overrides/evidence.md` (E-DEP-1 to E-DEP-7).
