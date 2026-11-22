---
title: Library API
description: The functions cyber-agentkit exports to detect the running harness, query what it holds, resolve reference documents, and lease git worktrees.
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
| `installedHarnesses()` | Which harnesses are installed here, by their command on `PATH`; see [Running and installed harnesses](/cyber-agentkit/concepts/harness-detection/#running-and-installed-harnesses) for which ones it can find |
| `presentHarnesses()` | The harnesses to act for: the running one, or with `all: true` also every harness set in the environment and every installed one |
| `managedPolicyLocations()` | Where managed policy lives: files, MDM domains, registry keys, servers |
| `pluginStorage()` | Where installed plugins, marketplaces, and the enabled record live |
| `enabledPlugins()` | Which plugins are enabled, resolved by scope precedence |
| `installedPlugins()` | Which plugins are installed, and the folder each one loads from |
| `skillInvocation()` | How a user types a plugin's skill, such as `/my-plugin:review` |
| `supportsPluginDependencies()` | Whether a plugin can declare other plugins it depends on |
| `skillsDirectories()` | Which project and user directories the harness reads skills from |

## Reference documents

`loadReference()` composes a named document from its contributions in the managed, repo, user, plugin, and default tiers.
`createReference()`, `customizeReference()`, and `deleteReference()` write and delete a contribution, as the
`create`, `customize`, and `delete` subcommands do; `customizeReference()` runs no model. `migrateReferences()`
returns the plan `reference migrate` prints, and applies it with `write: true`. `referenceImplementations()` lists the implementations
of an interface and, for a `one` interface, the one in use (`inUse`). Given a family `<prefix>.*`, it lists every
interface under the prefix, and `customizeReference()` writes the same picks for each; `isFamilyName()` tells a family
from a single name. A function that cannot
complete throws `ReferenceError`, which carries a stable `code`. `createReferenceCommand()` and
`createReferenceCommands()` build the [`reference` command](/cyber-agentkit/packages/cyber-agentkit/cli/)
for a host CLI. Pass `path`, the command line that reaches them in that CLI, such as
`buddy-agent-harness reference`, so each command's help examples start with it. `createAssetCommand()` takes
the same `path` for the `asset` commands. The concepts behind them are in [reference documents](/cyber-agentkit/concepts/reference-documents/)
and [reference interfaces](/cyber-agentkit/concepts/reference-interfaces/).

## Prose update

`classify({ found, offered, history })` compares prose a tool wrote earlier, and its owner may have edited, with the
wording the tool offers now. Text is divided into parts by heading path and compared sentence by sentence against the
retired wording the found text descends from. Each part gets one outcome: `up-to-date`, `update` (the merged text, with
the owner's sentences kept), `owners`, `conflict` (the colliding sentences), or `undetermined` (with a reason). It
returns the same answer for the same inputs and never calls a model. `parseHistory()` reads a history text of retired
wordings, newest first, and `retire()` returns that text with an outgoing wording added. The
[`prose-update` skill](/cyber-agentkit/packages/cyber-agentkit/skills/prose-update/) builds on them and resolves what
the facts leave open.

## Worktrees

The `cyber-agentkit/worktrees` subpath leases git worktrees to concurrent agent sessions, so two
sessions never share a checkout. It never fetches and never kills a process.

```ts
import { acquire, release } from 'cyber-agentkit/worktrees'

const lease = await acquire({ holder: 'my-agent', branch: 'feat/x', max: 4 })
// … work in lease.worktree …
await release(lease)
```

| Function | Does |
| --- | --- |
| `acquire(options)` | Leases a worktree. It recycles an idle one it owns, else creates one at the next free slot below `max` |
| `explain(options)` | Lists every worktree of the repository with the reason it cannot be reused, or none |
| `release(lease)` | Gives the lease back. It does not recycle the worktree; the next `acquire` does, after a probe |
| `claimLease()`, `holdsLease()` | Takes a lease on a worktree, and tells whether a lease is still held |
| `pruneWorktrees(options)` | Removes the worktrees it owns that are unleased, idle, clean, and landed. A dry run unless `apply` is set |
| `removeWorktree(options)` | Removes the one worktree you name, under the same checks. `force` waives some of them |
| `seedWorktree(source, worktree, options)` | Copies the gitignored files a `.worktreeinclude` names into a new or recycled worktree |
| `listWorktrees()`, `occupants()`, `classifyOwner()` | Lists the worktrees of a repository, the sessions working in each, and who owns each |

A lease is git's own worktree lock, so `git worktree remove` refuses a leased worktree too.

`acquire` and `explain` skip a worktree when it is the primary checkout, owned by another tool or person,
leased, prunable, busy, dirty, or not landed on the reset target. The verdict names the reason. The
checks fail closed: when git cannot say whether a worktree is clean or landed, it is left alone. When
the process probe cannot read processes, `acquire` proceeds and marks the result `verified: false`,
unless `strict` is set. `pruneWorktrees` and `removeWorktree` skip by default in that case, since
removal cannot be undone.

`acquire` throws `AcquireError` with a `code` of `pool-full`, `no-base`, or `contended`. Services left
running in a worktree with no live session behind them come back as `lingering`, for the caller to
reclaim.

## Full signatures

The [package readme](https://github.com/cyber-uni/cyber-agentkit/tree/main/packages/cyber-agentkit#readme)
documents the harness and reference functions with their options, return shapes, and the research claim behind each answer.
