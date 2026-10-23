---
title: Library API
description: The functions cyber-agentkit exports to detect the running harness, query what it holds, and resolve reference documents.
sidebar:
  order: 3
---

```sh
npm install cyber-agentkit
```

```ts
import { detectHarness, skillsDirectories } from 'cyber-agentkit'

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

`loadReference()` composes a named document from its contributions in the managed, project, user, plugin, and default tiers.
`createReferenceCommand()` and `createReferenceCommands()` build the [`reference` command](/cyber-agentkit/packages/cyber-agentkit/cli/)
for a host CLI. The concepts behind them are in [reference documents](/cyber-agentkit/concepts/reference-documents/)
and [reference interfaces](/cyber-agentkit/concepts/reference-interfaces/).

## Prose merge

`classify({ found, offered, history })` compares prose a tool wrote earlier, and its owner may have edited, with the
wording the tool offers now. Text is divided into parts by heading path and compared sentence by sentence against the
retired wording the found text descends from. Each part gets one outcome: `up-to-date`, `update` (the merged text, with
the owner's sentences kept), `owners`, `conflict` (the colliding sentences), or `undetermined` (with a reason). It
returns the same answer for the same inputs and never calls a model. `parseHistory()` reads a history text of retired
wordings, newest first, and `retire()` returns that text with an outgoing wording added. The
[`merge-prose` skill](/cyber-agentkit/packages/cyber-agentkit/skills/merge-prose/) builds on them and resolves what
the facts leave open.

## Full signatures

The [package readme](https://github.com/cyber-uni/cyber-agentkit/tree/main/packages/cyber-agentkit#readme)
documents each function with its options, return shape, and the research claim behind each answer.
