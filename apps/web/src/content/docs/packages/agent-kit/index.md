---
title: cyber-agentkit
description: Overview of cyber-agentkit, an agent-harness-agnostic toolkit shipped as a library, a command line, and an agent plugin.
sidebar:
  order: 0
---

`cyber-agentkit` is one package that ships three things. They share one implementation, so
an answer from the library, the command line, and the plugin's skill agree.

| Surface | What it is | Where |
| --- | --- | --- |
| Library | Functions that detect the running harness and query what it holds. | [Library API](/cyber-agentkit/packages/agent-kit/library/) |
| Command line | The `cyber-agentkit` command, which reads and writes reference documents. | [CLI](/cyber-agentkit/packages/agent-kit/cli/) |
| Agent plugin | The `cyber-agentkit` plugin, which carries the `reference` skill. | [Skills](/cyber-agentkit/packages/agent-kit/skills/) |

The plugin declares four harnesses in its `plugin.json`: Claude Code, Cursor, Codex, and GitHub
Copilot CLI. The library detects thirteen; see [harness detection](/cyber-agentkit/concepts/harness-detection/)
for the list and the evidence behind each.

## Where to go next

1. [Install](/cyber-agentkit/packages/agent-kit/install/) the package or the plugin.
2. Read the [`reference` skill](/cyber-agentkit/packages/agent-kit/skills/reference/) to see what you can ask for.
3. Look up a [command](/cyber-agentkit/packages/agent-kit/cli/) when you run one yourself.
