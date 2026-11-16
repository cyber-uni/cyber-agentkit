---
'cyber-agentkit': minor
---

`skill test`, `skill case try`, and `instruction compare` take their sandbox settings from the new YAML reference
`skill-design.test.sandbox`. The plugin ships two templates for it to extend. `skill-design.test.sandbox.claude-code`,
the default, is the sandbox they used before. `skill-design.test.sandbox.folder-only` is for a machine that cannot run
a sandbox: it runs shell commands, setup scripts, and `script` checks with no sandbox, on both backends, and the file
tools still reach only the run's folder. A managed, repo, or user file picks a template with
`extends: skill-design.test.sandbox.<template>` and may change any setting on top of it. `skill test --sandbox
<template>` picks one for a single run. An unknown key or a bad value stops the test before any run. A result records
which sandbox did not run, and lists in `wroteOutside` each path outside the run's folders that a shell command
changed.
