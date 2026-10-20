# Machine-wide and managed agent content: conclusion

## Last updated

October 2026

## Question

Does any agent harness keep plugins or skills machine-wide (in `/etc/` or its OS equivalent, read for
every user on the machine) instead of per user? Where a harness supports a managed (team or company)
tier, where does that tier's content live?

The managed *policy settings* files are covered in `harness-detection` R3. This topic covers
*content*: skills, plugins, instruction files, agents, commands, and MCP servers.

## Verdict

**Three harnesses read skills from a machine-wide folder: Claude Code, Codex, and OpenCode.** Amp and
Windsurf/Devin read machine-wide instruction or rule files, but not skills.

**No harness installs plugin files machine-wide.** Every harness with plugins keeps the plugin files
in a per-user folder, even when a managed setting forces the plugin on. The managed tier controls
plugins through policy: which marketplaces are allowed and which plugins are enabled. The one
exception is Claude Code's `CLAUDE_CODE_PLUGIN_SEED_DIR`, a read-only plugin folder an admin can
fill, but it has no OS default path and is aimed at container and CI images.

**Most managed content comes from a server, not from a file.** GitHub Copilot, Cursor, Cline,
OpenHands, Kilo Code, and Gemini CLI deliver team content from an admin console or an org
repository. Where it lands differs: a per-user folder (Claude Code synced plugins), the workspace
(Cline), a temporary folder (OpenHands), or nowhere on disk (Cursor Team Rules, Kilo org config).

**The machine-wide folders hold admin content, not the harness's built-in skills.** A company's IT
admin fills them, usually through MDM; the harness never writes there, and on a personal machine they
are missing or empty (E-MW-BI-2). Built-in skills live elsewhere: inside the Claude Code binary, in
`~/.codex/skills/.system` for Codex's SYSTEM scope, and in the install for Gemini CLI and Qwen Code
(E-MW-BI-1). For `cyber-agentkit`, these folders matter for references and skill listing, not for
plugin checks (see "What this means for cyber-agentkit").

## Reference

### Machine-wide content folders

