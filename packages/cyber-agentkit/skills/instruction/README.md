# Instruction

Measures an always-loaded instruction, such as an `AGENTS.md` section or a section of a user's global instruction
file, by running it. An author, or a tool that offers vetted sections such as `buddy-agent-harness:enhance`, asks
`/instruction compare` which of two wordings serves a repository better, and gets each criterion's pass rate for each
wording and the wording that wins, saved like a `/skill test` result. It does not measure a skill: `/skill test` does
that.

| Command | Does |
| --- | --- |
| `compare` | runs the same outcome cases with each wording loaded as the project instruction file, and reports per-criterion pass rates and the winner |

```text
/instruction compare 'AGENTS.md#Commit Discipline' drafts/commit-discipline.md
```

A wording is a file, or one section of a file named as `<file>#<heading>`. The cases live in
`.agents/instruction-design/cases/<name>.yaml`, or the file `--cases` names; with none, the skill drafts them for
approval. Installed as a Claude Code plugin, it is `/cyber-agentkit:instruction` (pnpm install: `pnpm-cyber-agentkit-instruction`).

It ships in the `cyber-agentkit` plugin:

```text
/plugin marketplace add cyber-uni/marketplace
/plugin install cyber-agentkit@cyber-uni
```
