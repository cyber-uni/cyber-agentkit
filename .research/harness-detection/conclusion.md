# Conclusion — Harness detection (September 2026)

## Last updated

2026-10-04 (R9). Versions checked: Claude Code 2.1.283 (2.1.289 for R9), cursor-agent
2026.07.01-41b2de7 (2026.09.28-64d2043 for R9), codex-cli 0.153.4 (source at openai/codex b8d5e3f,
rust-v0.153.4 for R7, and 0.159.3 with source at 4ad985e for R9), GitHub Copilot CLI 1.0.83 (1.0.88
for R7, 1.0.90 for R9).

Wave 1 of [#6](https://github.com/cyberuni/agent-harness/issues/6), also 2026-09-26, read from
source at pinned commits: OpenCode (anomalyco/opencode b471c2b4), Kilo Code (Kilo-Org/kilocode
7d977bce), Gemini CLI (google-gemini/gemini-cli 2fe7c2d3), Qwen Code (QwenLM/qwen-code e471cfe6),
VS Code (microsoft/vscode 66a33c85), and Cline (cline/cline 29896ec7).

Wave 2 of #6, 2026-09-27: Crush (charmbracelet/crush 056387be), Goose (aaif-goose/goose 98c626d7),
and OpenHands (OpenHands/software-agent-sdk 3311ba9e) read from source; the Auggie CLI
(`@augmentcode/auggie` 0.36.0) read from its npm bundle and docs; Antigravity, Rovo Dev, Kiro, Amp,
Factory Droid, Devin Desktop, and Warp checked against docs and, where one could be fetched, the
shipped binary.

[#33](https://github.com/cyberuni/agent-harness/issues/33), 2026-09-28: the OpenHands CLI 1.16.0
captured live, with a mock LLM driving its terminal tool and a hook.

## Question

How can a process tell which agent harness it runs under — Claude Code, Cursor, Codex, GitHub
Copilot CLI, OpenCode, Kilo Code, Gemini CLI, Qwen Code, GitHub Copilot in VS Code, Cline, Crush,
OpenHands, or the Auggie CLI — and, for that harness, where do its plugins live, which plugins are
enabled, where does managed policy live, how does it name plugin skills, can plugins depend on
each other, and how is it run headless?

## Verdict

**Every wave-1 harness marks the shell commands its agent runs with an environment variable of its
own. Wave 2 breaks that pattern.** Of its eleven candidates, Crush and OpenHands mark shell commands,
the Auggie CLI marks only hook commands, and the other eight have no verified signal (see "Wave 2: no
verified signal"). Most variables are read from source rather than vendor docs. Detection by
environment is reliable for commands the agent runs. It is weaker for hook scripts and MCP servers,
and it cannot resolve nesting: a harness started from another harness's shell inherits the outer
harness's variables, so the environment alone cannot say which one is innermost. A detector must
report `unknown` when signals from two harnesses are present.

Forks inherit their parent's code, and with it some of the parent's variables. Kilo Code still sets
OpenCode's `OPENCODE=1`. The parent's rule must require a variable the fork does not set, so a fork
is never read as its parent. Qwen Code renamed Gemini CLI's variable outright, so the two never
overlap. Several harnesses also set cross-vendor variables (`AGENT=1`, `AI_AGENT`). Those say that
some agent is running, not which one.

## R1. Detection signals

| Harness | Accept as detection | Contexts | Confidence | Evidence |
| --- | --- | --- | --- | --- |
| Claude Code | `CLAUDECODE=1` **and** either `CLAUDE_CODE_CHILD_SESSION=1` or `CLAUDE_CODE_SESSION_ID` set | Bash/PowerShell/Monitor tools, hooks, status line (child session); stdio MCP servers (session id) | High | E-CC-D1, E-CC-D3, E-CC-D6 |
| Cursor | `CURSOR_AGENT=1` | Terminal commands the agent runs, in both the IDE and the `cursor-agent` CLI | High for the CLI (observed); Medium for the IDE (read from its code) | E-CUR-D1, E-CUR-D2, E-CUR-D11 |
| Cursor (hooks) | `CURSOR_VERSION` and `CURSOR_PROJECT_DIR` both set | Hook commands | High | E-CUR-D10 |
| Codex | `CODEX_THREAD_ID` set | Shell tool commands; injected even under a restrictive shell env policy | High (source read, undocumented on the docs site) | E-CODEX-D2 |
| Copilot CLI | `COPILOT_CLI=1`, or `COPILOT_AGENT_SESSION_ID` set | Shell commands (and git hooks they trigger); MCP servers | High (vendor changelog) | E-COPILOT-D1, E-COPILOT-D2 |
| Copilot CLI (hooks) | `COPILOT_PLUGIN_ROOT` set | Plugin hook commands | High (vendor changelog) | E-COPILOT-D6 |
| OpenCode | `OPENCODE=1` **and** `OPENCODE_PID` set | Shell tool commands; local MCP servers | High (source) | E-OC-D1, E-OC-D2, E-OC-D4 |
| Kilo Code | `KILO=1` **and** `KILO_PID` set | Shell tool commands; local MCP servers (Kilo CLI) | High (source) | E-KILO-D1–D4 |
| Gemini CLI | `GEMINI_CLI=1` | Shell tool commands; MCP stdio servers | High (source) | E-GEM-D1, E-GEM-D2 |
| Qwen Code | `QWEN_CODE=1` | Shell tool commands only | High (source) | E-QWEN-D1 |
| Copilot in VS Code | `COPILOT_AGENT=1` | Terminal commands the chat agent runs (VS Code 1.121 and later) | High (source; the 1.121 release note misnames it `VSCODE_AGENT`) | E-VSC-D1, E-VSC-D4, E-VSC-D6 |
| Cline | `CLINE_ACTIVE=true` | Terminal commands in the VS Code extension only | High (source) | E-CLINE-D1–D3 |
| Crush | `CRUSH=1` | Bash tool and hook commands; not MCP servers | High (source) | E-CRUSH-D1–D4 |
| OpenHands | `AI_AGENT=openhands` (exact value) | Terminal tool and hook commands, local or in the agent-server sandbox, from SDK 1.40.1 on. Not the OpenHands CLI 1.16.0, which pins SDK 1.21.0 | High (source; the CLI by direct experiment) | E-OH-D1–D3, E-OH-D9, E-OH-D11 |
| OpenHands (hooks) | `OPENHANDS_EVENT_TYPE` and `OPENHANDS_PROJECT_DIR` both set | Hook commands, including the OpenHands CLI's | High (source and direct experiment) | E-OH-D4, E-OH-D10 |
| Auggie CLI (hooks) | `AUGMENT_HOOK_EVENT` and `AUGMENT_PROJECT_DIR` both set | Hook commands only | High (docs and bundle) | E-AUG-D2, E-AUG-D3 |

Signals to **reject** as proof:

- `CLAUDECODE=1` alone. IDE extensions set it in their integrated terminals too (E-CC-D2).
- `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`, `PLUGIN_ROOT`, `PLUGIN_DATA`.
  Codex, Copilot CLI, and Cursor hand these to hooks or MCP servers as compatibility aliases
  (E-CODEX-D9, E-COPILOT-D6, E-CUR-D10).
- `TERM_PROGRAM=vscode`. Any VS Code fork sets it. `CURSOR_TRACE_ID` has no source (E-CUR-D5).
- `CODEX_SANDBOX` (macOS only), `CODEX_PERMISSION_PROFILE` (spoofable, per the source comment),
  `CODEX_COMPANION_*` (set by the Codex plugin for Claude Code, not by Codex) (E-CODEX-D5,
  E-CODEX-D6, E-CODEX-D7).
- `COPILOT_HOME`, `CODEX_HOME`, `CLAUDE_CONFIG_DIR`, `CURSOR_CONFIG_DIR`, `GEMINI_CLI_HOME`,
  `QWEN_HOME`, `OPENCODE_CONFIG*`, `KILO_CONFIG*`, `CLINE_DATA_DIR`. These are user settings.
- `AGENT=1`. OpenCode and Kilo Code both set it, and it names no vendor (E-OC-D6, E-KILO-D1).
- `AI_AGENT` with any value but `openhands`. A cross-vendor convention: VS Code sets
  `github_copilot_vscode_agent` on every agent session it hosts, including external CLIs it
  launches, Claude Code sets its own value, and Crush sets `crush` alongside `CRUSH=1` (E-VSC-D2,
  E-VSC-D5, E-CC-D9, E-CRUSH-D1). OpenHands fills in `openhands` only when `AI_AGENT` is unset, so
  that exact value is OpenHands' own, but OpenHands started under a harness that already set
  `AI_AGENT` keeps the outer value and is not seen (E-OH-D5).
- `AGENT=crush`, `AGENT=goose`. Vendor values in a shared name; Crush's own `CRUSH=1` is used
  instead, and Goose sets its pair only on recipe check commands (E-CRUSH-D5, E-GOOSE-D2).
- `GOOSE_TERMINAL`. Goose documents it for every command, but the source sets it only on a recipe's
  `success_check` and `on_failure` commands, not on the shell tool the agent uses (E-GOOSE-D1,
  E-GOOSE-D2).
- `AGENT_SESSION_ID`. Goose sets it on shell and MCP commands, but the name is generic, the value is
  a session id, and `goose term init` exports it into a person's own shell (E-GOOSE-D5).
- `AUGMENT_PLUGIN_ROOT`, `AUGGIE_PLUGIN_ROOT`. Real, but only on plugin hooks and read from the
  bundle alone; Auggie also sets `CLAUDE_PLUGIN_ROOT` beside them (E-AUG-D4).
- `FACTORY_ENV`. Factory Droid sets it only on the worker `droid` processes it spawns, not on its
  shell tool (E-DROID-D1–D3).
- `OPENCODE=1` alone. Kilo Code still sets it (E-KILO-D1); only `OPENCODE_PID`, which Kilo replaced
  with `KILO_PID`, separates the two.
- `VSCODE_AGENT`. The VS Code 1.121 release note names it, but no such variable exists in source
  (E-VSC-D6).
- `GEMINI_PROJECT_DIR`, `QWEN_PROJECT_DIR`. Gemini CLI and Qwen Code hand hooks these alongside a
  `CLAUDE_PROJECT_DIR` alias, and Qwen Code sets all three (E-GEM-D3, E-QWEN-D3).

**Not detectable by environment:**

- Codex hook commands, which receive only the plugin-root variables (E-CODEX-D11).
- MCP servers started by the Cursor IDE (E-CUR-D12).
- Gemini CLI and Qwen Code hook commands, which get no identifying variable (E-GEM-D3, E-QWEN-D3).
- Qwen Code MCP servers: the fork dropped the variable Gemini CLI sets there (E-QWEN-D2).
- Copilot in VS Code hooks and MCP servers (E-VSC-D9, E-VSC-D10).
- The Cline CLI, which sets no variable of its own (E-CLINE-D4).
- Crush, OpenHands, and Auggie MCP servers, which get no identifying variable (E-CRUSH-D4, E-OH-D6,
  E-AUG-D7).
- Auggie shell commands (E-AUG-D1).

**IDE or CLI, for Cursor:** both set `CURSOR_AGENT=1`. Only the CLI's launcher exports
`CURSOR_INVOKED_AS`, so `CURSOR_AGENT=1` without it points to the IDE (E-CUR-D4, E-CUR-D12, Medium).

## R2. Plugin storage and enabled plugins

| Harness | Config root | Installed plugins | Enabled record | Query |
| --- | --- | --- | --- | --- |
| Claude Code | `$CLAUDE_CONFIG_DIR` or `~/.claude` (E-CC-D7) | `plugins/cache/<marketplace>/<plugin>/<version>/`, listed in `plugins/installed_plugins.json` (E-CC-P1, E-CC-P2) | `enabledPlugins` (`plugin@marketplace` → boolean) in managed, local, project, and user settings (E-CC-P3) | Read the settings files, or `claude plugin list --json` (E-CC-P6) |
| Cursor | `~/.cursor` (`CURSOR_CONFIG_DIR` override read from the bundle only) | `plugins/local/<dir>/`, `plugins/marketplaces/` (E-CUR-P1–P3) | Not found (E-CUR-P8) | None. No CLI command lists installed plugins (E-CUR-P7) |
| Codex | `$CODEX_HOME` or `~/.codex` (E-CODEX-D8) | `plugins/cache/<marketplace>/<plugin>/<version>/` (E-CODEX-P3) | `[plugins."<plugin>@<marketplace>"] enabled = <bool>` in `config.toml` (E-CODEX-P2) | Read `config.toml` |
| Copilot CLI | `$COPILOT_HOME` or `~/.copilot` (E-COPILOT-P1) | `installed-plugins/<marketplace>/<plugin>/`, `installed-plugins/_direct/<id>/` (E-COPILOT-P9) | `enabledPlugins` in user, repository (`.github/copilot/settings.json`), and local (`.github/copilot/settings.local.json`) settings; managed entries win per plugin (E-COPILOT-P4, E-COPILOT-M4) | Read the settings files, or `copilot plugin list --json` (E-COPILOT-P5) |
| OpenCode | `$XDG_CONFIG_HOME/opencode` or `~/.config/opencode` (E-OC-P4) | `plugins/` (JS/TS files), plus npm packages named in the `plugin` config array (E-OC-P2) | None; a listed or present plugin is loaded (E-OC-P3) | None |
| Kilo Code | `$XDG_CONFIG_HOME/kilo` or `~/.config/kilo` (E-KILO-P4) | `plugin/`, plus the `plugin` config array (E-KILO-P2) | None (E-KILO-P3) | None |
| Gemini CLI | `$GEMINI_CLI_HOME/.gemini` or `~/.gemini` (E-GEM-P2) | `extensions/<name>/gemini-extension.json` (E-GEM-P1) | `extensions/extension-enablement.json`, per-extension path-glob `overrides`, not a boolean (E-GEM-P3) | None read by this package |
| Qwen Code | `$QWEN_HOME` or `~/.qwen` (E-QWEN-P4) | `extensions/<name>/qwen-extension.json` (E-QWEN-P1) | `extensions/extension-enablement.json` (Medium, E-QWEN-P2) | None read by this package |
| Copilot in VS Code | VS Code's user data directory | `agentPlugins/` under `~/Library/Application Support/Code` (macOS), `~/.config/Code` (Linux), `%APPDATA%\Code` (Windows) (E-VSC-P3) | Not found; kept apart from plugin config (E-VSC-P4) | None |
| Cline | `~/.cline` (E-CLINE-P1) | `plugins/_installed/{npm,git,remote,local}/` (E-CLINE-P3) | Not found (E-CLINE-P4) | None |
| Crush | `$CRUSH_GLOBAL_CONFIG`, else `$XDG_CONFIG_HOME/crush` or `~/.config/crush` (E-CRUSH-P1) | None; Crush has no plugin system (E-CRUSH-P2) | None | None |
| OpenHands | `$OH_PERSISTENCE_DIR` or `~/.openhands`; the CLI reads `OPENHANDS_PERSISTENCE_DIR` instead (E-OH-P1, E-OH-P2) | `plugins/installed/<name>/` (E-OH-P3) | `.installed.json` in the install folder, `enabled: bool` per name (E-OH-P4) | None read by this package |
| Auggie CLI | `~/.augment`; no env override (E-AUG-P1) | `plugins/marketplaces/` (E-AUG-P2) | `enabledPlugins` in `settings.json`, but only `true` entries count when scopes merge (E-AUG-P4) | None read by this package |

Caveats:

- Claude Code documents the settings precedence (managed > local > project > user) but not how the
  `enabledPlugins` object merges across scopes. Resolving each plugin key by that precedence is the
  reading this project takes; it is Medium confidence (E-CC-P7). A plugin with no entry falls back to
  its `defaultEnabled` value, which lives in the plugin, not in settings (E-CC-P3).
- Copilot CLI also reads `enabledPlugins` from `.claude/settings.json` and
  `.claude/settings.local.json`, but the docs do not rank them against `.github/copilot/`
  (E-COPILOT-P4). Its settings files are JSON with comments.
- Server-managed and MDM policy cannot be read from a file (see R3), so any locally resolved enabled
  set can be overridden by policy this package cannot see.
- Cline documents `CLINE_DATA_DIR` as an override but not whether it replaces `~/.cline` or
  `~/.cline/data` (E-CLINE-P1). This package does not apply it.
- Auggie keeps only the `true` entries of each scope's `enabledPlugins` and merges them, so a `false`
  entry does not turn off a plugin another scope enables. That rule is read from a minified bundle,
  and it does not fit this package's per-scope resolution, so `enabledPlugins()` reports Auggie as
  unsupported.
- `OPENCODE_CONFIG_DIR` and `KILO_CONFIG_DIR` add a directory searched like a project `.opencode/`;
  they do not move the global config dir (E-OC-P1, E-OC-P4, E-KILO-P4).

## R3. Managed policy

| Harness | Local file | MDM / registry | Server-side only |
| --- | --- | --- | --- |
| Claude Code | `managed-settings.json`, `managed-settings.d/*.json`, `managed-mcp.json` in `/Library/Application Support/ClaudeCode/` (macOS), `/etc/claude-code/` (Linux, WSL), `C:\Program Files\ClaudeCode\` (Windows) (E-CC-M1) | macOS `com.anthropic.claudecode`; Windows `HKLM\SOFTWARE\Policies\ClaudeCode` (and user-writable `HKCU`) (E-CC-M6) | Server-managed settings from the claude.ai admin console (E-CC-M4) |
| Cursor | Enterprise hooks: `/etc/cursor/hooks.json` (Linux), `/Library/Application Support/Cursor/hooks.json` (macOS), `C:\ProgramData\Cursor\hooks.json` (Windows) (E-CUR-M1) | Not documented beyond these files | Team hooks and admin settings from the Cursor dashboard (E-CUR-M1) |
| Codex | `/etc/codex/requirements.toml`, `/etc/codex/managed_config.toml`, `/etc/codex/config.toml` (Unix); `%ProgramData%\OpenAI\Codex\requirements.toml` (Windows) (E-CODEX-M1–M5) | macOS `com.openai.codex`, keys `config_toml_base64`, `requirements_toml_base64` (E-CODEX-M6) | Cloud-managed requirements (E-CODEX-M8) |
| Copilot CLI | `managed-settings.json` in `/etc/github-copilot/` (Linux), `/Library/Application Support/GitHubCopilot/` (macOS), `%ProgramFiles%\GitHubCopilot\` (Windows) (E-COPILOT-M1) | macOS `com.github.copilot`; Windows `HKLM\SOFTWARE\Policies\GitHubCopilot` (E-COPILOT-M2) | Server-managed settings in the enterprise's `.github-private` repository (E-COPILOT-M3) |
| OpenCode | Managed config directory: `/Library/Application Support/opencode/` (macOS), `/etc/opencode/` (Linux), `%ProgramData%\opencode` (Windows) (E-OC-M1) | macOS `ai.opencode.managed`, which outranks the file (E-OC-M1, E-OC-M2) | Remote config from `.well-known/opencode`, lowest precedence (E-OC-M2) |
| Kilo Code | Managed config directory: `/Library/Application Support/kilo` (macOS), `/etc/kilo` (Linux), `%ProgramData%\kilo` (Windows) (E-KILO-M1) | macOS `ai.opencode.managed`, unrenamed from OpenCode (E-KILO-M2) | Not researched |
| Gemini CLI | `settings.json` and `system-defaults.json` in `/Library/Application Support/GeminiCli/` (macOS), `/etc/gemini-cli/` (Linux), `C:\ProgramData\gemini-cli\` (Windows); `GEMINI_CLI_SYSTEM_SETTINGS_PATH` and `GEMINI_CLI_SYSTEM_DEFAULTS_PATH` override them (E-GEM-M1, E-GEM-M2) | Not found in source (E-GEM-M3) | Not found |
| Qwen Code | `settings.json` and `system-defaults.json` in `/Library/Application Support/QwenCode/` (macOS), `/etc/qwen-code/` (Linux), `C:\ProgramData\qwen-code\` (Windows); `QWEN_CODE_SYSTEM_SETTINGS_PATH` and `QWEN_CODE_SYSTEM_DEFAULTS_PATH` override them (E-QWEN-M1, E-QWEN-M3) | Not found in source (E-QWEN-M2) | Not found |
| Copilot in VS Code | `/etc/vscode/policy.json` (Linux, VS Code 1.106 and later) (E-VSC-M3) | Windows `Software\Policies\Microsoft\VSCode`; macOS `.mobileconfig` profile, domain not documented (E-VSC-M1, E-VSC-M2) | Not researched |
| Cline | None found | None found | Cline Enterprise admin console (Medium, E-CLINE-M1) |
| Crush | `/etc/crush/crush.json` outside Windows, the lowest-ranked config (E-CRUSH-M1, E-CRUSH-M2) | None found | None found |
| OpenHands | None found (E-OH-D8) | None found | OpenHands Cloud and Enterprise, not inspectable (E-OH-D8) |
| Auggie CLI | `/etc/augment/settings.json` (macOS, Linux); `%ProgramData%\augment\settings.json` (Windows) (Medium, E-AUG-M1) | None found (E-AUG-M2) | Not researched |

The Cursor row covers hooks only. Cursor documents no local file for its other enterprise
settings. The Gemini CLI and Qwen Code "system" settings are the closest thing they have to managed
policy: a system-wide file that outranks user settings. Crush's system file is the reverse: user and
project config override it, so it sets defaults, not policy.

## R4. Skill naming

| Harness | Slash command | Prose mention | Namespaced by plugin? | Evidence |
| --- | --- | --- | --- | --- |
| Claude Code | `/<plugin>:<skill>`; bare `/<skill>` also works when no other command has the name | — | Yes | E-CC-S1 |
| Cursor | `/<skill>` | — | No | E-CUR-S1 |
| Codex | `/skills` opens a picker | `$<skill>` | No; skills are bare names (Medium) | E-CODEX-S1–S3 |
| Copilot CLI | `/<skill>` | — | No; first skill found with the name wins | E-COPILOT-S2, E-COPILOT-S5, E-COPILOT-S6 |
| OpenCode | None; the model calls a `skill` tool | — | No | E-OC-S1, E-OC-S2 |
| Kilo Code | `/<skill>`; `/<skill>:skill` when a command or MCP prompt has the name | Ask in prose ("use the api-design skill") | No | E-KILO-S1, E-KILO-S3 |
| Gemini CLI | None; the model calls `activate_skill`, and `/skills` only manages skills | — | Extension commands take an `<extension>:` prefix on collision | E-GEM-S1–S3 |
| Qwen Code | None; the model calls a `skill` tool | — | No | E-QWEN-S1 |
| Copilot in VS Code | `/<skill>`; a plugin's skill is `/<plugin>:<skill>` | — | Yes, for plugin skills | E-VSC-S1 |
| Cline | `/<skill>` | — | No | E-CLINE-S1, E-CLINE-S2 |
| Crush | None typed; the model activates a skill, and `user-invocable: true` adds it to the command palette | — | No; one flat namespace | E-CRUSH-S1, E-CRUSH-S2 |
| OpenHands | A plugin's commands are `/<plugin>:<command>`; skills are triggered by the model | — | Yes, for plugin commands | E-OH-S2, E-OH-S3 |
| Auggie CLI | `/<skill>` for a user or project skill; a plugin skill's typed form is not confirmed | — | A plugin skill's internal name is `<plugin>:<skill>` | E-AUG-S2, E-AUG-S3 |

The skill's frontmatter `name` supplies the skill segment in every harness.

Corrections from `skill-resolution` (2026-10-20): Codex plugin skills are `<plugin>:<skill>`, and Copilot CLI
namespaces plugin skills as `<plugin>:<skill>` when two enabled plugins share a skill name. In R6, Cursor also reads
`.grok/skills`, and Copilot CLI reads `~/.agents/skills` only when `COPILOT_HOME` is the default.

## R5. Plugin-to-plugin dependencies

Only Claude Code supports them: `dependencies` in `plugin.json` (E-CC-X1). Cursor's schema
(E-CUR-X1), Codex's manifests and the Agent Plugins 1.0 schema (E-CODEX-X1, E-CODEX-X2), and
Copilot CLI's manifest reference (E-COPILOT-X1) have no such field. Neither do OpenCode plugins,
which have no manifest (E-OC-X1), Kilo Code (only an `engines` version range, E-KILO-X1), Gemini CLI
and Qwen Code extensions (E-GEM-P4, E-QWEN-P3), Copilot in VS Code (E-VSC-X1), Cline (only
`peerDependencies` on host packages, E-CLINE-X1), Crush (no plugin system, E-CRUSH-X1), OpenHands
(E-OH-X1), or the Auggie CLI (E-AUG-X1).

## R6. Skill directories

Where each harness reads skills by default. Project paths are relative to the project root, user
paths to the home directory. Admin, bundled, and plugin skills are left out.

| Harness | Project | User | Reads `.agents/skills`? | Evidence |
| --- | --- | --- | --- | --- |
| Claude Code | `.claude/skills` | `.claude/skills` | No | E-CC-L1 |
| Cursor | `.agents/skills`, `.cursor/skills`, `.claude/skills`, `.codex/skills` | same | Yes | E-CUR-L1 |
| Codex | `.agents/skills`, from the working directory up to the repository root | `.agents/skills` | Yes | E-CODEX-L1 |
| Copilot CLI | `.github/skills`, `.agents/skills`, `.claude/skills` | `.copilot/skills`, `.agents/skills` | Yes | E-COPILOT-S5 |
| Copilot in VS Code | `.github/skills`, `.claude/skills`, `.agents/skills` | `.copilot/skills`, `.claude/skills`, `.agents/skills` | Yes | E-VSC-P1 |
| OpenCode | `.opencode/skills`, `.claude/skills`, `.agents/skills` | `.config/opencode/skills`, `.claude/skills`, `.agents/skills` | Yes | E-OC-S1 |
| Gemini CLI | `.agents/skills`, `.gemini/skills` (the alias wins a name clash) | same | Yes | E-GEM-L1 |
| Cline | `.cline/skills`, `.clinerules/skills`, `.claude/skills`, `.agents/skills` | `.cline/skills`, `.agents/skills` | Yes, in source; the docs do not name it | E-CLINE-S1, E-CLINE-S3 |
| Auggie CLI | `.augment/skills`, `.claude/skills`, `.agents/skills` (that precedence) | same | Yes | E-AUG-S4 |
| Kilo Code | `.kilo/skills`, `.agents/skills`, `.claude/skills` (the VS Code extension reads `.claude/skills` only with Claude Code compatibility on) | same | Yes | E-KILO-L2 |
| Qwen Code | Not confirmed: the source names the `.agents` root, not the directory under it | — | — | E-QWEN-S1 |
| Crush, OpenHands | Not recorded | — | — | — |

`vercel-labs/skills` records one project directory per agent and calls an agent universal when that
one is `.agents/skills`. It lists Cline as universal. Cline's docs name no `.agents/skills` path,
but both its VS Code extension and the SDK its CLI runs on read it at both scopes (E-CLINE-S3,
2026-10-04), so `skillsDirectories('cline')` records it and the drift baseline marks it
source-backed.

## R7. Installed plugin folders

How to map an installed plugin to the folder it runs from.

| Harness | Record | Folder | Evidence |
| --- | --- | --- | --- |
| Claude Code | `plugins/installed_plugins.json`: `plugin@marketplace` → `[{ scope, installPath, version, projectPath? }]` | `installPath` | E-CC-P2, E-CC-P6 |
| Codex | None. Every `plugins/cache/<marketplace>/<plugin>/` with a valid version folder is installed | `local` if present, else the highest version (semver when both names parse, else string order) | E-CODEX-P3, E-CODEX-P8 |
| Copilot CLI | `config.json` `installedPlugins`: `[{ name, marketplace, version, cache_path, enabled }]`; `marketplace` is `""` for a direct install | `cache_path` | E-COPILOT-P10, E-COPILOT-P11 |
| Others | Not researched for an install record | — | — |

Caveats:

- Codex's version comparison is not a total order when one plugin's cache mixes semver and
  non-semver folder names, so the folder Codex picks depends on its sort. This package reports such
  a plugin as unresolved instead of guessing.
- Codex counts a cached plugin as installed in its UI only when `config.toml` also configures it.
  The cache alone is what `PluginStore::is_installed` checks (E-CODEX-P8).
- Copilot CLI plugins from a marketplace added by local path are loaded in place and are not in
  `config.json` (E-COPILOT-P12). Their folder is `<marketplace path>/<plugin source>`, read from the
  marketplace catalog, which this package does not parse.
- A Copilot CLI direct install has no `plugin@marketplace` key, so it cannot be joined with
  `enabledPlugins` (E-COPILOT-P11).

Gemini CLI, which the registry lists with `skillsDir: '.agents/skills'`, agrees with its docs:
workspace skills load from `.gemini/skills/` "or the `.agents/skills/` alias" (E-GEM-L1, re-checked
2026-09-28). The earlier reading that it used `.gemini/skills` only is superseded.

## R8. Instruction files

Which instruction files each harness reads, per its vendor docs. User paths are relative to the home
directory. This is the second axis the drift check watches; the library does not expose it yet.

| Harness | Project | User | Reads `AGENTS.md`? | Evidence |
| --- | --- | --- | --- | --- |
| Claude Code | `CLAUDE.md` or `.claude/CLAUDE.md`, `CLAUDE.local.md` | `.claude/CLAUDE.md` | Yes, alone or alongside `CLAUDE.md` | E-CC-I1 |
| Cursor | `.cursor/rules`, `AGENTS.md` (root and subdirectories) | Settings, no file | Yes | E-CUR-I1 |
| Codex | `AGENTS.override.md`, else `AGENTS.md`, per directory from the root down | `.codex/AGENTS.md` (or `CODEX_HOME`) | Yes | E-CODEX-I1 |
| Copilot CLI | `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | `.copilot/copilot-instructions.md`, `.copilot/instructions` | Yes | E-COPILOT-I1 |
| Copilot in VS Code | `.github/copilot-instructions.md`, `AGENTS.md`, `.github/instructions`, `CLAUDE.md`, `.claude/rules` | `.copilot/instructions`, `.claude/rules` | Yes | E-VSC-I1 |
| OpenCode | `AGENTS.md`, else `CLAUDE.md` | `.config/opencode/AGENTS.md`, else `.claude/CLAUDE.md` | Yes | E-OC-I1 |
| Kilo Code | `AGENTS.md`, else `AGENT.md` | — | Yes | E-KILO-I1 |
| Gemini CLI | `GEMINI.md`, name set by `context.fileName` | `.gemini/GEMINI.md` | Not by default | E-GEM-I1 |
| Qwen Code | `QWEN.md`, `.qwen/QWEN.local.md` | `.qwen/QWEN.md` | Yes | E-QWEN-I1 |
| Cline | `.clinerules/` or `.cline/rules/`, `.cursorrules`, `.windsurfrules`, `AGENTS.md` | `.cline/rules`, `.agents/AGENTS.md` | Yes | E-CLINE-I1 |
| Crush | Not stated beyond the file `crush` initializes (`AGENTS.md` by default) | `.config/crush/CRUSH.md`, `.config/AGENTS.md` | Globally | E-CRUSH-I1 |
| OpenHands | `AGENTS.md`, also `CLAUDE.md` and `GEMINI.md` | — | Yes | E-OH-I1 |
| Auggie CLI | `CLAUDE.md`, `AGENTS.md`, `.augment-guidelines`, `.augment/rules/` | `.augment/rules/` | Yes | E-AUG-I1 |

## R9. Headless invocation

How to run one prompt with no user present, for a runner that measures an agent (cyber-sdd#69) or
spawns one. `headlessInvocation()` encodes the rows marked supported. The others either have no
headless mode or have one whose flags were read only through a summarizing fetch or from source
with no vendor doc, so the library reports them as `unknown` rather than guess.

| Harness | One-shot argv | Unattended permission | Usage in output | Transcript | Exit codes | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code | `claude -p <prompt>` | `--permission-mode bypassPermissions` | `result` message: `usage`, `total_cost_usd` (`stream-json` needs `--verbose`) | `~/.claude/projects/<project>/<session-id>.jsonl` | 0 / non-zero; read the `result` subtype | E-CC-H1–H6 |
| Codex | `codex exec <prompt>` | `--dangerously-bypass-approvals-and-sandbox` | `--json`: `usage` on each `turn.completed`, summed; no cost | `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl` | 0 / 1 (source) | E-CODEX-H1–H5 |
| Copilot CLI | `copilot -p <prompt>` | `--allow-all` | Not documented; `--usage-output-file` | `~/.copilot/session-state/<id>/events.jsonl` | Not documented for `-p` | E-COPILOT-H1–H3 |
| Cursor | `cursor-agent -p <prompt>` | `--force` | None documented | Not documented | 0 / 1 (example only) | E-CUR-H1–H3 |
| Gemini CLI | `gemini -p <prompt>` | `--approval-mode yolo` | `stats` / `result` event; fields not documented | `~/.gemini/tmp/<project_hash>/chats/` | 0, 1, 42, 53 | E-GEM-H1–H3 |
| Qwen Code | `qwen -p <prompt>` | `--approval-mode yolo` | `result` message `usage`; fields not documented | `~/.qwen/projects/<sanitized-cwd>/chats/` | 53, 55, 130 | E-QWEN-H1–H2 |
| OpenCode, Kilo Code, Cline, Crush, OpenHands, Auggie CLI | Each has a one-shot mode | — | — | — | — | E-OC-H1, E-KILO-H1, E-CLINE-H1, E-CRUSH-H1, E-OH-H1, E-AUG-H1 |
| Copilot in VS Code | None documented | — | — | — | — | E-VSC-H1 |

Only Claude Code reports a dollar cost. Exit codes are a weak signal across the board: Claude Code
documents only zero and non-zero, and a capped run is told apart by its `result` subtype.

## Drift watch

`scripts/harness-drift.mjs` watches one primary vendor docs section per harness and axis, listed in
`scripts/vendor-baseline.json` with the evidence ID and confidence each backs. A section that
cannot be found or names no paths fails the run. The `vercel-labs/skills` registry stays in as
corroboration. The skills baseline holds what the evidence records, so a path the docs add shows up
as a finding until the research accepts it. A source's `sourceBacked` entry lists directories the
vendor's code reads but its docs do not name, with the evidence that shows it; Cline's
`.agents/skills` is the only one (E-CLINE-S3).

The 2026-09-28 Auggie CLI and Kilo Code disagreements were settled on 2026-10-04 (E-AUG-S4,
E-KILO-L2). Kilo's page also names `.github/skills` and `.well-known/skills`, but only as examples
of the `skills.paths` and `skills.urls` settings, so neither is a default directory.

Kilo's skills page now says every loaded skill is also a slash command (`/name`, or `/name:skill`
when a command has the name). Settled on 2026-10-04: the CLI and the VS Code extension both do this
in source (E-KILO-S3, superseding E-KILO-S2), and `skillInvocation('kilo')` returns `/<skill>`.

A lead, not yet evidence: while finding the R8 pages, the Qwen Code, Crush, and OpenHands docs were
seen to name skills directories, where `skillsDirectories()` returns `undefined`. Their skills pages
are not watched until that is researched.

## Wave 2: no verified signal

These harnesses are not detected. Each row says why, and whether a live `env` capture from a
running session is still needed to settle it.

| Harness | Finding | Live capture needed? | Evidence |
| --- | --- | --- | --- |
| Goose | Source sets `GOOSE_TERMINAL=1` and `AGENT=goose` only on recipe check commands, contrary to its docs; the shell tool sets only the generic `AGENT_SESSION_ID` | No; re-read the source if the docs' claim is later implemented | E-GOOSE-D1–D5 |
| Antigravity | Closed source; the CLI changelog and docs name only variables the user sets (`AGY_CLI_*`, `AGY_ADC_AUTH`). It shares `~/.gemini` with Gemini CLI, and no evidence shows it sets `GEMINI_CLI` | Yes | E-AGY-D1–D5 |
| Rovo Dev CLI | Closed source; `acli rovodev` runs a separately downloaded agent binary, and no docs name a variable | Yes | E-ROVO-D1–D4 |
| Kiro | Closed source; documented `KIRO_*` variables are user settings, and `USER_PROMPT` is set only for one hook trigger | Yes | E-KIRO-D1–D5 |
| Amp | The npm wrapper passes the environment through, and the binary's strings show no marker; `TOOLBOX_ACTION` reaches toolbox executables only | Recommended, since `strings` can miss embedded code | E-AMP-D1–D5 |
| Factory Droid | `FACTORY_ENV` reaches worker `droid` processes only; the shell tool adds none. MCP servers and hooks were not traced | Yes | E-DROID-D1–D7 |
| Devin Desktop | Closed source; its terminal page names no variable. `DEVIN_PROJECT_DIR` belongs to Devin CLI hooks | Yes | E-DEVIN-D1–D6 |
| Warp (agent mode) | No variable separates an agent-run command from a typed one; `TERM_PROGRAM=WarpTerminal` marks the terminal | Yes | E-WARP-D1–D6 |
| Augment IDE extension | Its terminal environment is undocumented; only the Auggie CLI was read | Yes | E-AUG-D6 |

## Reported retirements

The survey behind #6 reported five products as gone. Checked against vendor sources:

| Product | Status | Evidence | Wave 1 or 2? |
| --- | --- | --- | --- |
| Roo Code | Shut down 2026-05-15; repository archived | E-RET-R1 | No |
| Continue | Acquired by Cursor; final release 2026-06-19 | E-RET-R2 | No |
| Aider | Not shut down. No release since 2025-08-09 and no commit since 2026-05-22 | E-RET-R3 | Candidate; re-check activity first |
| Amazon Q Developer CLI | Security fixes only; replaced by the closed-source Kiro CLI | E-RET-R4 | No; research Kiro CLI instead |
| Windsurf | Renamed Devin Desktop on 2026-06-02 | E-RET-R5 | Research as Devin Desktop |

## Open questions

- Whether an environment printed from a real Cursor IDE agent session matches its code (E-CUR-D11).
  Running `env | cut -d= -f1 | sort` from the IDE's agent chat would settle it.
- How Claude Code merges `enabledPlugins` across scopes, and how Copilot CLI ranks `.claude/`
  settings against `.github/copilot/` settings.
- Whether Cursor persists a per-plugin enabled state anywhere. Settled 2026-10-20: on Cursor's server, not on disk
  (`skill-resolution` E-SR-CUR-7).
- Whether two Codex plugins with the same skill name are disambiguated. Settled 2026-10-20: yes, plugin skills are
  `<plugin>:<skill>` (`skill-resolution` E-SR-CODEX-5, E-SR-CODEX-9).
- Which of OpenCode's two bash tools ships. The one read copies `process.env` explicitly; the newer
  core tool inherits it by default, so the variables arrive either way (E-OC-D3).
- Whether the Kilo Code VS Code and JetBrains extensions set `KILO=1` in their terminals. Only the
  Kilo CLI was read.
- Whether Cline's JetBrains client sets `CLINE_ACTIVE`. Its source is not in `cline/cline`.
- The macOS managed-preferences domain for VS Code policy. The docs name the profile format only.
- Where Copilot in VS Code, OpenCode, Kilo Code, and Cline record a plugin as disabled, if anywhere.
- Wave 2: a live `env` capture for each harness in "Wave 2: no verified signal" marked as needing
  one.
- How the Auggie CLI types a plugin's skill: `/<skill>` or `/<plugin>:<skill>` (E-AUG-S3).
- R9: Copilot CLI's `-p --output-format json` event schema and `--usage-output-file` fields, and
  Cursor's transcript location, need one real run each to record. Whether `cursor-agent -p` writes
  files without `--force` is contested between its help and its headless page (E-CUR-H1).
- Most wave-1 facts are source reads. A vendor docs page for the detection variables was found only
  for VS Code, and that page names the wrong variable (E-VSC-D6).
