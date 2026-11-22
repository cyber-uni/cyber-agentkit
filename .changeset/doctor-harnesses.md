---
"cyber-agentkit": minor
---

`skill doctor` now checks the harness running now, and says so and reads only the harness-neutral files when none is detected. `--all-harnesses` checks every harness detected on this machine, with one report per harness. When Codex is checked, doctor reads the skill's `agents/openai.yaml` and warns where Codex would ignore the file or an icon. The JSON report is now `{ status, running, harnesses: [{ harness, source, status, skills }] }`.

New library functions: `installedHarnesses()` finds the harnesses whose verified command is on `PATH`, and `presentHarnesses()` returns the running harness, or with `all: true` every harness detected here. `referenceLayers()` takes a `harnesses` option in place of the detected ones.
