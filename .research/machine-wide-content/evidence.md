# Machine-wide and managed agent content: evidence

All entries dated 2026-10-19. Source commits: openai/codex `c6e29b4`, google-gemini/gemini-cli `76e4d7c`,
QwenLM/qwen-code `5dcf7c7`, anomalyco/opencode `6bac3b9` (2.0.32), Kilo-Org/kilocode `35a7472`,
cline/cline `d800bf8`, charmbracelet/crush `208a48e`, OpenHands/software-agent-sdk `33d8aa2`,
OpenHands/OpenHands `8d39305`. Claude Code binary 2.1.303; Copilot CLI 1.0.92.

| ID | Claim | Source | Type | Status | Confidence |
| --- | --- | --- | --- | --- | --- |
| E-MW-CC-1 | Managed `CLAUDE.md` sits in the managed directory per OS and cannot be excluded with `claudeMdExcludes` | https://code.claude.com/docs/en/memory | Vendor doc | verified | High |
| E-MW-CC-2 | Enterprise skills live in `<managed dir>/.claude/skills/<name>/SKILL.md` (Linux example `/etc/claude-code/.claude/skills/`); enterprise beats personal beats project | https://code.claude.com/docs/en/skills | Vendor doc | verified | High (Linux); Medium (macOS, Windows by the same directory) |
| E-MW-CC-3 | Managed subagents live in `.claude/agents/` in the managed directory, priority 1 | https://code.claude.com/docs/en/sub-agents | Vendor doc | verified | High |
| E-MW-CC-4 | `managed-mcp.json` sits in the managed directory per OS | https://code.claude.com/docs/en/managed-settings | Vendor doc | verified | High |
| E-MW-CC-5 | `managed-mcp.json` takes exclusive control; entries without `${VAR}` skip the allowlist | Binary strings, `claude` 2.1.303 | Binary | verified | Medium |
| E-MW-CC-6 | Managed `enabledPlugins`, `extraKnownMarketplaces`, `strictKnownMarketplaces` come by server, MDM, or file and beat all scopes | https://code.claude.com/docs/en/plugins/org | Vendor doc | verified | High |
| E-MW-CC-7 | Plugin files install to `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`, or under `CLAUDE_CODE_PLUGIN_CACHE_DIR` | https://code.claude.com/docs/en/plugins/loading | Vendor doc | verified | High |
| E-MW-CC-8 | `CLAUDE_CODE_PLUGIN_SEED_DIR` is a read-only seed with the `~/.claude/plugins` layout; several paths split by `:` or `;`; never written; seed marketplaces have autoUpdate off; seeded plugins still need `enabledPlugins` | https://code.claude.com/docs/en/plugins/org#seed-containers-and-ci; binary 2.1.303 | Vendor doc + binary | verified | High |
| E-MW-CC-9 | Plugins an admin turns on in claude.ai arrive as `<name>@synced` in `~/.claude/plugins/synced/` (claude.ai sign-in only); org-required ones cannot be disabled | https://code.claude.com/docs/en/plugins/loading | Vendor doc | verified | High |
| E-MW-CC-10 | `strictPluginOnlyCustomization` blocks skills, agents, hooks, and MCP that come from neither a plugin nor managed config | https://code.claude.com/docs/en/plugins/org | Vendor doc | verified | High |
| E-MW-COPILOT-1 | Copilot CLI managed file paths; file must be root-owned and not a symlink; MDM > server > file, highest channel alone | https://github.blog/changelog/2026-07-08-deploy-managed-copilot-settings-via-mdm-in-vs-code-and-cli | Vendor changelog | verified | High |
| E-MW-COPILOT-2 | Copilot CLI documents only repo and `~/.copilot` locations for instructions, skills, agents, MCP | https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference | Vendor doc | verified | Medium (absence) |
| E-MW-COPILOT-3 | CLI plugin files install to `~/.copilot/installed-plugins/` | Same doc; `ls ~/.copilot` on this machine | Vendor doc + experiment | verified | High |
| E-MW-COPILOT-4 | Managed keys cover plugins and marketplaces; `enabledPlugins: false` forces off | https://docs.github.com/copilot/reference/enterprise-managed-settings-reference | Vendor doc | verified | High |
| E-MW-COPILOT-5 | Enterprise plugins are defined in `.github-private/.github/copilot/settings.json` and installed at sign-in | https://github.blog/changelog/2026-05-06-enterprise-managed-plugins-in-github-copilot-cli-are-now-in-public-preview/ | Vendor changelog | verified | Medium |
| E-MW-COPILOT-6 | Org custom agents live in `/agents` of the org's `.github-private` or `.github` repo | https://docs.github.com/en/copilot/how-tos/administer-copilot/manage-for-organization/prepare-for-custom-agents | Vendor doc | verified | High |
| E-MW-VSC-1 | VS Code policy locations and the plugin and marketplace policies | https://code.visualstudio.com/docs/enterprise/policies | Vendor doc | verified | High |
| E-MW-VSC-2 | Centrally managed marketplaces cannot be removed by users | https://code.visualstudio.com/docs/copilot/customization/agent-plugins | Vendor doc | verified | High |
| E-MW-VSC-3 | Skills and instructions load from repo, home, and profile only; no system path | https://code.visualstudio.com/docs/copilot/customization/agent-skills | Vendor doc | verified | High (absence) |
| E-MW-VSC-4 | Org instructions and org agents are fetched from GitHub behind settings | https://code.visualstudio.com/docs/copilot/customization/custom-instructions | Vendor doc | verified | High |
| E-MW-CODEX-1 | The `System` config layer adds `<config folder>/skills` as an `Admin` skill root | `codex-rs/ext/skills/src/host_roots.rs` (`ConfigLayerSource::System` arm); `codex-rs/config/src/state.rs:223` | Source | verified (re-read by lead) | High (Unix); Medium (Windows path inferred) |
| E-MW-CODEX-2 | Docs: ADMIN skills at `/etc/codex/skills`, "default admin skills available to each user on the machine" | https://learn.chatgpt.com/docs/build-skills | Vendor doc | verified | High |
| E-MW-CODEX-3 | SYSTEM (bundled) skills cache to `$CODEX_HOME/skills/.system`, per user | `codex-rs/skills/src/lib.rs:66` | Source | verified | High |
| E-MW-CODEX-4 | AGENTS.md is read from `$CODEX_HOME` and the project tree only | https://learn.chatgpt.com/docs/agent-configuration/agents-md | Vendor doc | verified | High |
| E-MW-CODEX-5 | Same-name skills are not merged; the prompt orders System, Admin, Repo, User | `codex-rs/ext/skills/src/render.rs:54` | Source | verified | Medium |
| E-MW-CODEX-6 | Plugin cache is `plugins/cache` under `codex_home` | `codex-rs/core-plugin-common/src/installed.rs:11` | Source | verified | High |
| E-MW-CODEX-7 | `requirements.toml` restricts plugins, marketplaces, MCP, and hooks; it does not deliver skills or AGENTS.md | https://learn.chatgpt.com/docs/enterprise/managed-configuration | Vendor doc + source | verified | High |
| E-MW-CUR-1 | Enterprise hooks file per OS; Enterprise > Team > Project > User | https://cursor.com/docs/hooks | Vendor doc | verified | High |
| E-MW-CUR-2 | Team Rules come from the dashboard, can be enforced, and are not stored in `.cursor/rules` | https://cursor.com/docs/rules | Vendor doc | verified | High |
| E-MW-CUR-3 | Skills load from project and user folders only | https://cursor.com/docs/skills | Vendor doc | verified | High |
| E-MW-CUR-4 | Team marketplaces; Required plugins install automatically and cannot be uninstalled; install path not documented | https://cursor.com/docs/plugins | Vendor doc | verified | High (behaviour); Low (location) |
| E-MW-GEM-1 | System policies folder is `<system config dir>/policies` | `packages/core/src/config/storage.ts:174-192` | Source + doc | verified | High |
| E-MW-GEM-2 | `SkillManager` loads built-in, extension, user, and workspace skills only | `packages/core/src/skills/skillManager.ts:55-105` | Source | verified | High |
| E-MW-GEM-4 | Admin console injects required remote MCP servers that override same-name local ones | `docs/admin/enterprise-controls.md:108-170` | Vendor doc | verified | High |
| E-MW-GEM-5 | Admin console can disable extensions | `docs/admin/enterprise-controls.md` | Vendor doc | verified | High |
| E-MW-QWEN-2 | `SkillLevel` is `project`, `user`, `extension`, `bundled` | `packages/core/src/skills/types.ts:16` | Source | verified | High |
| E-MW-QWEN-3 | Extensions live under `~/.qwen/extensions` | `packages/core/src/extension/extensionManager.ts:1457` | Source | verified | Medium |
| E-MW-OC-1 | System folder per OS from `systemDirectory()` | `packages/core/src/config/discovery.ts:27-32` | Source | verified (re-read by lead) | High |
| E-MW-OC-2 | The skill loader globs `skill` and `skills` under every config directory entry | `packages/core/src/config/plugin/skill.ts:86-90` | Source | verified (re-read by lead) | High |
| E-MW-OC-3 | The same directory entries drive agent, command, and plugin discovery | `config/plugin/agent.ts:136`, `command.ts:142-150`, `plugin/source-directory.ts` | Source | verified | High |
| E-MW-OC-4 | A test asserts the system folder is a directory entry with the highest priority | `packages/core/test/config/config.test.ts:291-330` | Source | verified | High |
| E-MW-OC-5 | npm plugins cache to `~/.cache/opencode/node_modules/` | `packages/web/src/content/docs/plugins.mdx:48` | Vendor doc | verified | High |
| E-MW-OC-7 | No machine-wide AGENTS.md | `config/plugin/instruction.ts:41,79` | Source | verified | Medium (absence) |
| E-MW-KILO-1 | Kilo's managed folder loads config files only | `packages/opencode/src/config/config.ts:974-983` | Source | verified | High |
| E-MW-KILO-3 | Org `/api/config` merges as global, in memory | `config.ts:935-968` | Source | verified | High |
| E-MW-CLINE-1 | Org rules, workflows, skills are written to `<workspace>/.cline/<remote-config or enterprise>/` | `sdk/packages/shared/src/remote-config/paths.ts`, `materializer.ts`; `apps/cli/src/utils/enterprise.ts:156` | Source | verified | High |
| E-MW-CLINE-3 | Org skills are supported in the extensions only; docs tell admins to gitignore the folder | `docs/enterprise-solutions/configuration/remote-configuration/overview.mdx` | Vendor doc | verified | High |
| E-MW-CRUSH-2 | Global skill folders are user folders only | `internal/config/load.go:1309-1340` | Source | verified | High |
| E-MW-OH-2 | Org skills are fetched from `{org}/.openhands` or `{org}/openhands-config` into a temp folder; sandbox < public < user < org < project | `openhands-agent-server/.../skills_service.py:6-14` | Source | verified | High |
| E-MW-AUG-2 | Skill folders are user and workspace only | https://docs.augmentcode.com/cli/skills | Vendor doc | verified | High |
| E-MW-OTHER-1 | Amp reads a system-wide AGENTS.md from `/etc/ampcode/`, `/Library/Application Support/ampcode/`, `%ProgramData%\ampcode\` | https://ampcode.com/docs/customize/agents-md | Vendor doc | verified | High |
| E-MW-OTHER-3 | Windsurf/Devin reads system rules from `/etc/devin/rules/`, `/Library/Application Support/Devin/rules/`, `C:\ProgramData\Devin\rules\` | https://docs.devin.ai/desktop/cascade/memories | Vendor doc | verified | High |
| E-MW-BI-1 | Built-in skills are kept apart from admin skills: Codex SYSTEM scope caches to `$CODEX_HOME/skills/.system` under the User layer; Qwen `SkillLevel` has a separate `bundled` level; Gemini `SkillManager` loads built-in skills separately from user and workspace | E-MW-CODEX-3, E-MW-QWEN-2, E-MW-GEM-2 | Source | verified | High |
| E-MW-BI-2 | `/etc/claude-code/` does not exist on this personal machine; the managed folders are admin-placed | `ls /etc/claude-code`, this machine (also `harness-detection` E-CC-M5); Codex docs "default admin skills available to each user on the machine" (E-MW-CODEX-2) | Experiment + vendor doc | verified | High |
| E-MW-BI-3 | `uni-agent-kit` already reads a `references/` folder inside each detected harness's managed folder as the `managed` reference tier | `packages/agent-kit/src/references/harness-layers.ts` (`harnessManagedLayers`), `reference-layers.ts` (`ReferenceTier`) | Source (this repo) | verified | High |
