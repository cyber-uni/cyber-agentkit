# Topic — Harness detection

## Why this topic exists

`@cyberuni/agent-harness` will tell a caller which agent harness it runs under and what that harness
holds. Issue [cyberuni/agent-harness#1](https://github.com/cyberuni/agent-harness/issues/1) asks
five research questions before any of it is coded:

- R1. How each harness can be detected at runtime.
- R2. Where each harness stores plugins, and whether the enabled set can be queried.
- R3. Where each harness keeps managed policy, and which policy is server-side only.
- R4. How each harness names a plugin skill.
- R5. Whether plugins can depend on other plugins.
- R6. Which directories each harness reads skills from, by default, at project and user scope.
- R7. How to map an installed plugin to the folder it runs from.
- R8. Which instruction files each harness reads, at project and user scope.

The answer is in [conclusion.md](./conclusion.md). This file records how it was reached.

## Method

One investigation per harness, run in parallel on 2026-09-26, each against the vendor's own
documentation first. Where the documentation was silent, the investigation read the shipped CLI
(`--help`, a grep of the bundled JavaScript, or the open Rust source for Codex) and ran the CLI
headlessly to dump the environment of a shell command it spawned. Dumps recorded variable names
only.

universal-plugin's `vendors.json` and its `.research/` topics were used as leads and re-checked, not
copied.

All experiments ran on Linux under WSL, from inside a Claude Code session. That matters for R1: each
nested CLI's shell also carried Claude Code's variables, which is how the nesting problem surfaced
(E-CODEX-D12).

## Claude Code

The env-vars page documents `CLAUDECODE=1` for every subprocess Claude Code spawns, and says IDE
extensions set it in their integrated terminals too (E-CC-D1, E-CC-D2). So `CLAUDECODE` alone
cannot distinguish an agent's shell from a person typing in an editor that has the extension
installed. The same page documents `CLAUDE_CODE_CHILD_SESSION=1` as set only by Claude Code, for
tool subprocesses, hooks, and the status line, but not for stdio MCP servers (E-CC-D3). MCP servers
get `CLAUDE_CODE_SESSION_ID` instead (E-CC-D6). Requiring `CLAUDECODE` plus one of those two covers
every documented context and excludes the IDE terminal.

`CLAUDE_CODE_ENTRYPOINT` and `AI_AGENT` are present in practice but undocumented, so they are not
used (E-CC-D4, E-CC-D9).

Plugins are cached under `~/.claude/plugins/cache/` and listed in `installed_plugins.json`, but
installation is not enablement. Enablement is the `enabledPlugins` settings key, which any settings
scope can carry (E-CC-P1–P3). The settings page gives the scope order but no rule specific to this
object key (E-CC-P7). `claude plugin list --json` reports each install with its scope and enabled
state, which is the authoritative answer when shelling out is acceptable (E-CC-P6).

Managed policy has three local forms (files, the macOS managed-preferences domain, the Windows
registry) and one remote form (server-managed settings). By default the highest-ranked source that
carries any policy key wins outright (E-CC-M1, E-CC-M4, E-CC-M6). The Windows file path is
`C:\Program Files\ClaudeCode\`; the older `C:\ProgramData\` path is no longer read.

## Cursor

Cursor's terminal page documents `CURSOR_AGENT` as the way for a shell config to detect Cursor
(E-CUR-D1). The CLI bundle sets it to `1` for commands the agent runs, and a headless run confirmed
it (E-CUR-D2). The page does not say whether the IDE agent sets it as well, so the IDE's shipped
code was read next. It sets `CURSOR_AGENT:"1"` on the terminals its agent opens, alongside settings
that stop commands waiting for input, and in the extension host's base environment for agent shell
commands (E-CUR-D11). The IDE's MCP process does not set it (E-CUR-D12). The lead that
`CURSOR_TRACE_ID` marks the IDE terminal had no source at all (E-CUR-D5).

Hook commands get a separate, documented set: `CURSOR_PROJECT_DIR`, `CURSOR_VERSION`, and others,
plus a `CLAUDE_PROJECT_DIR` alias (E-CUR-D10). The alias is one reason `CLAUDE_*` names are not
evidence of Claude Code.

Plugin paths (`~/.cursor/plugins/local/`, `~/.cursor/plugins/marketplaces/`) come from the bundle.
No file records which plugins are enabled, and `cursor-agent plugin` manages marketplaces only
(E-CUR-P1–P8).

Cursor documents enterprise hook files per OS (E-CUR-M1). A `~/.cursor/managed/team_<id>/` folder
on the test machine looks like the Team-hook sync target, but no vendor page names it (E-CUR-M2).

## Codex

The public docs do not list the variables Codex sets on shell commands, so this part rests on the
source. `exec_env.rs` injects `CODEX_THREAD_ID` even when the shell env policy is an allowlist,
alongside `CODEX_SESSION_ID` and `CODEX_VERSION`, and unified exec adds `CODEX_CI=1` (E-CODEX-D1–D3,
E-CODEX-D7). `CODEX_SANDBOX` is macOS-only and `CODEX_PERMISSION_PROFILE` is documented in source as
spoofable, so neither is used (E-CODEX-D5, E-CODEX-D6).

The first pass reported `CODEX_COMPANION_SESSION_ID` and `CODEX_COMPANION_TRANSCRIPT_PATH` as Codex
variables. They were inherited from the Claude Code session that launched the experiment, where the
Codex plugin for Claude Code sets them.

Hooks are different: the hook engine sets only `PLUGIN_ROOT`, `PLUGIN_DATA`, and their `CLAUDE_*`
aliases (E-CODEX-D9, E-CODEX-D11). A Codex hook therefore cannot be identified by its environment.

Enabled plugins are `[plugins."<plugin>@<marketplace>"]` tables in `config.toml`, and installs are
copied to `plugins/cache/` (E-CODEX-P2, E-CODEX-P3). Managed policy paths and the macOS preference
domain are source constants (E-CODEX-M1–M6).

Codex keeps no record of which cached version is installed. It picks one each time it loads a
plugin: a `local` folder wins, otherwise the highest version, compared as semver when both names
parse and as strings when they do not (E-CODEX-P8, read at rust-v0.153.4 for
[#38](https://github.com/cyberuni/agent-harness/issues/38)). When a plugin's cache mixes semver and
non-semver names, that comparison is not a total order, so the pick depends on the sort.

## GitHub Copilot CLI

The first pass found `COPILOT_CLI` and `COPILOT_AGENT_SESSION_ID` in a live dump and called them
undocumented. The Copilot CLI changelog documents both (E-COPILOT-D1, E-COPILOT-D2), and documents
`COPILOT_PLUGIN_ROOT` for plugin hooks alongside the `PLUGIN_ROOT` and `CLAUDE_PLUGIN_ROOT` aliases
(E-COPILOT-D6).

The first pass also concluded that Copilot CLI has no local managed-policy file. That was wrong.
GitHub documents file-based managed settings on all three OSes, MDM on macOS and Windows, and
server-managed settings in an enterprise repository, with MDM > server > file > user precedence
(E-COPILOT-M1–M3). The `~/.cache/copilot/managed-settings/` file is only a cache of the server
response.

`enabledPlugins` is a documented settings key in user, repository, and local settings, and managed
values win per plugin (E-COPILOT-P4, E-COPILOT-M4). Plugins install under
`~/.copilot/installed-plugins/` (E-COPILOT-P9). Skills are a flat namespace: the first skill found
with a given name wins, and project skills shadow plugin skills (E-COPILOT-S2, E-COPILOT-S5).

For #38, a marketplace plugin and a direct plugin were installed into an empty `COPILOT_HOME` with
Copilot CLI 1.0.88. `config.json` lists each under `installedPlugins` with an absolute `cache_path`;
a direct install has an empty `marketplace` and is named by its bare name (E-COPILOT-P10,
E-COPILOT-P11). A plugin from a marketplace added by local path is loaded in place and never
reaches `config.json` (E-COPILOT-P12). Setting `XDG_CONFIG_HOME` and `XDG_STATE_HOME` did not move
the install out of `~/.copilot`, despite the split read from the bundle (E-COPILOT-P13).

## Wave 1 of #6

Issue [#6](https://github.com/cyberuni/agent-harness/issues/6) listed six more harnesses, with
detection leads from an unsourced survey and from `vercel-labs/skills`. Each lead was treated as
unverified. On 2026-09-26 each harness was read from its source at a pinned commit, plus in-repo or
vendor docs, one investigation per pair of related harnesses. None of the six CLIs was installed on
the test machine, so no environment was dumped; every detection claim is a source read.

### OpenCode and Kilo Code

OpenCode's CLI middleware sets `AGENT=1`, `OPENCODE=1`, and `OPENCODE_PID` on its own process
before any command runs. The shell tool and the local MCP launcher both copy `process.env` into the
child, so all three reach the agent's commands and MCP servers (E-OC-D1, E-OC-D2, E-OC-D4).
`AGENT=1` names no vendor.

Kilo Code vendors OpenCode's source. Its middleware still sets `AGENT=1` and `OPENCODE=1`, but it
sets `KILO_PID` instead of `OPENCODE_PID`, and it adds `KILO=1` (E-KILO-D1, E-KILO-D2). Its env
builder strips only credentials, so these reach commands and MCP servers too (E-KILO-D3,
E-KILO-D4). The lead was half right: Kilo does inherit `OPENCODE=1`, so `OPENCODE=1` alone would
read Kilo as OpenCode. Requiring `OPENCODE_PID` for OpenCode, and `KILO=1` with `KILO_PID` for
Kilo, keeps them apart without an ordering rule. Kilo started from an OpenCode shell still carries
the outer `OPENCODE_PID`, which is nesting and stays `unknown`.

Both keep plugins as JS/TS modules in a config folder or as npm packages named in config, with no
manifest and no enabled record (E-OC-P2, E-OC-P3, E-KILO-P2, E-KILO-P3). Both have a managed config
directory per OS and a macOS managed-preferences domain; Kilo renamed the directory but not the
domain (E-OC-M1, E-KILO-M1, E-KILO-M2). Both load `SKILL.md` skills, and the model can load them
through a tool. Both also make every loaded skill a `/<skill>` command. In Kilo, in the CLI and the
VS Code extension, it becomes `/<skill>:skill` when a command or MCP prompt has the name (E-KILO-S3,
superseding E-KILO-S2). In OpenCode, through v1.19.3, a built-in, config command, or MCP prompt of
the same name wins and the skill gets no command (E-OC-S3, superseding E-OC-S2). OpenCode's docs
do not say so; they describe an opt-in for the unreleased 2.x instead (E-OC-S4).

### Gemini CLI and Qwen Code

Gemini CLI sets `GEMINI_CLI=1` on shell tool commands and MCP stdio servers from one exported
constant (E-GEM-D1, E-GEM-D2). Hooks get no identifying variable, only project-dir and session
variables, one of them a `CLAUDE_PROJECT_DIR` alias (E-GEM-D3).

Qwen Code renamed the variable to `QWEN_CODE=1` and set it on shell commands only. `GEMINI_CLI`
appears nowhere in its source, so the lead that a fork carries its parent's variable does not hold
here (E-QWEN-D1). The survey's warning that the value may be empty was wrong: it is `1`. Qwen also
dropped the MCP-server variable (E-QWEN-D2).

The first pass reported no override for the `.gemini` folder. A re-read found `GEMINI_CLI_HOME`,
which replaces the home directory that holds `.gemini`, and `QWEN_HOME`, which replaces `.qwen`
itself (E-GEM-P2, E-QWEN-P4). Extensions live in `extensions/` with a per-extension manifest, and
`extension-enablement.json` records path-glob overrides rather than a boolean per extension
(E-GEM-P1, E-GEM-P3). Skills are loaded by the model through a tool; `/skills` manages them
(E-GEM-S2). The "system" settings file per OS, with an env override, is the managed layer
(E-GEM-M1, E-QWEN-M1).

### GitHub Copilot in VS Code

The agent's terminal tool is in VS Code core. It sets `COPILOT_AGENT=1` on every terminal it
creates, since PR #316267 in 1.121 (E-VSC-D1, E-VSC-D4). A later change added
`AI_AGENT=github_copilot_vscode_agent`, and then set `AI_AGENT` on every agent session VS Code hosts,
including external CLIs, so it cannot tell VS Code's own agent from Claude Code or Codex launched
inside VS Code (E-VSC-D3, E-VSC-D5). The 1.121 release note calls the variable `VSCODE_AGENT`, a name
that does not exist in source; the source wins (E-VSC-D6). VS Code never sets Copilot CLI's
variables (E-VSC-D7).

Skills are `/<skill>`, and a plugin's skills take the plugin name as a prefix (E-VSC-S1). Policy is
the Windows registry, a macOS profile, and `/etc/vscode/policy.json` on Linux (E-VSC-M1–M3).

### Cline

The VS Code extension creates its terminals with `CLINE_ACTIVE=true`, in two places, and nowhere
else in the repository (E-CLINE-D1–D3). The Cline CLI sets nothing of its own, so it cannot be
detected (E-CLINE-D4). Skills are `/<skill>`, not namespaced (E-CLINE-S2). No local policy file is
documented; enterprise settings come from the admin console (E-CLINE-M1).

### Retirements

Roo Code, Continue, Amazon Q Developer CLI, and Windsurf are gone or renamed, as the survey said
(E-RET-R1, E-RET-R2, E-RET-R4, E-RET-R5). Aider is quiet, not discontinued: there is no vendor
statement, only a stall in releases and commits (E-RET-R3).

## Wave 2 of #6

Wave 2 took the six harnesses #6 queued after wave 1 (Crush, Goose, OpenHands, Augment,
Antigravity, Rovo Dev) and re-checked five that earlier surveys found no variable for (Kiro, Amp,
Factory Droid, Devin Desktop, Warp). Each lead was treated as unverified. On 2026-09-27 each open
source harness was read at a pinned commit. Each closed one was read from its docs and, where a
package could be fetched, from its shipped bundle or binary, which was grepped or run through
`strings` and never executed. No harness was installed and run, so no environment was dumped.

### Crush

Crush has one function, `CrushEnvMarkers()`, that returns `CRUSH=1`, `AGENT=crush`, and
`AI_AGENT=crush`. Both the bash tool and the hook runner append it (E-CRUSH-D1–D3). MCP servers get
the process environment only, so they cannot be identified (E-CRUSH-D4). `AGENT` and `AI_AGENT` are
shared names, so the rule rests on `CRUSH=1`. Crush has no plugin system (E-CRUSH-P2). Its
`/etc/crush/crush.json` is the lowest-ranked config, not an enforced policy (E-CRUSH-M1).

### Goose

The repository moved from `block/goose` to `aaif-goose/goose`. Its docs say goose sets
`GOOSE_TERMINAL=1` and `AGENT=goose` whenever it runs a command (E-GOOSE-D1). The source says
otherwise: the only assignment is in the runner for a recipe's check commands, and the Developer
extension's shell tool sets just `AGENT_SESSION_ID` (E-GOOSE-D2, E-GOOSE-D3). That variable fails as
evidence, because its name is generic and `goose term init` puts it in a person's own shell too
(E-GOOSE-D5). The source wins, so Goose is not detected.

### OpenHands

The agent runtime now lives in `OpenHands/software-agent-sdk`. `OpenHands/OpenHands` has become
Agent Canvas, a UI that drives other agents. One helper, `sanitized_env()`, builds the environment
for the terminal tool, the agent-server sandbox, and hooks. It sets `AI_AGENT=openhands` when
`AI_AGENT` is unset (E-OH-D1–D3). The variable name is shared, but no other harness uses that
value, so the rule matches the exact value. Because OpenHands does not overwrite an existing value,
OpenHands started under a harness that set `AI_AGENT` is not seen. Hooks also get
`OPENHANDS_EVENT_TYPE` and `OPENHANDS_PROJECT_DIR`, which identify a hook even then (E-OH-D4). MCP
servers get nothing (E-OH-D6).

The OpenHands CLI is a separate release of the same runtime, and it lags. A live capture under CLI
1.16.0 showed no `AI_AGENT` on terminal commands, while its hooks carried the `OPENHANDS_*` pair
(E-OH-D9, E-OH-D10). The CLI pins SDK 1.21.0, and `AI_AGENT` first shipped in SDK 1.40.1
(E-OH-D11). Until the CLI moves to a newer SDK, its shell commands are not detected, and its hooks
are. The wave-2 read had inferred the opposite from the CLI using the SDK's terminal tool (E-OH-D7).

### Augment (Auggie CLI)

The Auggie CLI is closed source, so its npm bundle was read. The shell tool and MCP launcher add no
Augment variable (E-AUG-D1, E-AUG-D7). Hook commands get `AUGMENT_HOOK_EVENT`,
`AUGMENT_PROJECT_DIR`, and `AUGMENT_CONVERSATION_ID`, which the hooks page documents too
(E-AUG-D2, E-AUG-D3). The rule covers hooks only. Auggie mirrors Claude Code's plugin layout, down
to a `CLAUDE_PLUGIN_ROOT` alias on plugin hooks and a `.claude-plugin` marketplace folder (E-AUG-D4,
E-AUG-P3). Its `enabledPlugins` record merges only `true` entries across scopes (E-AUG-P4). That
does not fit this package's per-scope reading, so `enabledPlugins()` reports Auggie as unsupported.

### Harnesses with no verified signal

Antigravity, Rovo Dev, Kiro, Devin Desktop, and Warp are closed source, and their docs name only
variables a user sets. Amp's wrapper passes the environment through unchanged, and its binary's
strings show no marker. Factory Droid's `FACTORY_ENV` reaches only the worker `droid` processes it
spawns. The table in [conclusion.md](./conclusion.md) says which need a live `env` capture.

### Live capture protocol (#33)

A capture needs a person at a running, signed-in harness. An agent cannot capture one from inside
another harness, because the child inherits the parent's variables (E-CODEX-D12). On 2026-09-28
none of the nine harnesses could be run from the WSL machine this research uses: no CLI was
installed, and Antigravity IDE and Warp were installed only as Windows GUI apps. The OpenHands CLI
was captured the same day with a local mock LLM in place of a model account (E-OH-D9, E-OH-D10).

Record variable names only, never values. For each harness:

1. Start the harness from a fresh terminal that is not inside another agent. Run
   `env | cut -d= -f1 | sort > baseline.txt` in that terminal first.
2. Shell tool. Ask the agent to run `env | cut -d= -f1 | sort` and save the output as `shell.txt`.
   For an IDE or terminal app (Antigravity, Kiro, Devin Desktop, Warp, Augment), also run the same
   command yourself in that app's own terminal and save it as `typed.txt`. A variable in
   `shell.txt` but not in `typed.txt` marks an agent-run command.
3. Hooks, where the harness has them. Configure a hook whose command is
   `sh -c 'env | cut -d= -f1 | sort > /tmp/hook-env.txt'`, and trigger it once.
4. MCP servers, where the harness starts them. Add a stdio server whose command is
   `sh -c 'env | cut -d= -f1 | sort > /tmp/mcp-env.txt; exec cat'`. The handshake fails, but the
   file is written first.
5. Compare each file with `baseline.txt` (`comm -13 baseline.txt shell.txt`). Record the added
   names as a "Direct experiment" row in [evidence.md](./evidence.md), with the harness version,
   the OS, and the context (shell, hook, or MCP).

| Harness | Where to run it | Contexts to capture |
| --- | --- | --- |
| Antigravity IDE | Installed on the Windows host; use its agent panel | shell, typed |
| Antigravity CLI (`agy`) | Not installed; install per `google-antigravity/antigravity-cli`. Check for `GEMINI_CLI` | shell, hook, MCP |
| Rovo Dev CLI | Not installed; `acli rovodev` needs an Atlassian account | shell, MCP |
| Kiro IDE and CLI | Not installed | shell, typed, hook, MCP |
| Factory Droid | Not installed; `droid` needs a Factory account | shell, hook, MCP |
| Devin Desktop | Not installed | shell, typed, MCP |
| Warp (agent mode) | Installed on the Windows host; use agent mode | shell, typed |
| Augment IDE extension | Not installed; runs in VS Code | shell, typed |
| Amp | Not installed; needs an Amp account | shell, MCP |
| OpenHands CLI binary | Captured: CLI 1.16.0 with a local mock LLM. Shell commands carry no `AI_AGENT`; hooks carry `OPENHANDS_*` (E-OH-D9, E-OH-D10) | done (shell, hook) |

## Cross-harness findings

- **Compatibility aliases blur `CLAUDE_*` names.** Three harnesses pass `CLAUDE_PLUGIN_ROOT`,
  `CLAUDE_PLUGIN_DATA`, or `CLAUDE_PROJECT_DIR` to hooks or MCP servers. Only `CLAUDECODE` with a
  Claude Code session variable identifies Claude Code.
- **Nesting is ambiguous.** Environment variables are inherited, so a shell under Codex that was
  started from Claude Code carries both harnesses' markers. Nothing in the environment says which is
  innermost. The honest answer is `unknown`, with both candidates in the evidence.
- **Plugin dependencies are Claude Code only.** R5 is settled for all thirteen detected harnesses.
- **Forks keep some parent variables.** Kilo Code kept `OPENCODE=1`; Qwen Code renamed everything.
  A parent's rule must rest on a variable its forks do not set.
- **Cross-vendor variables are spreading.** `AGENT=1` and `AI_AGENT` announce that an agent is
  running, not which. VS Code sets `AI_AGENT` for agents it merely hosts. Crush, Goose, and
  OpenHands write their own names into these shared variables; only OpenHands' value is used, and
  only because OpenHands sets no variable of its own on shell commands.
- **Docs can overstate.** Goose documents a variable its shell tool does not set, and VS Code's
  release note names a variable that does not exist. The source wins.
- **Many closed harnesses cannot be settled from outside.** Half of wave 2 needs a live
  environment capture, which this investigation could not run.
