# cyber-agentkit

[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/cyber-uni/cyber-agentkit/blob/main/LICENSE)

An agent-harness-agnostic toolkit. It provides the fundamental features agent tools need and makes
each one work the same way across harnesses:

- **Harness knowledge.** Detect which harness is running, and query what it holds: managed-policy
  locations, plugin storage, installed and enabled plugins, skill naming and directories, and how to
  run it headless.
- **Plugin dependencies.** Check which plugins another plugin needs against what the harness has.
- **Reference documents.** Resolve the named Markdown documents an agent reads on demand.
- **Worktrees.** Lease git worktrees to concurrent agent sessions.
- **Skill and instruction tooling.** Check, test, and examine agent skills, compare two wordings of
  an AGENTS.md section, and update prose a tool wrote without losing the owner's edits.

It depends on no other agent tool, so any of them can build on it. It ships as this library, as the
`cyber-agentkit` command, and as an agent plugin of the same name.

The [documentation site](https://cyber-uni.github.io/cyber-agentkit/) covers installing the plugin, every
[command](https://cyber-uni.github.io/cyber-agentkit/packages/cyber-agentkit/cli/), and every
[skill](https://cyber-uni.github.io/cyber-agentkit/packages/cyber-agentkit/skills/). This readme documents each library function.

**Status: pre-release.** Every fact this library encodes rests on
[`.research/harness-detection`](https://github.com/cyber-uni/cyber-agentkit/tree/main/.research/harness-detection).

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

Detection reads environment variables that each harness sets on the processes it spawns. It
reports `unknown` instead of guessing when no harness matches, or when more than one does, as when
one harness runs inside another's shell. The matches are listed in `candidates`.
[Harness detection](https://cyber-uni.github.io/cyber-agentkit/concepts/harness-detection/) lists the signal behind each harness, the
contexts where a harness sets nothing, and the harnesses left out for want of a verified signal.

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

`readPluginDependencies(pluginRoot)` reads the list from `extensions["io.github.cyber-uni.plugin-manager"]`
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

For Claude Code and Codex, `isolation` also says where a run keeps its config, skills, plugins, and
login, so a run can be cut off from the user's own setup:

```ts
const { isolation } = headlessInvocation('codex') as HeadlessMode
// { configDir: { env: 'CODEX_HOME', default: '~/.codex' }, projectSkills: '.agents/skills',
//   login: { store: 'config-dir', args: ['--ignore-user-config', '--ignore-rules'] }, leaks: '…AGENTS.md…' }
```

`skill test` builds each run's environment from it.

## Reference documents

A reference is a named Markdown document an agent reads on demand, such as a checklist or a set of
weights a skill applies. A plugin ships a contribution, a skill ships its default at
`<skill>/references/<name>.default.md`, and anyone can add their own without editing the plugin: a
repository in `.agents/references/<name>.md`, a person in `~/.agents/references/<name>.md`.

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
`reference customize --extends`), or `invalid` (not a reference name). A name not found also has a
`code`, such as `reference-missing`. `loadReference` never throws for a bad name. `warnings` holds each fault
as `{ code, message }`, and `trace` says how the document was built.

A contribution comes from one of five tiers, highest first: managed, repo, user, plugin, and default.
Each applies over the tiers below it as its frontmatter `merge` says: `patch` (the default),
`combine`, `replace`, or `remove`. [Reference documents](https://cyber-uni.github.io/cyber-agentkit/concepts/reference-documents/)
gives the folders of each tier, how contributions compose, project sections, and references that are
not Markdown. [Reference interfaces](https://cyber-uni.github.io/cyber-agentkit/concepts/reference-interfaces/) covers interface
documents and their implementations.

| Function | Does |
| --- | --- |
| `loadReference(name, options)` | Resolves one name for a root, with every tier read |
| `referenceLayers(options)` | Builds the ordered layers, and finds the skills holding a default, to resolve several names against |
| `resolveReference(name, layers)` | Resolves a name against layers |
| `listReferences(layers)`, `referenceNames(layers)` | Every name the layers hold, one row each, and a row per layer holding it |
| `listReferences(layers, { pattern })` | Every reference by exact name pattern |
| `searchReferences(query, layers)` | Names matching a query by name, description, heading, or body |
| `whereReference(name, layers, options)` | The files a customization is written to, what hides each, and the heading paths below |
| `createReference(options)`, `deleteReference(options)` | Start or delete a contribution; a plugin or skill source folder is `pluginFolder` or `default`, and `plugin` stays the host plugin |
| `customizeReference(options)` | Write the picks or a generated body for a name, as `reference customize` does; runs no model |
| `ReferenceError`, `referenceCodes` | The error a library function throws when it cannot complete, carrying a stable `code`, and the table of codes |
| `repoReferencesDir()`, `userReferencesDir()`, `defaultLayer()` | Single folders and layers |
| `declaredDependencies()`, `packageDir()`, `pluginManifestName()` | A manifest's declared packages, where each is installed, and a plugin's manifest name |
| `harnessSkillFolders()`, `pluginSkillFolders()`, `skillsIn()` | The skill folders a harness reads, and the skills in them, known by their `SKILL.md` name |
| `referenceImplementations(id, layers)` | The implementations of an interface a consumer can load, and those left out with why; given a family `<prefix>.*`, every interface under the prefix |
| `isFamilyName(value)`, `parseReferenceName(value)` | Whether a name is a family `<prefix>.*`, and a name's parts |
| `checkReferences(layers, options)` | Checks interface documents and their implementations, each as `load` composes it |
| `migrateReferences(layers, options)` | The plan `reference migrate` prints for files left in a version 1 form or under a renamed name; applies it with `write: true` |
| `adviseReferences(options)`, `leadsIn(file, text)` | What the given files hard-code that could move into references, as leads with their lines; writes nothing |
| `referenceUses(layers, options)`, `loadsIn(text)` | The references the given files load, whether a bundled default ships beside each, and which tiers answer it |
| `loadAsset(name, options)` | Resolves a skill asset by name through the same tiers |

## Commands

The `cyber-agentkit` command runs the `reference`, `asset`, `prose-update`, `skill`, and
`instruction` commands. The [CLI reference](https://cyber-uni.github.io/cyber-agentkit/packages/cyber-agentkit/cli/) documents each
subcommand, its options, and its output formats:

```sh
npx -y cyber-agentkit reference list
npx -y cyber-agentkit reference load <name> --trace
```

A CLI built on [`clibuilder`](https://www.npmjs.com/package/clibuilder) 12 can host the `reference`
and `asset` commands under its own plugin name. Import them from the `./commands` subpath. Pass
`path`, the command line that reaches them in that CLI, so each command's help examples start with
it:

```ts
import { createReferenceCommand } from 'cyber-agentkit/commands'

app.command(createReferenceCommand({ plugin: { name: 'my-plugin', root: pluginRoot }, path: 'my-plugin reference' }))
```

`createReferenceCommands()` returns each subcommand by name, for a host that mounts them itself, and `createAssetCommand()` takes the
same `path` for the `asset` commands.

## The agent plugin

The package is also an agent plugin, `cyber-agentkit`, for Claude Code, Cursor, Codex, and GitHub
Copilot CLI. It ships the `reference`, `asset`, `skill`, `skillify`, `instruction`, and
`prose-update` skills. In Claude Code:

```text
/plugin marketplace add cyber-uni/marketplace
/plugin install cyber-agentkit@cyber-uni
```

[Install](https://cyber-uni.github.io/cyber-agentkit/packages/cyber-agentkit/install/) covers the other harnesses, and the
[skills page](https://cyber-uni.github.io/cyber-agentkit/packages/cyber-agentkit/skills/) says when to use each skill. A skill that
needs a reference names it in one line, as the `reference` skill's
[`README.md`](https://github.com/cyber-uni/cyber-agentkit/blob/main/packages/cyber-agentkit/skills/reference/README.md)
shows:

```text
Load `skill-design` with the `reference` skill of `cyber-agentkit`.
```

## Prose update

`classify({ found, offered, history })` compares prose a tool wrote earlier, which its owner may have
edited, with the wording the tool offers now. Each part, by heading path, gets one outcome:
`up-to-date`, `update` (the merged text, with the owner's sentences kept), `owners`, `conflict`, or
`undetermined`. It never calls a model. `parseHistory(text)` reads a history of retired wordings,
newest first, and `retire(history, wording, date, reason)` returns that text with the outgoing
wording added.

```ts
import { classify } from 'cyber-agentkit'

// `history` is the history text, or the retired wordings, newest first.
const result = classify({ found, offered, history })
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

[MIT](https://github.com/cyber-uni/cyber-agentkit/blob/main/LICENSE)
