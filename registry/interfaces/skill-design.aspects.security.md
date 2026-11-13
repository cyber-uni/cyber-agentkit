---
id: skill-design.aspects.security
description: "What an implementation of the Security aspect of /skill must contain: the checks that a skill is safe to share and to run."
plugins:
  - name: cyber-agentkit
    url: https://github.com/cyber-uni/cyber-agentkit/tree/main/packages/cyber-agentkit
implementations:
  - name: cyber-agentkit default
    url: https://github.com/cyber-uni/cyber-agentkit/blob/main/packages/cyber-agentkit/references/skill-design.aspects.security.md
usage:
  - name: cyber-agentkit:skill
    url: https://github.com/cyber-uni/cyber-agentkit/tree/main/packages/cyber-agentkit/skills/skill
tags: [skill-design, aspect, security]
status: stable
interface: https://github.com/cyber-uni/cyber-agentkit/blob/main/packages/cyber-agentkit/references/skill-design.aspects.security.interface.md
---

The `skill` skill works through a skill's aspects in turn. This one is a `one` interface, so a team
swaps the whole aspect by shipping its own `skill-design.aspects.security` that implements it, in a
plugin or in the repo or user tier. The default ships with cyber-agentkit.
