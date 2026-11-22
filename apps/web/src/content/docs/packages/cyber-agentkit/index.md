---
title: Get started
description: Overview of cyber-agentkit, an agent-harness-agnostic toolkit shipped as a library, a command line, and an agent plugin.
sidebar:
  order: 0
---

`cyber-agentkit` is an agent-harness-agnostic toolkit shipped as a library, a command line, and an agent plugin.

| Surface | What it is | Where |
| --- | --- | --- |
| Agent plugin | The `cyber-agentkit` plugin, which ships the `asset`, `dependency`, `instruction`, `prose-update`, `reference`, `skill`, and `skillify` skills. | [Skills](/cyber-agentkit/packages/cyber-agentkit/skills/) |
| Command line | The `cyber-agentkit` command, which runs the `reference`, `asset`, `prose-update`, `skill`, `instruction`, `harness`, and `dependency` commands. | [CLI](/cyber-agentkit/packages/cyber-agentkit/cli/) |
| Library | Functions that detect the running harness, query what it holds, check a plugin's dependencies, resolve reference documents, and lease git worktrees. | [Library API](/cyber-agentkit/packages/cyber-agentkit/library/) |

The plugin declares four harnesses in its `plugin.json`: Claude Code, Cursor, Codex, and GitHub
Copilot CLI. The library detects thirteen; see [harness detection](/cyber-agentkit/concepts/harness-detection/)
for the list and the evidence behind each.

## Where to go next

1. [Install](/cyber-agentkit/packages/cyber-agentkit/install/) the package or the plugin.
2. Read the [skills](/cyber-agentkit/packages/cyber-agentkit/skills/) to see what you can ask for.
3. Look up a [command](/cyber-agentkit/packages/cyber-agentkit/cli/) when you run one yourself.
