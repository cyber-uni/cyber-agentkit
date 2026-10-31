# cyber-agentkit

## 1.2.1

### Patch Changes

- f67f2f2: Include `CHANGELOG.md` in the published package.

## 1.2.0

### Minor Changes

- 5251efd: Add the `prose-update` skill, the `prose-update` command (`classify` and `retire`), and the library functions `classify`, `parseHistory`, and `retire`. Given the wording a tool offers now, the text found in a file, and the wordings the tool retired, they divide the text into parts by heading, find the retired wording the found text descends from, and return for each part whether it is current, the merged text with the owner's sentences kept, or the sentences that collide. The same inputs give the same answer, with no model involved.

## 1.1.0

### Minor Changes

- 4d46d9e: Add the `asset` skill and command. It lists, shows, creates, updates, and deletes the files in a skill's assets folder by path, and loads one by name through the managed, project, user, and plugin tiers with `asset load`, `asset names`, `asset where`, and `asset select` (library: `loadAsset`), with no merging or extending, so a plugin, the project, or the user can override which data file a skill loads.
- 33de3a8: Reference names now resolve to JSON, YAML, TOML, and text files as well as Markdown. A data file is not merged: the highest tier holding it answers whole, and `show` and `list` report its format.

## 1.0.0

### Major Changes

- 0cba7aa: Bump to 1.0.0 release

### Minor Changes

- 8055a97: Add the plugin dependency domain. `declaredPluginDependencies` and `readPluginDependencies` read the `dependencies` a Claude Code `plugin.json` declares. `checkPluginDependencies(harness, { pluginRoot })` reports each as `enabled`, `installed`, `disabled`, `missing`, or `unknown` using `installedPlugins` and `enabledPlugins`, and returns install steps: Claude Code's own commands, or manual steps on every harness without a dependency field, with a note that nothing is resolved for you.
  
  The package now ships a `plugin-dependencies` reference, generated from the same facts, that the `reference` skill loads.
- 8f9e83a: Add reference interfaces. An `<id>.interface` reference declares a contract in its `interface:` frontmatter: cardinality, version, accepted versions, and the implementation's top-level sections in order. Every section is optional, and an implementation may hold sections the interface does not list. A reference implements one interface with `implements: <id>@<version>`.
  
  - `reference implementations <id> [--accept 1,2]` lists the implementations a consumer can load, with each one's pin, description, and unsupported sections; `--trace` adds the ones left out, with why. The library exports `referenceImplementations`.
  - `reference check [name...]` checks implementations, composed as `show` composes them, and interface documents, and exits 1 on any failure. Its `compose` check fails a document whose composing raised a warning. The library exports `checkReferences`. `show` warns when a document fails its interface check.
  - `reference create <id>.<key> --implements <id>` starts an implementation from the interface's sections, each stubbed `**Unsupported.**`, with `merge: replace`.
  - An interface document is never composed: a higher contribution of it, and an `extends` or `merge` on it, is ignored with a warning.
  - The `reference` skill loads the implementations of an interface, and creates and checks implementations.
