# cyber-agentkit

[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/spikyuni/cyber-agentkit/blob/main/LICENSE)

An agent-harness-agnostic toolkit. It provides the fundamental features agent tools need and makes
each one work the same way across harnesses:

- **Harness knowledge.** Detect which harness is running, and query what it holds: managed-policy
  locations, plugin storage, installed and enabled plugins, skill naming and directories, and how to
  run it headless.
- **Plugin dependencies.** Check which plugins another plugin needs against what the harness has.
- **Reference documents.** Resolve the named Markdown documents an agent reads on demand.
- **Worktrees.** Lease git worktrees to concurrent agent sessions.

It depends on no other agent tool, so any of them can build on it.

**Status: pre-release.** Every fact this library encodes rests on
[`.research/harness-detection`](https://github.com/spikyuni/cyber-agentkit/tree/main/.research/harness-detection).

## Detect the harness

It detects Claude Code, Cursor, Codex, GitHub Copilot CLI, OpenCode, Kilo Code, Gemini CLI, Qwen
Code, GitHub Copilot in VS Code, Cline, Crush, OpenHands, and the Auggie CLI.

```ts
import { detectHarness } from 'cyber-agentkit'

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
import { managedPolicyLocations } from 'cyber-agentkit'

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
import { pluginStorage } from 'cyber-agentkit'

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
import { enabledPlugins } from 'cyber-agentkit'

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
import { enabledPlugins, installedPlugins } from 'cyber-agentkit'

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

## Skill naming

```ts
import { skillInvocation } from 'cyber-agentkit'

skillInvocation('claude-code', { plugin: 'my-plugin', skill: 'review' })?.text // '/my-plugin:review'
skillInvocation('copilot-cli', { plugin: 'my-plugin', skill: 'review' })?.text // '/review'
skillInvocation('codex', { plugin: 'my-plugin', skill: 'review' })?.text // '$my-plugin:review'
skillInvocation('gemini-cli', { plugin: 'my-plugin', skill: 'review' }) // undefined: the model loads skills itself
```

## Plugin dependencies

Only Claude Code's manifest declares dependencies, and only Claude Code installs the missing ones.
Every other harness ignores the field, so the plugin installs and fails later with nothing to say
why. This reads what a plugin declares, checks it against what the running harness has installed and
enabled, and returns the steps that settle the rest. It installs nothing and compares no versions.

```ts
import { checkPluginDependencies, supportsPluginDependencies } from 'cyber-agentkit'

supportsPluginDependencies('claude-code') // true; false for the others

const check = await checkPluginDependencies('codex', { pluginRoot })
// {
//   harness: 'codex',
//   supported: false,
//   autoResolved: false,
//   dependencies: [{ name: 'my-dep', marketplace: 'my-marketplace', state: 'missing' }],
//   steps: ['…'],
//   research: ['E-DEP-2', …],
// }
```

`state` is `enabled`, `installed` (no explicit setting), `disabled`, `missing`, or `unknown` (the
harness keeps no readable install record). A dependency with no marketplace resolves only in the
declaring plugin's own marketplace, as Claude Code does, and is `unknown` when that marketplace
cannot be found.

`readPluginDependencies(pluginRoot)` reads the list from `extensions["org.spikyuni.plugin-manager"]`
(or the older `extensions["org.cyberuni.universal-plugin"]`) in the root `plugin.json`, then from
`.claude-plugin/plugin.json`. `declaredPluginDependencies(manifest)` parses a manifest you already
hold. The how-to for a person or agent, `plugin-dependencies`, ships as a
[reference](#reference-documents).

## Skill directories

```ts
import { skillsDirectories } from 'cyber-agentkit'

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
import { headlessCommand, headlessInvocation } from 'cyber-agentkit'

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
weights a skill applies. A plugin ships a contribution, a skill ships its default at
`<skill>/references/<name>.default.md`, and anyone can add their own without editing the plugin: a
project in `.agents/references/<name>.md`, a person in `~/.agents/references/<name>.md`.

```ts
import { loadReference } from 'cyber-agentkit'

const resolved = await loadReference('agent-readiness-weights', {
	root: process.cwd(),
	// The plugin calling the resolver: its own `references/` is the first plugin layer.
	plugin: { name: 'my-plugin', root: pluginRoot },
	// The skill loading the name: its `references/<name>.default.md` joins as the default tier.
	defaultSkill: skillFolder,
})
if (resolved.status === 'found') console.log(resolved.content)
```

`status` is `found`, `missing`, `ambiguous` (nothing orders the plugins holding the name; pick one
of `resolved.options`, such as `my-plugin/agent-readiness-weights`, or settle it with
`reference select`), or `invalid` (not a reference name). A name not found also has a `code`, such
as `reference-missing`. A library function never throws for a bad name. `warnings` holds each fault
as `{ code, message }`, and `trace` says how the document was built.

The tiers, highest first:

| Tier | Folders |
| --- | --- |
| managed | a `references/` beside each detected harness's managed-policy files |
| project | `.agents/references/` in the root and each folder above it, up to the repository root |
| user | `~/.agents/references/` |
| plugin | the calling plugin's `references/`, each plugin the harness has enabled, then each declared dependency that has a plugin manifest, named by that manifest |
| default | `<skill folder>/references/<name>.default.md` of the skill loading the name |

In each folder, only `<name>.md` and `<name>/README.md` answer a name, in that order.

Contributions apply bottom first: the plugins and the default, in the order `extends` gives them,
then user, project, and managed. Each applies over what is below it with its frontmatter `merge`:

- `patch` (the default): its sections replace the text they match by heading path, and the rest is
  kept.
- `combine`: its sections' text is added after the text they match, lower first; where combined text
  conflicts, the later text wins.
- `replace`: it replaces everything below.
- `remove`: it drops everything below.

A `<!-- merge: <operation> -->` marker under a heading applies an operation to that section alone.
Frontmatter `extends` lists what a contribution builds on, bottom first: plugins by their manifest
name, and `default`. The highest `extends` written in the managed, project, or user tier builds the
stack; without one, the plugins' own `extends` order them. `resolved.metadata` holds the composed
frontmatter, the higher contribution winning each key, without `merge` and `extends`. Frontmatter
that is not a YAML mapping is ignored with a warning.

| Function | Does |
| --- | --- |
| `loadReference(name, options)` | Resolves one name for a root, with every tier read |
| `referenceLayers(options)` | Builds the ordered layers, and finds the skills holding a default, to resolve several names against |
| `resolveReference(name, layers)` | Resolves a name against layers |
| `listReferences(layers)`, `referenceNames(layers)` | Every name the layers hold, one row each, and a row per layer holding it |
| `listReferences(layers, { pattern })` | Every reference by exact name pattern |
| `searchReferences(query, layers)` | Names matching a query by name, description, heading, or body |
| `whereReference(name, layers, options)` | The project and user files a customization is written to, and the heading paths below each |
| `projectReferencesDir()`, `userReferencesDir()`, `defaultLayer()` | Single folders and layers |
| `declaredDependencies()`, `packageDir()`, `pluginManifestName()` | A manifest's declared packages, where each is installed, and a plugin's manifest name |
| `harnessSkillFolders()`, `pluginSkillFolders()`, `skillsIn()` | The skill folders a harness reads, and the skills in them, known by their `SKILL.md` name |
| `referenceImplementations(id, layers)` | The implementations of an interface a consumer can load, and those left out with why |
| `checkReferences(layers, options)` | Checks interface documents and their implementations, each as `show` composes it |

### The reference command

The package ships a `reference` command with `show`, `list`, `search`, `where`, `implementations`,
`check`, `create`, `select`, and `delete` subcommands:

```sh
npx -y cyber-agentkit reference show <name>... --root <repository root> --default <skill folder>
npx -y cyber-agentkit reference list
npx -y cyber-agentkit reference list 'project-tracker.capabilities.*'
npx -y cyber-agentkit reference implementations <interface id> --accept 1,2
npx -y cyber-agentkit reference check
npx -y cyber-agentkit reference create <name> --merge combine
npx -y cyber-agentkit reference select <name> <plugin> --scope user
npx -y cyber-agentkit reference delete <name> --scope project --dry-run
```

`implementations` lists what a consumer can load for an interface (a `<id>.interface` document) with
each one's pin, description, and unsupported sections. `check` verifies interface documents and
their implementations, and exits 1 on any failure.

`create`, `select`, and `delete` act on `.agents/references/` (the project, the default) or
`~/.agents/references/` (`--scope user`). `create` and `delete` also take `--plugin <plugin folder>`
or `--default <skill folder>` for a plugin's or a skill's source in the repository. `delete` reports
what answers the name afterwards, and never deletes a managed contribution or an installed copy.
`select` writes the `extends` that picks what a name builds on, and `--clear` removes it.

Output is [TOON](https://github.com/toon-format/toon) by default, for an agent to parse; pass
`--format json` or `--format text` (`show`, `create`, `select`, and `delete` default to `text`).
Each command prints only the fields that answer it; on `show`, `--metadata` adds the status and the
composed frontmatter, and `--trace` adds how the document was built. Every warning carries a stable
`code`. The formats
follow [`clibuilder`](https://www.npmjs.com/package/clibuilder) 12, and any other value is a
usage error (exit code 2). A CLI built on clibuilder 12
can host the same command under its own plugin name, imported from the `./commands` subpath. `--format`
is the host's global option, so the host's `cli({ format })` sets the default for every subcommand;
the `text` default of `show`, `create`, `select`, and `delete` belongs to the `cyber-agentkit` CLI:

```ts
import { createReferenceCommand } from 'cyber-agentkit/commands'

app.command(createReferenceCommand({ plugin: { name: 'my-plugin', root: pluginRoot } }))
```

### The `reference` skill

The package is also an agent plugin, `cyber-agentkit`, that ships a `reference` skill. Type
`/reference` (`/cyber-agentkit:reference` in Claude Code) to load, create, update, delete, find, or
inspect a reference, or to wire a skill to load one. The skill writes or deletes a file only after
you approve it. It runs the command from its bundled `scripts/reference.mjs`, which needs no
`node_modules`.

```text
/plugin marketplace add cyberuni/cyberplace
/plugin install cyber-agentkit@cyberplace
```

A skill that needs a reference names it in one line, as the skill's
[`README.md`](https://github.com/spikyuni/cyber-agentkit/blob/main/packages/agent-kit/skills/reference/README.md)
shows:

```text
Load `skill-design` with the `reference` skill of `cyber-agentkit`.
```

## Worktrees

The `./worktrees` subpath leases git worktrees to concurrent agent sessions, so two agents never
share a checkout. It does not fetch and never kills a process.

```ts
import { acquire, pruneWorktrees, release } from 'cyber-agentkit/worktrees'
```

| Function | Does |
| --- | --- |
| `acquire(options)` | Leases a worktree: recycles an idle one of its own, else creates one at the next free slot under `max` |
| `explain(options)` | Every worktree of the repository with the reason it cannot be reused, or none |
| `release()`, `claimLease()`, `holdsLease()` | The lease a holder takes on a worktree |
| `pruneWorktrees(options)` | Removes unleased, idle, clean, landed worktrees it owns. A dry run unless `apply` is set |
| `removeWorktree(options)` | Removes the one worktree you name, under the same safety checks |
| `seedWorktree(options)` | Copies the gitignored files a `.worktreeinclude` names into a new or recycled worktree |
| `listWorktrees()`, `occupants()`, `classifyOwner()` | The worktrees of a repository, the sessions working in each, and who owns each |

A worktree is skipped, with the reason in its verdict, when it is the primary checkout, owned by
another tool or person, leased, prunable, busy, dirty, or not yet landed on the default branch. The
checks fail closed: when git or the process probe cannot say, the worktree is left alone.

## Why this exists

`universal-plugin`, `buddy-agent-harness`, `repobuddy`, and `cyberlegion/cyber-mux` each need to know
which agent harness they are running under, and each was re-implementing that detection separately.
This package exists so they share one implementation instead.

## License

[MIT](https://github.com/spikyuni/cyber-agentkit/blob/main/LICENSE)
