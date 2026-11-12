---
"cyber-agentkit": minor
---

Make a saved `skill test` result explain itself. Every run's whole reply, passed, failed, or not run, with the skill and without it, is now saved beside the result in `<at>.replies.json`, which the result names in `replies`; the text report prints its path, and the result also records promptfoo's `evalId`. A run that errored gives one short reason, such as `Not logged in`, instead of the Agent SDK's full `Error calling Claude Agent SDK: …` message, in the result and in the progress lines. When the last saved result predates the run count, the plan line says it made an unknown number of runs instead of guessing. The expected result keeps its shape: `skill accept` and `--accept` leave `replies` and `evalId` out.