- 5650ac4: `reference list`, `search`, and `check` find skills' defaults (`<skill>/references/<name>.default.md`) in the skill folders the detected harness reads: its project and user folders, its machine-wide admin folders, and each enabled plugin's skills, on Claude Code, Cursor, Codex, Copilot CLI, OpenCode, and Gemini CLI. A skill is known by its `SKILL.md` name, and symlinked skill folders are followed, so skills pnpm or `npx skills` linked are found. `list --trace` gives a row per skill holding a default, noting that the `default` step reaches it when that skill loads the name; `search` and `check` take each default as its skill loads it, naming the skill as `loadedBy`. On another harness, or with none detected, the answer's `defaults` field says why no default is listed. The library exports `harnessSkillFolders`, `pluginSkillFolders`, `adminSkillFolders`, `skillsIn`, and `skillName`.
- 968bb1e: The `reference` skill follows the stack design. Load passes the calling skill's folder as `--default`, so a skill's defaults now live at `references/<name>.default.md` and sit below every customization; it reads a default by itself only when the command cannot run, and no longer reads `references/<name>.md` or `governances/`. On an ambiguous name with a user present, it lists every option, asks for a pick, and writes it with `reference select`. An invalid name is reported as a fault for the calling skill's author. A new Select mode chooses what a name builds on, and Update writes customizations that patch, instead of `merge-sections` overrides. The load line reads "with the `reference` skill of `cyber-agentkit`".
- f467991: Rebuild reference resolution around a stack. Breaking.
  
  Contributions compose bottom first: the plugins and the calling skill's default (the stack), then user, then project, then managed. Each applies over everything below it with one of four operations, written as frontmatter `merge`, on a step of `extends`, or on one section as `<!-- merge: <operation> -->`:
  
  - `patch`, the default: keeps what is below and puts each section's text in place of the text it matches by heading path. **A file with no `merge` used to be `first-wins` and replace everything below; it now patches.** Write `merge: replace` to keep the old behavior.
  - `combine`: keeps what is below and adds each section's text after the text it matches. **Lower text now comes first, and where combined text conflicts, the later (higher) text wins**; the document says so once at the top. It used to put the higher layer first and let the first one win.
  - `replace`: drops everything below.
  - `remove`: drops everything below. With nothing above it, the name is `missing`.
  
  `merge-sections` and `first-wins` are gone (an unknown `merge` is read as `patch`, with a warning), and so is `overrides:`. Frontmatter `extends` lists what a contribution builds on, bottom first: plugins by their manifest name, and `default`. The highest written `extends` in the managed, project, or user tier builds the stack; otherwise the plugins' own `extends` order them, and plugins nothing orders make the name `ambiguous`. A qualified `<plugin>/<name>` builds that plugin's own stack.
  
  - New `reference select <name> <option>... [--scope user] [--clear]` writes the `extends` that settles an ambiguous name or picks a stack.
  - A skill ships its default as `<skill>/references/<name>.default.md`; `show --default <skill folder>` (and `where --default`) reads it as the `default` tier. `create` and `delete` take `--plugin <plugin folder>` and `--default <skill folder>` for a plugin's or a skill's source in the repository, and `create` takes `--merge <operation>`.
  - Output is agent-first. In `--format json`, `show` gives each found name's content as a string, and a record only for a failure or warnings; `--metadata` adds `status` and `metadata` (which leaves out `merge` and `extends`), and `--trace` adds the trace. `list` gives one row per name (`--trace` adds the rows per layer). `search` no longer echoes the query. `check` gives the failures and a pass count. `implementations` gives each `pin`, `description`, and `unsupported`. Empty fields are left out.
  - Every warning is `{code, message}`; a name not found carries `reference-missing`, `reference-ambiguous`, or `reference-invalid`, and an ambiguous name's choices are `options` (was `plugins`). In text, failures and warnings print as `error: <code>: <message>` and `warning: <code>: <message>`. `<reference>` blocks no longer carry `tier`. `where` on an ambiguous name exits 0.
  - A bad name is a status (`invalid`) in its own entry instead of an error that fails the whole call, and the library never throws for one. A name ending `.default`, or qualified by an npm package name, is invalid.
  - Only `<name>.md` and `<name>/README.md` answer a name; `<name>/index.md` and `<name>/SKILL.md` no longer do. The library's own managed folders (`/etc/buddy-agent-harness/...` and equivalents) and every `governances/` folder are no longer read. A dependency joins the plugin tier only when it has a plugin manifest, named by the manifest's `name`.
- 13b64c2: Rename the package from `@cyberuni/agent-harness` to `cyber-agentkit`. The `agent-harness` command is now `cyber-agentkit`, and the `cyber-agent-harness` agent plugin is now `cyber-agentkit`, so the skill is `/cyber-agentkit:reference`. The package is now described as an agent-harness-agnostic toolkit. Worktree leases written by the old name are no longer recognized as this library's own.

