---
"cyber-agentkit": minor
---

`skill check` with no folder checks every skill in the repository and gives one summary and one exit code. It finds
each skill under `skills` and `.agents/skills`, or under each `--dir` given instead, where a `--dir` may be a glob
such as `plugins/*/skills` or `**/skills`. A skill reached twice, such as through a symlink, is checked once. The
exit follows `--fail-on` over every check of every skill, and finding no skill exits 1 with `no-skills`.
