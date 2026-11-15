---
"cyber-agentkit": minor
---

`skill test` runs a case's setup script before the model starts. An outcome case in `evals.yaml` may name `setup`, a
script relative to `evals/`; each run, with and without the skill and on both backends, runs it in its folder after the
case's files are committed, so the prompt holds only the request. A failing setup script reports the run as not run,
with the script's output, and counts toward no pass rate.

Setup scripts and `script` checks now run contained in Anthropic's sandbox runtime: they write only to the run's
folders and reach no network. When that sandbox cannot start (on Linux and WSL it needs bubblewrap and socat), the test
stops with `error: sandbox:`. For a skill outside the repository, `skill test` lists its scripts and runs none without
`--trust-scripts`.

`skill case add <skill> <case> --prompt <request> [--setup]` scaffolds a case's entry, files folder, and setup script,
and `skill case remove <skill> <case>` deletes only that case's entry and files. Both refuse a path outside the skill's
`evals/` folder. The Verification aspect documents both, and its new VER-9 flags a prompt that tells the model to run a
setup script.