### Patch Changes

- 238796e: `skillInvocation('codex', …)` now returns `$<plugin>:<skill>` with `namespaced: true`, instead of the bare `$<skill>`. Codex names a plugin's skill `<plugin>:<skill>`, and its `$` mention takes the whole name.
- f58bc44: Point `repository`, `homepage`, and `bugs` at the repository's new home, `cyber-uni/cyber-agentkit` (the package now lives at `packages/cyber-agentkit`), and the documentation at https://cyber-uni.github.io/cyber-agentkit/.
- 057b182: `skillInvocation('opencode', …)` now returns `/<skill>` (not namespaced by plugin) instead of `undefined`. Through v1.19.3, OpenCode registers every loaded skill as a slash command, unless a built-in, config command, or MCP prompt already has the name.
- d89c33b: `skillsDirectories('cursor')` adds `.grok/skills` and lists Cursor's folders in the order it reads them. `skillsDirectories('copilot-cli')` gains `relocatedBy`: when `COPILOT_HOME` names another folder, Copilot CLI reads `$COPILOT_HOME/skills` instead of its user folders.

## 0.7.1

### Patch Changes

- a64c02d: Declare `sideEffects` in `package.json` so bundlers can drop unused modules, including the bundled `yaml` parser. Only the `bin` launcher, the CLI bundle, and the skill scripts are marked as having side effects.

## 0.7.0

### Minor Changes

- 4730a5a: Moves to clibuilder 12. `@clibuilder/axi` is gone, and `clibuilder` is the only optional peer, at `^12.0.0`. `--format` is now clibuilder's global option, so a host that mounts `createReferenceCommand` from `./commands` sets the default format with `cli({ format })`; the `text` default of `show`, `create`, and `delete` stays with the `agent-harness` CLI. The `reference` skill's `scripts/reference.mjs` is now compiled by `universal-plugin plugin build` from the `scripts` entry in `plugin.json`, with no `import()` left to resolve at runtime.
- 1fc6f75: `release` now clears the lock of a leased worktree whose directory is gone, so `git worktree prune` can take it: a `Lease` records its repo's `commonDir` at claim. `acquire` takes an `undoCreate` callback, called when a slot its creator made loses the lease claim, so the creator's side effects (such as a herdr workspace) do not pile up across retries.
- 006ca66: `reference list` takes an optional name pattern, such as `project-tracker.capabilities.*`, and `listReferences` takes the same `pattern` option. It returns only the names the pattern matches exactly, with tier, plugin, and ambiguity status, with no fuzziness or ranking.
- 3bb29c9: The package no longer declares runtime `dependencies`, so a consumer that imports only `@cyberuni/agent-harness/worktrees` (or the root entry) installs nothing beyond the package itself. `yaml` is now bundled into `dist`, and the `agent-harness` bin bundles `clibuilder` and `@clibuilder/axi`. `clibuilder` and `@clibuilder/axi` become optional peer dependencies: install them (as a host CLI already does) to import `@cyberuni/agent-harness/commands`, which still composes into the host's own `clibuilder` instance.
- 115f91c: Add `removeWorktree` to `./worktrees`: remove one caller-named worktree by path, with an explicit `force` that maps to `git worktree remove --force`. It returns the same outcome and skip reason as `pruneWorktrees`. It never removes the primary checkout or a leased worktree, and never kills a process. `force: true` waives the foreign, prunable, dirty, and unmerged checks but still skips a busy worktree, or one whose process probe cannot be verified, with its reason. `force: 'in-use'` does everything `true` does and also removes busy and unverified worktrees, reporting the occupants. Unlike git's `--force-with-lease` (a safer force), `'in-use'` is the stronger one.

### Patch Changes

