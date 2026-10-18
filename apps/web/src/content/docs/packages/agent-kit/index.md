---
title: agent-harness
description: Overview of @cyberuni/agent-harness, the library, command line, and agent plugin that detect the running AI agent harness and resolve its reference documents.
sidebar:
  order: 0
---

`@cyberuni/agent-harness` is one package that ships three things. They share one implementation, so
an answer from the library, the command line, and the plugin's skill agree.

| Surface | What it is | Where |
| --- | --- | --- |
| Library | Functions that detect the running harness and query what it holds. | [Library API](/uni-agent-kit/packages/agent-kit/library/) |
| Command line | The `agent-harness` command, which reads and writes reference documents. | [CLI](/uni-agent-kit/packages/agent-kit/cli/) |
| Agent plugin | The `cyber-agent-harness` plugin, which carries the `reference` skill. | [Skills](/uni-agent-kit/packages/agent-kit/skills/) |

The plugin declares four harnesses in its `plugin.json`: Claude Code, Cursor, Codex, and GitHub
Copilot CLI. The library detects thirteen; see [harness detection](/uni-agent-kit/concepts/harness-detection/)
for the list and the evidence behind each.

## Where to go next

1. [Install](/uni-agent-kit/packages/agent-kit/install/) the package or the plugin.
2. Read the [`reference` skill](/uni-agent-kit/packages/agent-kit/skills/reference/) to see what you can ask for.
3. Look up a [command](/uni-agent-kit/packages/agent-kit/cli/) when you run one yourself.