| Harness | Content in the machine-wide folder | Linux | macOS | Windows |
| --- | --- | --- | --- | --- |
| Claude Code | `CLAUDE.md`, `.claude/skills/`, `.claude/agents/`, `managed-mcp.json` | `/etc/claude-code/` | `/Library/Application Support/ClaudeCode/` | `C:\Program Files\ClaudeCode\` |
| Codex | `skills/` (ADMIN scope) | `/etc/codex/skills` | `/etc/codex/skills` | `%ProgramData%\OpenAI\Codex\skills` (inferred) |
| OpenCode (2.x) | `skill(s)/`, `agent(s)/`, `command(s)/`, `plugin(s)/`, plus MCP in `opencode.json` | `/etc/opencode/` | `/Library/Application Support/opencode/` | `%ProgramData%\opencode\` |
| Amp | `AGENTS.md` | `/etc/ampcode/` | `/Library/Application Support/ampcode/` | `%ProgramData%\ampcode\` |
| Windsurf / Devin | `rules/*.md` | `/etc/devin/` | `/Library/Application Support/Devin/` | `C:\ProgramData\Devin\` |
| Gemini CLI | Policy rules only (`policies/`), not content | `/etc/gemini-cli/` | `/Library/Application Support/GeminiCli/` | `C:\ProgramData\gemini-cli\` |

No machine-wide content folder exists in: Copilot CLI, Copilot in VS Code, Cursor (hooks only),
Qwen Code, Kilo Code, Crush, Cline, OpenHands, or Auggie. Kilo Code, Crush, and Auggie read only a
settings file from their system path. A settings file there can still point at a shared folder:
Kilo `skills.paths`, Crush `skills_paths`, Gemini `includeDirectories`. That is the admin's own
choice, not a built-in location.

### Where managed plugin files are installed

| Harness | Plugin files | Managed control |
| --- | --- | --- |
| Claude Code | `~/.claude/plugins/cache/` (or `CLAUDE_CODE_PLUGIN_CACHE_DIR`); admin-synced plugins in `~/.claude/plugins/synced/`; optional read-only `CLAUDE_CODE_PLUGIN_SEED_DIR` | `enabledPlugins`, `extraKnownMarketplaces`, `strictKnownMarketplaces` in managed settings; users cannot disable a managed or org-required plugin |
| Copilot CLI | `~/.copilot/installed-plugins/` | Same keys in managed settings; enterprise plugins defined in `.github-private/.github/copilot/settings.json` |
| Copilot in VS Code | Not documented | `chat.plugins.enabledPlugins`, `ChatExtraMarketplaces`, `chat.plugins.strictMarketplaces` policies |
| Codex | `$CODEX_HOME/plugins/cache` | `requirements.toml` restricts marketplaces and plugins |
| Cursor | Not documented | Team marketplaces; "Required" plugins install automatically and cannot be uninstalled |
| Gemini CLI | `~/.gemini/extensions/` | Admin console can turn extensions off entirely |
| OpenCode | npm plugins in `~/.cache/opencode/node_modules/`; local plugins load in place, including from the managed folder | Managed `opencode.json` |

### Server-delivered managed content

| Harness | Source | What it delivers | Lands at |
| --- | --- | --- | --- |
| Claude Code | claude.ai admin console | Settings, plugins (`<name>@synced`) | `~/.claude/plugins/synced/` |
| Copilot CLI and VS Code | GitHub org/enterprise (`.github-private`, `.github`) | Settings, plugins, custom agents, org instructions (VS Code) | Not documented |
| Cursor | Dashboard | Team Rules, team hooks, team marketplace plugins and skills | Not documented; Team Rules are not in `.cursor/rules` |
| Cline | Enterprise admin console | Rules, workflows, skills (extensions only), MCP | `<workspace>/.cline/remote-config/` (extensions), `<workspace>/.cline/enterprise/` (CLI) |
| OpenHands | Org git repo `{org}/.openhands` | Skills | Temporary folder on the agent server |
| Kilo Code | Org `/api/config` | Config, org modes | In memory |
| Gemini CLI | Management Console | Required remote MCP servers | In memory |

### Precedence of machine-wide content

- Claude Code: enterprise skills beat personal and project skills; managed agents rank first;
  managed `CLAUDE.md` cannot be excluded.
- Codex: same-name skills are not merged; the prompt orders System, Admin, Repo, User.
- OpenCode: the managed folder is the highest-ranked config root.

### Built-in skills against machine-wide admin skills

| Harness | Built-in skills | Machine-wide admin skills |
| --- | --- | --- |
| Claude Code | Inside the binary | `<managed dir>/.claude/skills/` ("enterprise") |
| Codex | SYSTEM scope, cached per user in `$CODEX_HOME/skills/.system` | ADMIN scope, `/etc/codex/skills` |
| Gemini CLI | Built-in, shipped with the install | None |
| Qwen Code | `bundled` level, shipped with the install | None |
| OpenCode 2.x | Not researched | `<managed dir>/skill(s)/` |

### What this means for cyber-agentkit

| Area | Read the machine-wide folders? | Why |
| --- | --- | --- |
| A. Reference resolution | Yes, and it already does | `harness-layers.ts` reads `references/` inside each harness's managed folder (E-MW-BI-3). The harnesses' own admin content sits there too, which supports that design. |
| B. Listing a harness's skills (not built yet) | Yes | Claude Code ranks enterprise skills above personal and project skills, so a list without the managed folder is wrong on a managed machine. Plugin skills are namespaced and do not collide. |
| C. Installed, enabled, and dependency checks for plugins | No | No harness installs plugin files there. The one extra folder is Claude Code's `CLAUDE_CODE_PLUGIN_SEED_DIR`, set by an environment variable. |
| D. Writing | Never | The folders are root-owned and belong to the admin. |

## Confidence

High for Claude Code, Codex (Linux and macOS), and OpenCode 2.x: vendor docs plus source or binary.
High for the "plugin files are per user" finding across the harnesses that document an install path.
Medium for each "none found" row: absence is read from docs and a source grep.

## Strongest supporting evidence

- Claude Code docs name `/etc/claude-code/.claude/skills/` and the managed agents folder (E-MW-CC-2, E-MW-CC-3).
- Codex source adds `<system config folder>/skills` as an `Admin` skill root, and its docs say "default
  admin skills available to each user on the machine" (E-MW-CODEX-1, E-MW-CODEX-2).
- OpenCode source globs `skill`/`skills` under every config directory entry, and a test asserts the
  system folder is one (E-MW-OC-2, E-MW-OC-4).

## Strongest weakening evidence

- OpenCode's finding comes from the 2.x source on `main`. Whether 1.x also scanned the managed folder
  for skills was not checked.
- Codex's Windows path is inferred from the config-folder logic, not run.

## Not supported

- That any harness writes plugin files to a machine-wide folder by default.
- That Copilot CLI or VS Code read any machine-wide content folder.
- That Cursor stores Team Rules or team plugins in a known folder.

## Where evidence is thin

- Whether Claude Code reads `commands/` or `rules/` from its managed folder.
- Where Cursor and Copilot in VS Code put managed plugin files on disk.
- Where Cline puts org MCP servers, and how org rules rank against local rules.
- Goose and Roo Code were not checked.

## Check again later

- OpenCode 1.x against 2.x behaviour for the managed folder.
- Codex on Windows: does `%ProgramData%\OpenAI\Codex\skills` load?
- Copilot CLI: whether a machine-wide content folder appears.
- Cursor: an experiment to find where required plugins land.
