---
'cyber-agentkit': minor
---

`skill test` and `skill case try` take their sandbox from the new YAML reference `skill-design.test.sandbox`, or
from `--sandbox <template>` for one run. The `default` template is the sandbox they used before. On a machine
that cannot run that sandbox, the `folder-only` template runs shell commands, setup scripts, and `script` checks
with no sandbox, on both backends, and the file tools still reach only the run's folder. Only the managed, repo,
and user tiers choose the template. A folder-only result records `sandbox: none`, and lists in `wroteOutside` each
path outside the run's folders that a shell command changed.
