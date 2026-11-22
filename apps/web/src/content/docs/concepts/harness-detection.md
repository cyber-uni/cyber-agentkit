---
title: Harness detection
description: How cyber-agentkit identifies which AI agent harness is running and which are installed, and when it answers unknown.
---

`detectHarness()` reads environment variables that each harness sets on the processes it spawns.
Every rule rests on a vendor source recorded in
[`.research/harness-detection`](https://github.com/cyber-uni/cyber-agentkit/tree/main/.research/harness-detection),
and every piece of evidence it returns names the research claim behind it.

## What each harness sets

A harness does not set the same variables everywhere it runs code. Your code can run in three
places: a command the agent runs in a shell or terminal, a hook the harness fires, or an MCP server
the harness starts. The table shows what identifies each harness in each place. A dash means no
rule applies there, so detection reports `unknown`.

| Harness | Commands the agent runs | Hooks | MCP servers |
| --- | --- | --- | --- |
| Claude Code | `CLAUDECODE=1` with `CLAUDE_CODE_CHILD_SESSION=1` or `CLAUDE_CODE_SESSION_ID` | Same as commands; also the status line | `CLAUDECODE=1` with `CLAUDE_CODE_SESSION_ID` (stdio servers) |
| Cursor | `CURSOR_AGENT=1` | `CURSOR_VERSION` with `CURSOR_PROJECT_DIR` | — |
| Codex | `CODEX_THREAD_ID` | — | — |
| GitHub Copilot CLI | `COPILOT_CLI=1` or `COPILOT_AGENT_SESSION_ID` | `COPILOT_PLUGIN_ROOT` (plugin hooks) | `COPILOT_CLI=1` or `COPILOT_AGENT_SESSION_ID` |
| OpenCode | `OPENCODE=1` with `OPENCODE_PID` | — | `OPENCODE=1` with `OPENCODE_PID` |
| Kilo Code | `KILO=1` with `KILO_PID` | — | `KILO=1` with `KILO_PID` |
| Gemini CLI | `GEMINI_CLI=1` | — | `GEMINI_CLI=1` |
| Qwen Code | `QWEN_CODE=1` | — | — |
| GitHub Copilot in VS Code | `COPILOT_AGENT=1` | — | — |
| Cline | `CLINE_ACTIVE=true` (VS Code extension only) | — | — |
| Crush | `CRUSH=1` | `CRUSH=1` | — |
| OpenHands | `AI_AGENT=openhands` (SDK 1.40.1 and later; not the OpenHands CLI 1.16.0) | `AI_AGENT=openhands`, or `OPENHANDS_EVENT_TYPE` with `OPENHANDS_PROJECT_DIR` | — |
| Auggie CLI | — | `AUGMENT_HOOK_EVENT` with `AUGMENT_PROJECT_DIR` | — |

## When the answer is unknown

The library reports `unknown` rather than guess:

- **`CLAUDECODE=1` on its own.** Claude Code's IDE extensions set it in their integrated
  terminals, where a person, not the agent, runs commands.
- **Borrowed names.** Codex, Copilot CLI, and Cursor pass `CLAUDE_PLUGIN_ROOT`,
  `CLAUDE_PLUGIN_DATA`, or `CLAUDE_PROJECT_DIR` to hooks for compatibility, so those names prove
  nothing.
- **Shared names.** OpenCode and Kilo Code set `AGENT=1`, and VS Code, Claude Code, and Crush set
  `AI_AGENT`. These say that some agent is running, not which one. The one exception is
  `AI_AGENT=openhands`, a value no other harness uses. OpenHands fills it in only when `AI_AGENT` is
  unset, so OpenHands started under another harness keeps the outer value and is seen only in its
  hooks. The OpenHands CLI 1.16.0 bundles an SDK older than that variable, so it too is seen only in
  its hooks.
- **Nested harnesses.** A harness started from another harness's shell inherits the outer
  harness's variables. With signals from two harnesses present, the environment cannot say which
  one is innermost. `candidates` lists both.
- **Contexts with no marker of their own.** Codex, Gemini CLI, and Qwen Code hooks, Qwen Code,
  Crush, OpenHands, and Auggie MCP servers, Auggie shell commands, Copilot in VS Code hooks and MCP
  servers, and the Cline CLI carry no variable that names the harness.
- **Harnesses with no verified signal.** Goose documents `GOOSE_TERMINAL=1`, but its shell tool
  does not set it. Antigravity, Rovo Dev, Kiro, Amp, Factory Droid, Devin Desktop, and Warp have no
  variable that could be verified from outside. The library does not detect them.

## Running and installed harnesses

`detectHarness()` answers which harness runs this process. `installedHarnesses()` answers which harnesses are
on this machine, and `presentHarnesses({ all: true })` joins the two. `cyber-agentkit` with no command reports
both in one call: `running` with the variables that showed it, and `installed` with the path that showed each
one. `skill doctor --all-harnesses` checks every harness `presentHarnesses({ all: true })` returns.

Each harness comes from one of three sources:

| Source | Means | Backed by |
| --- | --- | --- |
| `running` | The one harness whose rule matches this process's environment (the table above) | Environment variables |
| `environment` | One of several harnesses whose rules match, as in a nested session; `running` is then `unknown` | Environment variables |
| `installed` | Its headless command is on `PATH`; the command is not run | `claude`, `codex`, `copilot`, `cursor-agent`, `gemini`, or `qwen` |

A harness with no headless command is never reported installed. The Cursor IDE without `cursor-agent` and
GitHub Copilot in VS Code fall here. Every other signal for them was checked against vendor sources and
rejected:

- **A `cursor` or `code` command.** Cursor's command is added only by a menu action, and no current Cursor
  page documents it. `code` shows that VS Code is installed, not that Copilot is signed in or turned on
  (`chat.disableAIFeatures` turns it off), and Cursor can install a `code` command too.
- **App, user-data, or extension folders.** Cursor documents none of its folders. VS Code now ships Copilot
  Chat built in, so the extensions folder does not show it.
- **Config folders such as `~/.claude` or `~/.cursor`.** Other tools write into them.

Another program named like a harness command reads as that harness.

## Forks

A fork inherits its parent's code, and sometimes its variables. Kilo Code still sets OpenCode's
`OPENCODE=1`, but not `OPENCODE_PID`, which OpenCode's rule requires, so Kilo Code is read as Kilo
Code. Kilo Code started from an OpenCode shell carries both, which is nesting and gives `unknown`.
Qwen Code renamed Gemini CLI's variable to `QWEN_CODE`, so the two never overlap.

## Beyond detection

The same research backs the harness queries:

- `managedPolicyLocations()` lists the managed-policy files, MDM domains, registry keys, and
  server-side sources for each harness.
- `pluginStorage()` returns where plugins are installed and where the enabled record lives.
- `enabledPlugins()` reads the enabled record for Claude Code, Codex, and Copilot CLI, and names
  the policy sources it cannot read. The other harnesses keep no record it can resolve: Auggie's
  `enabledPlugins` merges only its `true` entries across scopes, and OpenHands keeps enabled state
  in per-plugin install metadata.
- `installedPlugins()` maps each installed plugin to the folder it is loaded from, for Claude Code,
  Codex, and Copilot CLI. Codex keeps no install record, so it applies Codex's own rule for which
  cached version is active.
- `skillInvocation()` returns what a user types to run a plugin skill, or `undefined` where the
  model loads skills itself: Gemini CLI, Qwen Code, Crush, and OpenHands. It
  also returns `undefined` for the Auggie CLI, where the typed form of a plugin skill is not
  confirmed.
- `skillsDirectories()` returns the project and user directories a harness reads skills from, or
  `undefined` where they are not confirmed: Qwen Code, Crush, and OpenHands.
