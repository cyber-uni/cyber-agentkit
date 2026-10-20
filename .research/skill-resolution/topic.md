# How harnesses resolve skills and plugins (October 2026)

## Question

For Claude Code, Cursor, Codex, GitHub Copilot CLI, OpenCode, and Gemini CLI: where a plugin's skills sit inside its
installed folder, how an installed plugin maps to its folder, which copy of a skill runs when several folders hold one
name, and whether the harness tells a running skill its own folder. Also: is a plugin-root `references/` folder part of
the Agent Plugins spec or a convention of ours? Tracked in issue #114; it answers the reference spec's Q12.

## Scope

In scope: plugin (or extension) skill folders, install records and in-place plugins, same-name precedence, and what a
loaded skill is told, for the six harnesses the library detects; the Agent Plugins and Agent Skills specifications on
`references/`.

Out of scope: building the `default` tier or default discovery (#113); where package managers install skills
(`package-manager-skills`); machine-wide admin skill folders (`machine-wide-content`); the other harnesses in
`harness-detection`.

## Method

One investigation per harness, run in parallel, each starting from `harness-detection` R2, R4, R6, and R7. Each used
vendor docs, source at a pinned commit where the harness is open source, and the locally installed CLI. Every
experiment pointed the harness at a throwaway home and project, so no real configuration changed. Claude Code ran from
the real home with `--plugin-dir`, which writes only session logs. Copilot CLI and Cursor experiments needed a model
call; they used the existing login (a token in the environment for Copilot CLI; a copy of Cursor's login file in the
throwaway home, deleted afterward).

Commands that answer without a model call, useful for re-checking:

- Codex: `codex debug prompt-input <text>` prints the skill list and roots table.
- OpenCode: `opencode debug skill` prints every loaded skill with its location; `opencode debug config` shows the
  resolved `skills` key.
- Gemini CLI: `gemini skills list` and `gemini extensions list`.
- Claude Code: `claude -p --output-format stream-json --verbose` lists the session's skills in its init message.
- Copilot CLI: the session's `events.jsonl` holds the skill list (`system.message`) and `skill.invoked` events.

## Findings

### Claude Code

Plugin skills default to `skills/<name>/SKILL.md`, and the manifest `skills` key adds roots instead of replacing them.
`installed_plugins.json` maps `<plugin>@<marketplace>` to `installPath`; enabled state is `enabledPlugins`. Several
kinds of plugin load in place with no record (`@inline`, `@skills-dir`, `@synced`). Non-plugin skills rank enterprise,
personal, project; plugin skills are always namespaced. A loaded skill gets `Base directory for this skill:` and can use
`${CLAUDE_SKILL_DIR}`. The probe confirmed Claude Code does not read `.agents/skills`. One surprise: a plugin skill whose
`name` differs from its folder was listed under the folder name, with the `name` accepted as an alias. See E-SR-CC-1 to
-14.

### Cursor

Plugin skills sit one level under `skills/`, and a manifest `skills` field replaces that folder. Local plugins under
`~/.cursor/plugins/local/` are always on; marketplace plugins' install and enabled state lives on Cursor's server, with
cached copies under `~/.cursor/plugins/cache/`. Cursor also loads Claude Code's installed and enabled plugins. Skill
folders are read in the order `.cursor`, `.claude`, `.codex`, `.grok`, `.agents`; `.grok` is not in the docs. Within a
tier the first folder wins, but user and project copies, and plugin copies, are all shown to the model, which gets an
absolute `SKILL.md` path and no base-directory line. See E-SR-CUR-1 to -16.

### Codex

Plugin skills default to `skills/`; the manifest field replaces it. Scan depth depends on the manifest format: six levels
for the legacy `.codex-plugin/` style, one for an Agent Plugins `plugin.json`. A cached plugin loads only with
`enabled = true` in config. Codex never merges skills by name: every copy is listed, plugin copies are namespaced
`<plugin>:<skill>`, and a bare `$name` mention of a duplicated name selects nothing. The skill list gives each skill's
`SKILL.md` path through a roots table. See E-SR-CODEX-1 to -17.

### GitHub Copilot CLI

The manifest `skills` field replaces `skills/`, and skills nest to any depth, contrary to the docs. The first skill
found with a name wins, in the documented order; built-ins rank last. Plugin skills are namespaced only when two
plugins collide. `~/.agents/skills` is read only when the config folder is the default. A loaded skill gets
`Base directory for this skill:` and a list of the folder's other files. See E-SR-COPILOT-1 to -12.

### OpenCode

Plugins are code modules with no manifest and no way to declare skills; only the `skills.paths` config key adds a
folder, and a plugin's config hook can push one at run time. Duplicate names have no rule: loads race and the last write
wins, so the winner changed between identical runs. The `skill` tool returns `Base directory for this skill:`. The docs
say names must match folders and be unique; the code enforces neither. See E-SR-OC-1 to -13.

### Gemini CLI

Extension skills sit one level under the extension's `skills/`, with no manifest field. Extensions live under
`~/.gemini/extensions/`; a linked one keeps only its install record there and runs from its source folder. The last
source loaded wins a name, in the order built-in, extensions, user, workspace, with `.agents/skills` above the
`.gemini/skills` of the same tier. Extension skills are not namespaced. The prompt gives each skill's `SKILL.md` path,
and `activate_skill` returns the folder and its tree. See E-SR-GEM-1 to -16.

### Agent Plugins and Agent Skills

The Agent Plugins spec defines two component types at fixed paths, `skills/` and `mcp.json`, with a closed manifest
schema; clients must ignore what they do not know. Its only `references/` is inside a skill, deferred to the Agent
Skills spec, which lists `references/` as an optional skill folder. A plugin-root `references/` is therefore ours. See
E-SR-AP-1 to -4, E-SR-AS-1, -2, E-SR-HX-1, E-SR-UK-1.

## Contradictions

- Copilot CLI docs versus behavior on skill depth (E-SR-COPILOT-3); behavior followed.
- OpenCode docs versus code on name uniqueness and name-folder match (E-SR-OC-11); code followed.
- With `harness-detection`: Codex and Copilot CLI plugin skills can be namespaced (R4), Cursor reads `.grok/skills`
  and Copilot CLI's `~/.agents/skills` is conditional (R6), E-COPILOT-S2 (depth), E-OC-S2 (uniqueness). Listed in the
  conclusion.

## Open questions

See "Where evidence is thin" in the conclusion. The ones that would change what the library does:

- Whether a Cursor cached plugin copy can be tied to its enabled state without the server.
- Claude Code project-scope plugin records (`projectPath`), seen in docs and prior evidence but not on this machine.
- The live text OpenCode and Gemini CLI give a loaded skill, from source only.

## Sources consulted

- https://code.claude.com/docs/en/skills , https://code.claude.com/docs/en/plugins-reference ,
  https://code.claude.com/docs/en/plugins/loading
- https://cursor.com/docs/skills , https://cursor.com/docs/plugins ; the cursor-agent 2026.09.28-64d2043 bundle
- https://learn.chatgpt.com/docs/build-skills , https://developers.openai.com/codex/plugins/build ;
  https://github.com/openai/codex at `01fc69f` (`rust-v0.159.3`)
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference ; the Copilot CLI 1.0.92
  bundle
- https://opencode.ai/docs/skills , https://opencode.ai/docs/plugins/ ; https://github.com/anomalyco/opencode at
  `aec0b9a` (`v1.18.34`)
- https://geminicli.com/docs/cli/skills/ , https://geminicli.com/docs/extensions/reference/ ;
  https://github.com/google-gemini/gemini-cli at `b460678` (`v0.62.0`)
- https://github.com/agentplugins/agent-plugins-spec at `ff8ab5e` ; https://github.com/agentskills/agentskills at
  `69ef37e`