- 79d05f0: The `reference` skill is now self-contained across install channels. Its bundled `scripts/reference.mjs` is committed, so a git-sourced install carries it, and the skill's fallback is `pnpm exec agent-harness reference`, then `npx` pinned to this release's exact version rather than a `^` range. `plugin build` adds the pnpm skill name (`pnpm-@cyberuni+agent-harness-reference`) beside the skill's typed form in its README.

## 0.6.0

### Minor Changes

- f8913de: Add `acquire`, `release`, and `explain` to `@cyberuni/agent-harness/worktrees`. `acquire({ holder, branch?, base?, available?, max? })` leases an idle worktree of ours and recycles it (`read-tree --reset -u <base>`, then `clean -fd`, which keeps `node_modules`), or creates one at the next free `<parent>/<repo>.worktrees/<repo>-<n>` slot through an injectable creator. The lease is an exclusive-created git worktree lock, read back after the claim. `release(lease)` gives it back only when the lease id still matches and never recycles. `explain()` gives the skip reason for every worktree. A worktree with a live agent session is skipped; when the probe cannot read processes, reuse proceeds and is reported unverified unless `strict` is set. An unlocked worktree at a library slot now classifies as `self`.
- 3f2a9d4: Add the `@cyberuni/agent-harness/worktrees` subpath. It has three entry points:
  
  - `primaryRoot` finds the primary checkout from any folder in a repository, including a linked worktree.
  - `listWorktrees` lists every worktree with its branch, HEAD, detached, prunable and lock reason, plus whether its work has landed on the default branch and whether it is dirty.
  - `readDirty` checks a worktree for uncommitted changes, can ignore paths you name, and counts untracked files even when a repo hides them.
  
  Landed detection tries, in order: ancestry, a deleted upstream, a squash merge matched by patch id, and an opt-in forge probe (`ghForgeMergedProbe`).
- adc4d95: Add a process probe to `@cyberuni/agent-harness/worktrees` that finds live agent sessions inside a worktree. It never kills anything.
  
  - `probeProcesses` reads the process table once. Its `occupancy(root)` reports `busy`, the `occupants` (every live session, with no limit on how many), the `lingering` processes, and the `unlinked` ones. Lingering means no live session launched the process, so a caller can reclaim it. Unlinked means the probe cannot tell.
  - `occupants(root)` lists the sessions working in one worktree.
  - A session is recognised by its executable, so tool subprocesses such as a `vite` started from Claude Code are not sessions. 14 harnesses are covered: Claude Code, Codex, Copilot CLI, Cursor, opencode, Kilo, Qwen Code, Crush, Gemini CLI, Goose, OpenHands, Cline, Auggie, and the Antigravity CLI.
  - The process source can be swapped out. `procfsProcessSource` reads Linux `/proc`. On any other platform the probe is unverified and reports not busy, unless you pass `strict: true`.
