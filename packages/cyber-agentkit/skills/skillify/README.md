# Skillify

Turns work already done into a skill. The author points it at the work (this session by default, or a document,
another skill, or past sessions), and gets back a new skill built by `/skill create` from a description `/skillify`
writes: the job, the corrections, the fixed steps, and the words used to ask, each citing where in the sources it came
from. To write a skill from a job described in words, use `/skill create` directly.

Type `/skillify` to run it yourself. Installed as a Claude Code plugin, it is `/cyber-agentkit:skillify` (pnpm install: `pnpm-cyber-agentkit-skillify`).

It ships in the `cyber-agentkit` plugin:

```text
/plugin marketplace add cyber-uni/marketplace
/plugin install cyber-agentkit@cyber-uni
```
