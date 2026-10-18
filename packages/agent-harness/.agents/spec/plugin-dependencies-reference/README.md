---
spec-type: reference
concept: plugin-dependencies
---

# plugin-dependencies reference — how to bring a plugin's dependencies into place

## Subject

The Markdown document `packages/agent-harness/references/plugin-dependencies.md`, shipped in the plugin and loaded by
name through the `reference` skill (`reference show plugin-dependencies`). A plugin's own README or skill points an
agent at it when a plugin it needs is missing.

It tells an agent what a plugin declares and where, how to run the check, and the steps per harness: Claude Code, which
resolves dependencies itself, and every other harness, where nothing is resolved for the user and no install command is
given. It is written from the same facts as the [dependencies](../dependencies/README.md) check, by
`renderDependencyReference()`; a repository test fails while the committed file differs from the generator's output.
It carries no suite: its text is checked by that test, not by scenarios.
