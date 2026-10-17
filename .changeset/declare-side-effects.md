---
"@cyberuni/agent-harness": patch
---

Declare `sideEffects` in `package.json` so bundlers can drop unused modules, including the bundled `yaml` parser. Only the `bin` launcher, the CLI bundle, and the skill scripts are marked as having side effects.