- ffdc416: Add `classifyOwner` to `@cyberuni/agent-harness/worktrees`. It tells who owns a worktree: `self` (this library's lease), `claude-code`, `codex`, `user` (the primary checkout), or `unknown`. Each answer lists the research evidence it rests on. Only a `self` worktree may be reused or removed. `parseLeaseReason` reads the lease from a lock reason.
- 8bcef77: Add `pruneWorktrees` to `@cyberuni/agent-harness/worktrees`. It removes the worktrees this library owns that nothing needs any more (unleased, idle, clean, and landed), then runs `git worktree prune`. It is a dry run unless `apply` is set, and returns an outcome per worktree with a skip reason. It never touches the primary checkout, a foreign or locked worktree, a leased one, or one with a live agent session; when the process probe cannot read the platform it skips unless `strict: false`. It never kills a process: lingering dev services are reported so the caller can reclaim them.
- 654ac52: Add `seedWorktree` to `@cyberuni/agent-harness/worktrees`. It copies the gitignored files a `.worktreeinclude` names from the primary checkout into a new or recycled worktree, following Claude Code's semantics, and returns an inventory of what it copied and what it skipped and why. It reads the include file as data and runs no command but git; file operations go through an injectable `SeedFs`.

### Patch Changes

- 5d67d18: `agent-harness reference` now writes its `--format` output through `@clibuilder/axi` instead of a local copy of the same contract, and no longer depends on `@toon-format/toon` directly. TOON, JSON, and text output are byte-identical: axi's text renderer is the one this package carried. An unknown `--format` value is now rejected by clibuilder before the command runs, as a usage error (exit code 2) with clibuilder's message and the command's help, where it used to exit 1 with `error: --format must be toon, json, or text.`

## 0.5.0

### Minor Changes

- dae27d3: Rename the agent plugin from `agent-harness` to `cyber-agent-harness`, so its skills no longer share a namespace with any other marketplace's plugin of that generic name. Claude Code's typed form is now `/cyber-agent-harness:reference`; uninstall `agent-harness` and run `/plugin install cyber-agent-harness@cyberplace`. The `reference` command's own plugin layer is now named `cyber-agent-harness`, read from `plugin.json`, so `cyber-agent-harness/<name>` selects it. The npm package, the `agent-harness` command, and the library API are unchanged.

## 0.4.0

### Minor Changes

- 9ca2ca0: Add `headlessInvocation()` and `headlessCommand()`: how to run Claude Code, Codex, Copilot CLI, Cursor, Gemini CLI, or Qwen Code on one prompt with no user present — the command, model and permission flags, output formats and where token usage and cost appear, the transcript location, and the documented exit codes. Copilot in VS Code reports no headless mode, and the harnesses whose one-shot flags are not yet verified report `unknown`.
- 7151efb: `skillInvocation('kilo', …)` now returns `/<skill>` (not namespaced by plugin) instead of `undefined`: Kilo Code's CLI and VS Code extension both register every loaded skill as a slash command.
- 9002ef2: Add `reference delete <name>`. It deletes the project (`.agents/references/`) or user (`~/.agents/references/`) copy of a reference, with `--scope` and `--dry-run`, and reports which copy answers the name afterwards. It refuses a plugin-shipped or managed copy.
- 849cff0: Add reference documents: `loadReference()` and the functions behind it resolve a named Markdown document across the managed, project, user, and plugin tiers, merging each override as its frontmatter `merge` asks. The package also ships an `agent-harness reference` command, and `createReferenceCommand()` and `createReferenceCommands()` at `@cyberuni/agent-harness/commands` for hosting it in another clibuilder CLI. It now has runtime dependencies (`yaml`, `clibuilder`, `@toon-format/toon`), none of them an agent tool.
- f634c3c: Ship the `reference` skill in the `agent-harness` plugin, moved from `buddy-agent-harness`. Type `/reference` (`/agent-harness:reference` in Claude Code) to load, create, update, delete, find, or inspect a reference, or to wire a skill to load one. It runs this package's `reference` command from a bundled `scripts/reference.mjs` that needs no `node_modules`, and falls back to `npx -y @cyberuni/agent-harness` outside Load.
- 5a3e631: `skillsDirectories()` now returns Kilo Code's directories (`.kilo/skills`, `.agents/skills`, `.claude/skills`) instead of `undefined`, adds `.claude/skills` and `.agents/skills` for the Auggie CLI, and adds `.agents/skills` for Cline, at both project and user scope.

### Patch Changes

- 2823c69: Document that the OpenHands CLI 1.16.0 marks only its hook commands. Its shell commands carry no `AI_AGENT=openhands`, because it bundles an OpenHands SDK older than that variable. Detection is unchanged.

## 0.3.0

### Minor Changes

- b60b4e7: Add `installedPlugins(harness)`: each installed plugin with the folder the harness loads it from, its version, and, for Claude Code, its install scope. It reads Claude Code's `installed_plugins.json`, Copilot CLI's `config.json`, and Codex's plugin cache, where it applies Codex's own active-version rule. Every other harness reports `supported: false`.

## 0.2.0

### Minor Changes

- 0f40b36: Add `skillsDirectories(harness)`: the project and user directories a harness reads skills from, with the evidence IDs behind them. It returns `undefined` for Kilo Code, Qwen Code, Crush, and OpenHands, where the directories are not confirmed.
- 2c66fbf: `detectHarness()` now also detects Crush (`CRUSH=1`), OpenHands (`AI_AGENT=openhands`, or its hook variables), and the Auggie CLI (in hook commands only), and `pluginStorage()`, `managedPolicyLocations()`, `enabledPlugins()`, `skillInvocation()`, and `supportsPluginDependencies()` answer for them. `AI_AGENT` counts as evidence only with the exact value `openhands`; other values, and `AGENT=crush`, are still ignored. Goose, Antigravity, Rovo Dev, Kiro, Amp, Factory Droid, Devin Desktop, and Warp are not detected, because none has a verified signal.

## 0.1.0

### Minor Changes

- f3a9e78: `detectHarness()` now detects Claude Code, Cursor, Codex, and GitHub Copilot CLI from the process environment. It reports the matched `harness`, every signal it found as `evidence` (each with the research claim ID behind it), and the `candidates` it matched. It reports `unknown` when no harness matches and when more than one does, as happens when one harness runs inside another.
- f44d752: Add `enabledPlugins(harness, { env, homedir, cwd, platform })`. For Claude Code, Codex, and GitHub Copilot CLI it reads the settings files that record enabled plugins and resolves each plugin by scope precedence: managed, then local, then project, then user. It lists the files it read, and in `unread` it names the policy sources it cannot read, such as MDM and server-managed settings. Cursor reports `supported: false`, because Cursor keeps no record of enabled plugins.
- 5823a1b: Add `managedPolicyLocations(harness, { platform })`. It lists where each harness keeps managed policy: local files and directories, macOS managed-preferences domains, Windows registry keys, and server-side sources that cannot be read locally. Each entry names the research claim behind it.
- a78c46a: `detectHarness()` now also detects OpenCode, Kilo Code, Gemini CLI, Qwen Code, GitHub Copilot in VS Code, and Cline, and `pluginStorage()`, `managedPolicyLocations()`, `enabledPlugins()`, `skillInvocation()`, and `supportsPluginDependencies()` answer for them. Kilo Code still sets OpenCode's `OPENCODE=1`, but it is detected as `kilo`; `AGENT` and `AI_AGENT`, which several vendors share, are not treated as evidence.
  
  `skillInvocation()` now returns `undefined` for a harness with no typed skill invocation: OpenCode, Kilo Code, Gemini CLI, and Qwen Code load skills through a model tool call.
- 68fce08: Add `pluginStorage(harness, { env, homedir })`. It returns a harness's user-level config directory, after `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, or `COPILOT_HOME`, and where it keeps installed plugins, marketplaces, the install record, and the enabled record.
- e6165bf: Add `skillInvocation(harness, { plugin, skill })`, which returns what a user types to invoke a plugin skill: `/<plugin>:<skill>` in Claude Code, `/<skill>` in Cursor and GitHub Copilot CLI, and `$<skill>` in Codex. Add `supportsPluginDependencies(harness)`, which is `true` only for Claude Code.

### Patch Changes

- b0de9bb: The plugin manifests no longer point `skills` at a `./skills/` folder the package does not ship, and the package `files` list no longer names a `com.github.copilot` folder: Copilot CLI reads the root `plugin.json`.
- 9d4b8d2: A release now carries the package version into `plugin.json` and the per-harness plugin manifests, so they no longer stay at `0.0.0`.
- 120b0b3: The published types no longer reference `NodeJS.Platform`, so a TypeScript project without `@types/node` in its `types` can import the package. The `platform` option now takes the exported `Platform` type, a union of the values `process.platform` reports.
