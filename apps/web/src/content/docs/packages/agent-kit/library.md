---
title: Library API
description: The functions @cyberuni/agent-harness exports to detect the running harness, query what it holds, and resolve reference documents.
sidebar:
  order: 3
---

```sh
npm install @cyberuni/agent-harness
```

```ts
import { detectHarness, skillsDirectories } from '@cyberuni/agent-harness'

const { harness } = detectHarness() // 'claude-code', 'codex', …, or 'unknown'
if (harness !== 'unknown') skillsDirectories(harness)
```

`detectHarness()` reports `unknown` rather than guess when no harness matches or more than one does.

## Harness queries

| Function | Answers |
| --- | --- |
| `detectHarness()` | Which harness is running |
| `managedPolicyLocations()` | Where managed policy lives: files, MDM domains, registry keys, servers |
| `pluginStorage()` | Where installed plugins, marketplaces, and the enabled record live |
| `enabledPlugins()` | Which plugins are enabled, resolved by scope precedence |
| `installedPlugins()` | Which plugins are installed, and the folder each one loads from |
| `skillInvocation()` | How a user types a plugin's skill, such as `/my-plugin:review` |
| `supportsPluginDependencies()` | Whether a plugin can declare other plugins it depends on |
| `skillsDirectories()` | Which project and user directories the harness reads skills from |

## Reference documents

`loadReference()` resolves a named document across the managed, project, user, and plugin tiers.
`createReferenceCommand()` and `createReferenceCommands()` build the [`reference` command](/uni-agent-kit/packages/agent-kit/cli/)
for a host CLI. The concepts behind them are in [reference documents](/uni-agent-kit/concepts/reference-documents/)
and [reference interfaces](/uni-agent-kit/concepts/reference-interfaces/).

## Full signatures

The [package readme](https://github.com/spikyuni/uni-agent-kit/tree/main/packages/agent-kit#readme)
documents each function with its options, return shape, and the research claim behind each answer.
