# @cyberuni/agent-harness

[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/spikyuni/uni-agent-kit/blob/main/LICENSE)

A toolkit for working with AI agent harnesses. Detect which one is running — Claude Code, Cursor,
Codex, GitHub Copilot CLI, OpenCode, Kilo Code, Gemini CLI, Qwen Code, GitHub Copilot in VS Code,
Cline, Crush, OpenHands, or the Auggie CLI — query what it holds (its managed-policy locations,
plugin storage, enabled plugins, how it names plugin skills, and how to run it headless), and
resolve the reference documents an agent reads on demand.

It depends on no other agent tool, so any of them can build on it.

**Status: pre-release.** Every fact this library encodes rests on
[`.research/harness-detection`](https://github.com/spikyuni/uni-agent-kit/tree/main/.research/harness-detection).

## Detect the harness

```ts
import { detectHarness } from '@cyberuni/agent-harness'

const result = detectHarness()
// {
//   harness: 'claude-code',
//   candidates: ['claude-code'],
//   evidence: [
//     { harness: 'claude-code', signal: 'CLAUDECODE', research: 'E-CC-D1', description: '…' },
//     { harness: 'claude-code', signal: 'CLAUDE_CODE_CHILD_SESSION', research: 'E-CC-D3', description: '…' },
//   ],
// }
```

Detection reads environment variables that each harness sets on the processes it spawns:

| Harness | Detected from |
| --- | --- |
| Claude Code | `CLAUDECODE=1` with `CLAUDE_CODE_CHILD_SESSION=1` or `CLAUDE_CODE_SESSION_ID` |
| Cursor | `CURSOR_AGENT=1`, or `CURSOR_VERSION` with `CURSOR_PROJECT_DIR` in hooks |
| Codex | `CODEX_THREAD_ID` |
| GitHub Copilot CLI | `COPILOT_CLI=1`, `COPILOT_AGENT_SESSION_ID`, or `COPILOT_PLUGIN_ROOT` in hooks |
| OpenCode | `OPENCODE=1` with `OPENCODE_PID` |
| Kilo Code | `KILO=1` with `KILO_PID` |
| Gemini CLI | `GEMINI_CLI=1` |
| Qwen Code | `QWEN_CODE=1` |
| GitHub Copilot in VS Code | `COPILOT_AGENT=1` |
| Cline | `CLINE_ACTIVE=true`, set by the VS Code extension only |
| Crush | `CRUSH=1` |
| OpenHands | `AI_AGENT=openhands`, or `OPENHANDS_EVENT_TYPE` with `OPENHANDS_PROJECT_DIR` in hooks |
| Auggie CLI | `AUGMENT_HOOK_EVENT` with `AUGMENT_PROJECT_DIR`, in hooks only |

It reports `unknown` instead of guessing:

- when no harness matches, including `CLAUDECODE=1` on its own, which IDE extensions also set;
- when more than one harness matches, as when one harness runs inside another's shell. The matches
  are listed in `candidates`;
- for `AGENT` and `AI_AGENT`, which several vendors set (only the exact value `AI_AGENT=openhands`
  counts), and for `OPENCODE=1` alone, which Kilo Code, an OpenCode fork, also sets;
- in contexts where a harness sets nothing of its own: Codex, Gemini CLI, and Qwen Code hooks, Qwen
  Code, Crush, OpenHands, and Auggie MCP servers, Auggie shell commands, OpenHands CLI 1.16.0 shell
  commands (its SDK predates `AI_AGENT=openhands`), and the Cline CLI;
- for harnesses with no verified signal, such as Goose, Antigravity, Rovo Dev, Kiro, Amp, Factory
  Droid, Devin Desktop, and Warp. The research records why for each one.

Pass `{ env }` to inspect an environment other than `process.env`.

## Managed policy

```ts
import { managedPolicyLocations } from '@cyberuni/agent-harness'

managedPolicyLocations('claude-code', { platform: 'linux' })
// [
//   { kind: 'server', location: 'claude.ai admin console or a self-hosted Claude apps gateway', … },
//   { kind: 'file', location: '/etc/claude-code/managed-settings.json', … },
//   { kind: 'directory', location: '/etc/claude-code/managed-settings.d', … },
//   { kind: 'file', location: '/etc/claude-code/managed-mcp.json', … },
// ]
```

`kind` is `file` or `directory` for what a caller can read from disk, `macos-managed-preferences`
or `windows-registry` for MDM delivery, and `server` for policy held by the vendor or the
organization. A `server` entry means the local files are not the whole policy.

## Plugin storage

```ts
import { pluginStorage } from '@cyberuni/agent-harness'

pluginStorage('codex')
// {
//   harness: 'codex',
//   configDir: '/home/me/.codex',
//   locations: [
//     { kind: 'plugin-cache', path: '/home/me/.codex/plugins/cache', … },
//     { kind: 'enabled-record', path: '/home/me/.codex/config.toml', … },
//   ],
// }
```

Paths are computed, not checked, so a location may not exist until the first plugin is installed.
Cursor has no `enabled-record`: no file records which of its plugins are enabled.

## Enabled plugins

```ts
import { enabledPlugins } from '@cyberuni/agent-harness'

const result = await enabledPlugins('claude-code')
// {
//   harness: 'claude-code',
//   supported: true,
//   plugins: [{ id: 'my-plugin@my-marketplace', enabled: true, scope: 'project', source: '/repo/.claude/settings.json' }],
//   sources: [{ scope: 'managed', path: '/etc/claude-code/managed-settings.json', found: false }, …],
//   unread: ['server-managed settings (claude.ai admin console or a self-hosted Claude apps gateway)', …],
//   research: ['E-CC-P3', …],
// }
```

| Harness | Files read, highest precedence first |
| --- | --- |
| Claude Code | managed `managed-settings.json`, `.claude/settings.local.json`, `.claude/settings.json`, `<config dir>/settings.json` |
| Codex | `<config dir>/config.toml` |
| GitHub Copilot CLI | managed `managed-settings.json`, `.github/copilot/settings.local.json`, `.github/copilot/settings.json`, `<config dir>/settings.json` |
| Cursor, OpenCode, Kilo Code, Gemini CLI, Qwen Code, Copilot in VS Code, Cline, Crush, OpenHands, Auggie CLI | none: `supported` is `false` |

Only plugins with an explicit entry are reported. A plugin with no entry falls back to a default
this package does not know. When `unread` is not empty, MDM or server-managed policy can still
override the answer.

## Installed plugins

```ts
import { enabledPlugins, installedPlugins } from '@cyberuni/agent-harness'

const installed = await installedPlugins('claude-code')
// {
//   harness: 'claude-code',
//   supported: true,
//   plugins: [{ id: 'my-plugin@my-marketplace', path: '/home/me/.claude/plugins/cache/my-marketplace/my-plugin/1.0.0', version: '1.0.0', scope: 'user', research: ['E-CC-P2'] }],
//   unresolved: [],
//   sources: [{ path: '/home/me/.claude/plugins/installed_plugins.json', found: true }],
//   unread: [],
//   research: ['E-CC-P2'],
// }

// The folder of each enabled plugin:
const enabled = new Set((await enabledPlugins('claude-code')).plugins.filter((p) => p.enabled).map((p) => p.id))
const folders = installed.plugins.filter((p) => enabled.has(p.id)).map((p) => p.path)
```

| Harness | Read from | Folder |
| --- | --- | --- |
| Claude Code | `<config dir>/plugins/installed_plugins.json` | `installPath`; one entry per scope a plugin is installed at |
| Codex | `<config dir>/plugins/cache/<marketplace>/<plugin>/` | `local` if present, else the highest version, as Codex picks it |
| GitHub Copilot CLI | `<config dir>/config.json` `installedPlugins` | `cache_path`; a direct install's `id` is its bare name |
| Cursor, OpenCode, Kilo Code, Gemini CLI, Qwen Code, Copilot in VS Code, Cline, Crush, OpenHands, Auggie CLI | none: `supported` is `false` | — |

`unresolved` lists Codex plugins whose cache mixes semver and non-semver version folders, where the
folder Codex picks depends on its sort. Copilot CLI loads plugins from a marketplace added by local
path in place, without an install record, so they appear in `unread` instead.

## Skill naming and plugin dependencies

```ts
import { skillInvocation, supportsPluginDependencies } from '@cyberuni/agent-harness'

skillInvocation('claude-code', { plugin: 'my-plugin', skill: 'review' })?.text // '/my-plugin:review'
skillInvocation('copilot-cli', { plugin: 'my-plugin', skill: 'review' })?.text // '/review'
skillInvocation('codex', { plugin: 'my-plugin', skill: 'review' })?.text // '$review'
skillInvocation('gemini-cli', { plugin: 'my-plugin', skill: 'review' }) // undefined: the model loads skills itself

supportsPluginDependencies('claude-code') // true; false for the others
```

## Skill directories

```ts
import { skillsDirectories } from '@cyberuni/agent-harness'

skillsDirectories('claude-code') // { project: ['.claude/skills'], user: ['.claude/skills'], research: ['E-CC-L1'] }
skillsDirectories('codex')?.project.includes('.agents/skills') // true
skillsDirectories('qwen-code') // undefined: not confirmed
```

Project directories are relative to the project root, user directories to the home directory. Only
directories read by default are listed; admin, bundled, and plugin skills are left out.

## Headless runs

How to run a harness on one prompt with no user present: the command, the model and permission
flags, the output formats and where token usage and cost appear in them, the transcript location,
and the documented exit codes. The library only describes the run; starting the process is up to
you.

```ts
import { headlessCommand, headlessInvocation } from '@cyberuni/agent-harness'

headlessCommand('claude-code', {
  prompt: 'Fix the failing test',
  model: 'sonnet',
  permission: 'unattended',
  outputFormat: 'stream-json',
})
// { executable: 'claude', args: ['-p', '--model', 'sonnet', '--permission-mode', 'bypassPermissions',
//   '--output-format', 'stream-json', '--verbose', 'Fix the failing test'] }

const codex = headlessInvocation('codex')
// codex.outputFormats[1]: { name: 'jsonl', args: ['--json'],
//   usage: { event: 'turn.completed', tokens: 'usage', accumulate: 'sum' } } (no dollar cost)

headlessInvocation('vscode-copilot').supported // false: no headless mode
headlessInvocation('opencode').supported // 'unknown': a one-shot mode exists, but its flags are not verified
```

Claude Code, Codex, Copilot CLI, Cursor, Gemini CLI, and Qwen Code are covered. `permission:
'unattended'` lets the run edit files and run commands without asking, so use it only in a
throwaway checkout. Exit codes are a weak signal: Claude Code documents only zero and non-zero, and
a run stopped by a turn or budget cap is told apart by the `result` message's `subtype`.

## Reference documents

A reference is a named Markdown document an agent reads on demand, such as a checklist or a set of
weights a skill applies. Anyone can override one without editing the plugin that ships it: a
project in `.agents/references/<name>.md`, a person in `~/.agents/references/<name>.md`.

```ts
import { loadReference } from '@cyberuni/agent-harness'

const resolved = await loadReference('agent-readiness-weights', {
	root: process.cwd(),
	// The plugin calling the resolver: its own `references/` is the first plugin layer.
	plugin: { name: 'my-plugin', root: pluginRoot },
})
if (resolved.status === 'found') console.log(resolved.content)
```

`status` is `found`, `missing`, or `ambiguous` (two plugins hold the name; ask for one of
`resolved.plugins`, such as `my-plugin/agent-readiness-weights`). `trace` says what each layer held.

Layers are read highest precedence first:

| Tier | Folders |
| --- | --- |
| managed | the admin `references/` folder, and a `references/` beside each detected harness's managed-policy files |
| project | `.agents/references/` in the root and each folder above it, up to the repository root |
| user | `~/.agents/references/` |
| plugin | the calling plugin's `references/`, each plugin the harness has enabled, then each package the project's `package.json` declares |

In each folder, `<name>.md` answers first, then `<name>/README.md`, `<name>/index.md`, and
`<name>/SKILL.md`. Legacy `governances/` folders are still read, below the `references/` beside
them.

A document's frontmatter `merge` says how it combines with the layers below:

- `first-wins` (the default): it replaces everything below.
- `combine`: it is placed above the layers below, each kept whole.
- `merge-sections`: its sections replace the same-titled sections below, matched by heading path,
  and the sections it does not redefine are kept. Under a heading, `<!-- merge: combine -->` appends
  to that section instead, and `<!-- merge: remove -->` deletes it.

Frontmatter is read as YAML. `merge`, `description`, and `tags` are the keys the resolver reads;
`resolved.metadata` holds every key, the higher layer winning. Frontmatter that is not a YAML
mapping is ignored with a warning.

| Function | Does |
| --- | --- |
| `loadReference(name, options)` | Resolves one name for a root, with every tier read |
| `referenceLayers(options)` | Builds the ordered layers, to resolve several names against |
| `resolveReference(name, layers)` | Resolves a parsed name (`parseReferenceName`) against layers |
| `listReferences(layers)`, `referenceNames(layers)` | Every name the layers hold, with the status of each copy |
| `listReferences(layers, { pattern })` | Every reference by exact name pattern, with tier, plugin, and ambiguity status |
| `searchReferences(query, layers)` | Names matching a query by name, description, heading, or body |
| `whereReference(name, layers, options)` | The project and user files an override can be written to |
| `managedReferencesDir()`, `projectReferencesDir()`, `projectReferenceLayers()` | Single folders and layers |
| `declaredDependencies()`, `packageDir()` | A manifest's declared packages, and where each is installed |

### The reference command

The package ships a `reference` command with `show`, `list`, `search`, `where`, `create`, and
`delete` subcommands:

```sh
npx -y @cyberuni/agent-harness reference show <name>... --root <repository root>
npx -y @cyberuni/agent-harness reference list
npx -y @cyberuni/agent-harness reference list 'project-tracker.capabilities.*'
npx -y @cyberuni/agent-harness reference create <name> --scope project
npx -y @cyberuni/agent-harness reference delete <name> --scope project --dry-run
```

`delete` removes only the copy in `.agents/references/` (`--scope project`) or
`~/.agents/references/` (`--scope user`), and reports which copy answers the name afterwards: the
plugin's copy, once a project override of it is gone. It refuses a plugin-shipped or managed copy.

Output is [TOON](https://github.com/toon-format/toon) by default, for an agent to parse; pass
`--format json` or `--format text` (`show`, `create`, and `delete` default to `text`). The formats
follow [`clibuilder`](https://www.npmjs.com/package/clibuilder) 12, and any other value is a
usage error (exit code 2). A CLI built on clibuilder 12
can host the same command under its own plugin name, imported from the `./commands` subpath. `--format`
is the host's global option, so the host's `cli({ format })` sets the default for every subcommand;
the `text` default of `show`, `create`, and `delete` belongs to the `agent-harness` CLI:

```ts
import { createReferenceCommand } from '@cyberuni/agent-harness/commands'

app.command(createReferenceCommand({ plugin: { name: 'my-plugin', root: pluginRoot } }))
```

### The `reference` skill

The package is also an agent plugin, `cyber-agent-harness`, that ships a `reference` skill. Type
`/reference` (`/cyber-agent-harness:reference` in Claude Code) to load, create, update, delete, find, or
inspect a reference, or to wire a skill to load one. The skill writes or deletes a file only after
you approve it. It runs the command from its bundled `scripts/reference.mjs`, which needs no
`node_modules`.

```text
/plugin marketplace add cyberuni/cyberplace
/plugin install cyber-agent-harness@cyberplace
```

A skill that needs a reference names it in one line, as the skill's
[`README.md`](https://github.com/spikyuni/uni-agent-kit/blob/main/packages/agent-harness/skills/reference/README.md)
shows:

```text
Load `skill-design` with the `reference` skill in the `cyber-agent-harness` plugin.
```

## Why this exists

`universal-plugin`, `buddy-agent-harness`, `repobuddy`, and `cyberlegion/cyber-mux` each need to know
which agent harness they are running under, and each was re-implementing that detection separately.
This package exists so they share one implementation instead.

## License

[MIT](https://github.com/spikyuni/uni-agent-kit/blob/main/LICENSE)
