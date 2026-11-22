<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/web/src/assets/logo-dark.svg">
    <img src="apps/web/src/assets/logo-light.svg" alt="cyber-agentkit logo" width="96" height="96">
  </picture>
</p>

# cyber-agentkit

[![npm](https://img.shields.io/npm/v/cyber-agentkit.svg)](https://www.npmjs.com/package/cyber-agentkit)
[![release](https://github.com/cyber-uni/cyber-agentkit/actions/workflows/release.yml/badge.svg)](https://github.com/cyber-uni/cyber-agentkit/actions/workflows/release.yml)
![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)

An agent-harness-agnostic toolkit. It provides the fundamental features agent tools need and makes
each one work the same way across harnesses.

**Status: pre-release.** `cyber-agentkit` is published on npm, and its API may still change
between minor versions.

## The problem

Every tool that works across AI coding agents, such as a plugin installer, a doctor script, or a
config migrator, ends up solving the same basics for each harness on its own: which harness is
running, where it keeps its plugins and policy, what a plugin needs, where an override lives. Each
solves them with its own guesses about env vars, file paths, and process trees, and each guess
decays differently as vendors change their tooling.

`cyber-agentkit` does each of these once, depending on no other agent tool, so
[`universal-plugin`](https://github.com/cyberuni/universal-plugin),
[`buddy-agent-harness`](https://github.com/repobuddy/buddy-agent-harness), `repobuddy`, and
`cyberlegion/cyber-mux` share one implementation instead of maintaining four.

## What it does

It ships as a library, as the `cyber-agentkit` command, and as an agent plugin of the same name for
Claude Code, Cursor, Codex, and GitHub Copilot CLI. In Claude Code, install the plugin:

```text
/plugin marketplace add cyber-uni/marketplace
/plugin install cyber-agentkit@cyber-uni
```

[Install](https://cyber-uni.github.io/cyber-agentkit/packages/cyber-agentkit/install/) covers the other harnesses. To use it as a
library:

```sh
npm install cyber-agentkit
```

```ts
import { detectHarness, skillsDirectories } from 'cyber-agentkit'

const { harness } = detectHarness() // 'claude-code', 'codex', …, or 'unknown'
if (harness !== 'unknown') skillsDirectories(harness)
```

| Feature | What it gives you |
| --- | --- |
| Harness knowledge | Which harness is running, and what it holds: managed-policy locations, plugin storage, installed and enabled plugins, skill naming and directories, how to run it headless |
| Plugin dependencies | What a plugin declares it needs, whether the running harness has it, and the steps to settle the rest |
| Reference documents | Named documents an agent reads on demand, composed from contributions in the managed, repo, user, plugin, and default tiers, with a `reference` command and skill |
| Skill tooling | The `skill` command and skill: find, check, test, and examine a skill, and vet a third-party one before installing it |
| Instruction tooling | The `instruction` command and skill, which compare two wordings of an AGENTS.md section by running them, and `prose-update`, which updates prose a tool wrote without losing the owner's edits |
| Worktrees | Leasing git worktrees to concurrent agent sessions, so two agents never share a checkout |

Harness detection covers Claude Code, Cursor, Codex, GitHub Copilot CLI, OpenCode, Kilo Code, Gemini
CLI, Qwen Code, GitHub Copilot in VS Code, Cline, Crush, OpenHands, and the Auggie CLI. It reports
`unknown` rather than guess when no harness matches or when more than one does.

The [documentation site](https://cyber-uni.github.io/cyber-agentkit/) is the full reference:
[harness detection](https://cyber-uni.github.io/cyber-agentkit/concepts/harness-detection/) gives the signal behind each harness
and the cases that report `unknown`, and the site documents every
[command](https://cyber-uni.github.io/cyber-agentkit/packages/cyber-agentkit/cli/) and
[skill](https://cyber-uni.github.io/cyber-agentkit/packages/cyber-agentkit/skills/). The
[package readme](packages/cyber-agentkit/readme.md) documents each library function.

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
| `packages/cyber-agentkit` | The published library |
| `.research/` | Vendor findings, each claim recorded with a source URL |
| `apps/web` | The documentation site |

## Related

[`universal-plugin`](https://github.com/cyberuni/universal-plugin) builds cross-runtime AI agent
plugins from one canonical manifest; it consumes this library rather than duplicating its own
harness detection. [`buddy-agent-harness`](https://github.com/repobuddy/buddy-agent-harness) sets up
a repository's own agent configuration on the consuming side.

## License

MIT
