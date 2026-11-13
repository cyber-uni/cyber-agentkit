---
id: skill-design.aspects.verification
description: "What an implementation of the Verification aspect of /skill must contain: how a skill's eval cases and rubrics are written, run, and saved."
plugins:
  - name: cyber-agentkit
    url: https://github.com/cyber-uni/cyber-agentkit/tree/main/packages/cyber-agentkit
implementations:
  - name: cyber-agentkit default
    url: https://github.com/cyber-uni/cyber-agentkit/blob/main/packages/cyber-agentkit/references/skill-design.aspects.verification.md
usage:
  - name: cyber-agentkit:skill
    url: https://github.com/cyber-uni/cyber-agentkit/tree/main/packages/cyber-agentkit/skills/skill
tags: [skill-design, aspect, verification, evals]
status: stable
interface: https://github.com/cyber-uni/cyber-agentkit/blob/main/packages/cyber-agentkit/references/skill-design.aspects.verification.interface.md
---

The `skill` skill works through a skill's aspects in turn. This one is a `one` interface, so a team
swaps the whole aspect by shipping its own `skill-design.aspects.verification` that implements it, in a
plugin or in the repo or user tier. The default ships with cyber-agentkit.
