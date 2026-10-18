# agent-harness

[![npm](https://img.shields.io/npm/v/@cyberuni/agent-harness.svg)](https://www.npmjs.com/package/@cyberuni/agent-harness)
[![release](https://github.com/spikyuni/uni-agent-kit/actions/workflows/release.yml/badge.svg)](https://github.com/spikyuni/uni-agent-kit/actions/workflows/release.yml)
![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

**Status: pre-release.** `@cyberuni/agent-harness` is published on npm, and its API may still change
between minor versions.

## The problem

Every tool that works across AI coding agents, such as a plugin installer, a doctor script, or a
config migrator, ends up re-detecting which harness it is running under. Each does this separately,
with its own guesses about env vars, file paths, and process trees, and each guess decays
differently as vendors change their tooling.

`agent-harness` is a toolkit that does this detection once, depending on no other agent tool, so
[`universal-plugin`](https://github.com/cyberuni/universal-plugin),
[`buddy-agent-harness`](https://github.com/repobuddy/buddy-agent-harness), `repobuddy`, and
`cyberlegion/cyber-mux` can share one implementation instead of maintaining four.

## What it does

```sh
npm install @cyberuni/agent-harness
```

```ts
import { detectHarness, skillsDirectories } from '@cyberuni/agent-harness'

const { harness } = detectHarness() // 'claude-code', 'codex', …, or 'unknown'
if (harness !== 'unknown') skillsDirectories(harness)
```

It detects Claude Code, Cursor, Codex, GitHub Copilot CLI, OpenCode, Kilo Code, Gemini CLI, Qwen
Code, GitHub Copilot in VS Code, Cline, Crush, OpenHands, and the Auggie CLI. It reports `unknown`
rather than guess when no harness matches or when more than one does.

For a known harness it also answers what that harness holds:

| Function | Answers |
| --- | --- |
| `managedPolicyLocations()` | Where managed policy lives: files, MDM domains, registry keys, servers |
| `pluginStorage()` | Where installed plugins, marketplaces, and the enabled record live |
| `enabledPlugins()` | Which plugins are enabled, resolved by scope precedence |
| `installedPlugins()` | Which plugins are installed, and the folder each one loads from |
| `skillInvocation()` | How a user types a plugin's skill, such as `/my-plugin:review` |
| `supportsPluginDependencies()` | Whether a plugin can declare other plugins it depends on |
| `skillsDirectories()` | Which project and user directories the harness reads skills from |

It also resolves reference documents: named Markdown files an agent reads on demand, layered across
the managed, project (`.agents/references/`), user (`~/.agents/references/`), and plugin tiers.
`loadReference()` resolves one, and the `agent-harness reference` command shows, lists, searches,
and creates them.

The [package readme](packages/agent-kit/readme.md) documents each function, the signal behind
each harness, and the cases that report `unknown`.

## Research first

Every harness fact the library encodes rests on a claim in
[`.research/harness-detection`](.research/harness-detection), recorded with a source URL and a
confidence rating. Results carry the IDs of the claims behind them. The library does not detect a
harness it has not verified: Goose, Antigravity, Rovo Dev, Kiro, Amp, Factory Droid, Devin Desktop,
and Warp are left out because none has a verified signal. See
[`.research/README.md`](.research/README.md) for how topics are organized.

## Layout

| Path | Contents |
| --- | --- |
| `packages/agent-kit` | The published library |
| `.research/` | Vendor findings, each claim recorded with a source URL |
| `apps/web` | The documentation site |

## Related

[`universal-plugin`](https://github.com/cyberuni/universal-plugin) builds cross-runtime AI agent
plugins from one canonical manifest; it consumes this library rather than duplicating its own
harness detection. [`buddy-agent-harness`](https://github.com/repobuddy/buddy-agent-harness) sets up
a repository's own agent configuration on the consuming side.

## License

MIT
