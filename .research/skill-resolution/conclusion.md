# Conclusion — How harnesses resolve skills and plugins (October 2026)

## Last updated

2026-10-20. Versions checked: Claude Code 2.1.304, cursor-agent 2026.09.28-64d2043, codex-cli 0.159.3 (source
`01fc69f`), GitHub Copilot CLI 1.0.92, OpenCode 1.18.34 (source `aec0b9a`), Gemini CLI 0.62.0 (source `b460678`);
Agent Plugins spec at `ff8ab5e` and Agent Skills spec at `69ef37e`.

## Question

For each harness the library detects (Claude Code, Cursor, Codex, GitHub Copilot CLI, OpenCode, Gemini CLI): where do a
plugin's skills sit inside its installed folder, how does an installed plugin map to that folder, which copy of a skill
runs when several folders hold one name, and does the harness tell a running skill its own folder? And is a plugin-root
`references/` folder part of the Agent Plugins spec or a convention of ours?

The answer lets the reference library find a skill's defaults (`<skill>/references/<name>.default.md`) and each
plugin's `references/` folder without guessing. It answers the reference spec's Q12 (issue #114). Project and user
skill folders are in `harness-detection` R6, machine-wide admin skill folders in `machine-wide-content`, and folders
package managers write in `package-manager-skills`.

## Verdict

1. **Every one of the six tells a loaded skill where it lives.** Claude Code, Copilot CLI, and OpenCode say
   `Base directory for this skill: <folder>` when the skill loads; Cursor, Codex, and Gemini CLI give the model the
   absolute `SKILL.md` path in the skill list (E-SR-CC-9, E-SR-COPILOT-10, E-SR-OC-7, E-SR-CUR-14, E-SR-CODEX-13,
   E-SR-GEM-14). No harness puts the folder in an environment variable. Only Claude Code substitutes it into skill text
   (`${CLAUDE_SKILL_DIR}`, E-SR-CC-10); Gemini CLI substitutes `${extensionPath}` in extension skills (E-SR-GEM-15). So a
   skill can pass its own folder to `reference --default <skill folder>` on all six, but it must pass it explicitly.
2. **A plugin's skills sit in `skills/` under the plugin root on every harness that has plugin skills.** The manifest
   `skills` field adds to that folder in Claude Code (E-SR-CC-1) and replaces it in Cursor, Codex, and Copilot CLI
   (E-SR-CUR-2, E-SR-CODEX-2, E-SR-COPILOT-2). Gemini CLI has no such field (E-SR-GEM-1). How deep the scan goes differs
   (table A). OpenCode plugins cannot ship skills: its plugins are code modules with no manifest, and only the
   `skills.paths` config key adds a skill folder (E-SR-OC-1, E-SR-OC-3).
3. **An installed plugin maps to its folder through a record on four of the six.** Claude Code
   (`installed_plugins.json`), Copilot CLI (`config.json`), and Gemini CLI (`.gemini-extension-install.json`) keep one.
   Codex keeps none and scans its cache (E-SR-CODEX-6). Cursor keeps its install and enabled state on its server; only
   the cached copies are on disk (E-SR-CUR-7, E-SR-CUR-8). Claude Code, Cursor, Copilot CLI, and Gemini CLI can also
   load a plugin in place from a local folder, outside any record or cache; Codex copies a local plugin into its cache
   (table B).
4. **"Which copy runs" has no common answer.** The rules differ:
   - Claude Code: enterprise beats personal beats project, and plugin skills are always namespaced.
   - Copilot CLI: the first one found wins.
   - Gemini CLI: the last one loaded wins.
   - Cursor: one per folder group within a tier, but user and project copies are both listed.
   - Codex: never merges; the model sees every copy, and a bare mention of a duplicated name selects nothing.
   - OpenCode: the winner changes from run to run (E-SR-OC-6).

   Plugin skills are namespaced in Claude Code and Codex, in Copilot CLI only when two plugins collide, and not in
   Cursor, OpenCode, or Gemini CLI (table C).
5. **A skill's identity is its `SKILL.md` `name` in Codex, Copilot CLI, OpenCode, and Gemini CLI.** In Claude Code the
   name defaults to the folder name, and a plugin skill was listed under its folder name with its `name` accepted as an
   alias (E-SR-CC-2, E-SR-CC-3). Cursor's docs require the two to match, and the list it gives the model carries only
   the path (E-SR-CUR-4, E-SR-CUR-15). Where name and folder agree, the difference does not show.
6. **Symlinked skill folders are followed** by all six (E-SR-CC-12, E-SR-CUR-11, E-SR-CODEX-12, E-SR-COPILOT-11,
   E-SR-OC-9, E-SR-GEM-4).
7. **A plugin-root `references/` folder is a convention of ours, not of the Agent Plugins spec.** The spec defines only
   `skills/` and `mcp.json`, its manifest schema is closed, and clients must ignore what they do not know (E-SR-AP-1 to
   -4). The Agent Skills spec does define a skill's own `references/` folder, as an optional convention (E-SR-AS-1,
   -2). No harness reads a plugin-root `references/` folder itself (E-SR-HX-1, E-SR-CODEX-17).

## Reference

### A. Where a plugin's skills sit

| Harness | Default | Manifest `skills` field | Depth | Identity | Evidence |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `skills/<name>/SKILL.md`; a root `SKILL.md` alone is one skill | Adds paths (`./`-relative, inside the plugin) | One level per root | Folder name in the listing, `name` as alias; namespaced `<plugin>:<skill>` | E-SR-CC-1–3 |
| Cursor | `skills/<folder>/SKILL.md`; a root `SKILL.md` when the field is absent | Replaces the default | One level | `name` normalized; the model sees the path only | E-SR-CUR-1–4 |
| Codex | `skills/` | Replaces the default | Six levels for a legacy manifest; one for an Agent Plugins `plugin.json` | `name`, else folder; namespaced `<manifest name>:<name>` | E-SR-CODEX-2–5 |
| Copilot CLI | `skills/` | Replaces the default | Any depth (docs say one level) | `name` | E-SR-COPILOT-1–3 |
| OpenCode | None: plugins ship no skills | — (config `skills.paths` adds folders) | Any depth under `skills.paths` | `name` | E-SR-OC-1–5, E-SR-OC-10 |
| Gemini CLI | `skills/` in the extension | No field | One level (`SKILL.md`, `*/SKILL.md`) | `name` | E-SR-GEM-1–3 |

Manifest lookup: Cursor reads `.cursor-plugin/plugin.json`, then `.claude-plugin/plugin.json`, then `plugin.json`
(E-SR-CUR-3). Codex reads a root `plugin.json` with an Agent Plugins schema, then `.codex-plugin/`, `.claude-plugin/`,
then `.cursor-plugin/plugin.json` (E-SR-CODEX-4).

### B. How an installed plugin maps to its folder

| Harness | Record and folder | Enabled state | Loaded in place | Evidence |
| --- | --- | --- | --- | --- |
| Claude Code | `plugins/installed_plugins.json`: `<plugin>@<marketplace>` → `[{scope, installPath, version, projectPath?}]`; folder is `installPath` | `enabledPlugins`, merged by key, managed final | `--plugin-dir`, `CLAUDE_CODE_PLUGIN_DIRS`, SDK (`@inline`); plugin folders in a skills folder (`@skills-dir`); local-path marketplaces; synced (`@synced`, `plugins/synced/`) | E-SR-CC-6–8 |
| Cursor | No local record; server state (`GetEffectiveUserPlugins`); cached at `~/.cursor/plugins/cache/<marketplace>/<plugin>/<version>/` with `.cache-complete` | Server-side | `~/.cursor/plugins/local/<folder>/` (always on); `--plugin-dir`; Claude Code's installed plugins, read from its `installed_plugins.json` and `enabledPlugins` | E-SR-CUR-5–9 |
| Codex | None; `plugins/cache/<marketplace>/<plugin>/<version>/`, `local` or the highest version | `[plugins."<plugin>@<marketplace>"] enabled = true` required | None found; local sources are copied on install | E-SR-CODEX-6, -16; `harness-detection` E-CODEX-P8 |
| Copilot CLI | `config.json` `installedPlugins[].cache_path` | `enabledPlugins`; a disabled plugin loads nothing | Plugins of a local-path marketplace (`source: "live"`) | E-SR-COPILOT-4, -5; `harness-detection` E-COPILOT-P10–12 |
| OpenCode | — (plugins carry no skills) | — | — | E-SR-OC-3 |
| Gemini CLI | `~/.gemini/extensions/<name>/` with `.gemini-extension-install.json` `{source, type}` | `extension-enablement.json` path-glob overrides; default on | `type: "link"`: runs from `source` | E-SR-GEM-5–7 |

### C. Which copy runs

| Harness | Rule | Plugin skills namespaced? | Evidence |
| --- | --- | --- | --- |
| Claude Code | Enterprise > personal > project; reads `.claude/skills` only, never `.agents/skills` | Always | E-SR-CC-4, -11 |
| Cursor | Within a tier, first of `.cursor`, `.claude`, `.codex`, `.grok`, `.agents`; user and project copies both listed; plugin copies listed too | No | E-SR-CUR-10, -12, -13 |
| Codex | No merge by name; every copy is listed; a bare `$name` that is not unique selects nothing | Always | E-SR-CODEX-8, -9 |
| Copilot CLI | First found: project `.github`, `.agents`, `.claude`; parents; `~/.copilot/skills`; `~/.agents/skills`; plugins; custom; built-ins last | Only when two plugins collide; a project or user skill drops both | E-SR-COPILOT-6–8 |
| OpenCode | No rule; last write wins under unbounded concurrency, so the winner varies | No | E-SR-OC-6 |
| Gemini CLI | Last loaded wins: built-in, extensions, `~/.gemini/skills`, `~/.agents/skills`, `.gemini/skills`, `.agents/skills` | No; extension order is `readdir` order | E-SR-GEM-8–11 |

### D. How a running skill learns its folder

| Harness | What the model gets | Variable | Evidence |
| --- | --- | --- | --- |
| Claude Code | `Base directory for this skill: <folder>` on load | `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PLUGIN_ROOT}` (plugin skills) | E-SR-CC-9, -10 |
| Cursor | Absolute `SKILL.md` path in `<agent_skills>` | None | E-SR-CUR-14 |
| Codex | `(file: <alias>/<folder>/SKILL.md)` plus a root table; `<path>` on an explicit mention | None | E-SR-CODEX-13–15 |
| Copilot CLI | `Base directory for this skill: <folder>` and the folder's other files, on load | None | E-SR-COPILOT-10 |
| OpenCode | `Base directory for this skill: <folder>` and a sampled file list, from the `skill` tool | None | E-SR-OC-7, -8 |
| Gemini CLI | `<location>` (`SKILL.md` path) in the prompt; the folder and its tree from `activate_skill` | `${extensionPath}` in extension skills | E-SR-GEM-13–15 |

## What this means for `uni-agent-kit`

- **The `default` tier (R41) is unblocked on all six harnesses.** Each tells a loaded skill its folder (or its
  `SKILL.md` path, whose folder is the skill's), so the `reference` skill can pass `--default <skill folder>`. The
  skill's procedure must say to take the folder from what the harness gave it; no harness supplies it to a script on
  its own, except Claude Code through `${CLAUDE_SKILL_DIR}`.
- **Default discovery for `list` and `search` (R58) can enumerate plugin skills on Claude Code, Codex, Copilot CLI, and
  Gemini CLI** from the records and rules in tables A and B. Read each enabled plugin's `skills` field with that
  harness's rule (adds in Claude Code, replaces elsewhere) and its scan depth.
- **Cursor is partial.** Local plugins, `--plugin-dir` plugins, and imported Claude Code plugins can be found. Which
  marketplace plugins are enabled is on Cursor's server, so the library can only read the cached copies, and a cached
  copy may belong to a plugin that has since been turned off.
- **OpenCode has no plugin skills to find.** Its project, user, and config folders, plus `skills.paths`, are the whole
  set. A plugin's config hook can add a folder at run time, which a static reader cannot see.
- **A duplicate skill name is not something the library can settle the way the harness does.** Copilot CLI and Gemini
  CLI pick a winner by fixed rules; Claude Code ranks tiers; Cursor and Codex show the model every copy; OpenCode is not
  deterministic. A default found in two skills of one name should be reported as such, not resolved by a guessed rule.
- **Identity:** keep R58's rule (a skill is known by its `SKILL.md` `name`), and treat a `name` that differs from its
  folder as a case Claude Code and Cursor handle differently (verdict 5).
- **Harness-specific folders the library must follow:** Copilot CLI reads `~/.agents/skills` only when `COPILOT_HOME` is
  the default (E-SR-COPILOT-9). Cursor also reads `.grok/skills` (E-SR-CUR-10). Codex needs `enabled = true` for a
  cached plugin to count (E-SR-CODEX-6).
- **The plugin-root `references/` folder is ours.** The spec should say so, so that no one expects a harness to honor
  it. It is still safe in a published plugin: Agent Plugins clients must ignore what they do not know (E-SR-AP-3).

## Confidence

High for verdicts 1, 2, 3, 6, and 7: each harness's answer rests on a vendor doc or source and a direct experiment,
except where the tables say otherwise. Medium for parts of 4 and 5: the Cursor and Copilot CLI precedence and naming
were observed through the model's listing and session events, not traced to code, and Claude Code's same-name ranking
across tiers is from its docs alone.

## Strongest supporting evidence

- The same `Base directory for this skill:` line shows up in Claude Code and Copilot CLI session output and in
  OpenCode's tool source (E-SR-CC-9, E-SR-COPILOT-10, E-SR-OC-7).
- Codex's `codex debug prompt-input` shows the skill list, roots table, and namespaced plugin skills with no model call
  (E-SR-CODEX-13).
- Gemini CLI's source, docs, and `gemini skills list` agree on the precedence order (E-SR-GEM-8–10).
- The Agent Plugins schema is closed and read in full from the raw file (E-SR-AP-1).

## Strongest weakening evidence

- Cursor and Copilot CLI are closed source, and Copilot CLI's skill scan is native code; their rows rest on a bundle
  read and on experiments, not on source (E-SR-CUR-*, E-SR-COPILOT-2, -3, -8).
- Copilot CLI's docs and its behavior disagree on depth (E-SR-COPILOT-3), and OpenCode's docs and code disagree on
  uniqueness and naming (E-SR-OC-11). This topic follows the behavior.
- Several harness plugin pages were read through a summarizing fetch, so an absence of `references/` there is weaker
  (E-SR-HX-1).

## Contradictions with `harness-detection`

- R4 says Codex skills are bare names. That holds for non-plugin skills; plugin skills are `<plugin>:<skill>`
  (E-SR-CODEX-5). It also settles the open question whether two Codex plugins' same-named skills are disambiguated:
  yes, by that prefix (E-SR-CODEX-9).
- R4 says Copilot CLI does not namespace; it does when two enabled plugins collide (E-SR-COPILOT-8).
- R6 lists four Cursor skill folders; Cursor also reads `.grok/skills` (E-SR-CUR-10). R6 lists `~/.agents/skills` for
  Copilot CLI unconditionally; it is read only with the default `COPILOT_HOME` (E-SR-COPILOT-9).
- E-COPILOT-S2 says Copilot CLI plugin skills sit in immediate subfolders of `skills/`; nested ones load
  (E-SR-COPILOT-3).
- E-OC-S2 says OpenCode enforces unique names across locations; the code does not (E-SR-OC-6, -11).
- The open question whether Cursor keeps a per-plugin enabled state: it does, on its server, not on disk (E-SR-CUR-7).

## Not supported

- That any harness reads a plugin-root `references/` folder.
- That any harness exposes a skill's folder as an environment variable.
- That OpenCode plugins can declare skills.
- A shared rule for which copy of a skill wins.

## Where evidence is thin

- Cursor marketplace plugins: no real install was run, so the cache path and its pruning are from the bundle alone.
- Claude Code project-scope install records (`projectPath`) were not observed on this machine, and the same-name
  ranking across enterprise, personal, and project skills was not run.
- Copilot CLI's managed tier, `_direct` installs, and remote (org or enterprise) skills were not tested.
- The text a loaded skill gets was not seen live for OpenCode, Gemini CLI, or Codex's explicit-mention block; each is
  from source.
- Codex: whether a trusted project's `.codex/config.toml` can enable a plugin (E-SR-CODEX-7).
- Gemini CLI: which home `~/.agents/skills` follows when `GEMINI_CLI_HOME` and `HOME` differ (E-SR-GEM-16).

## Check again later

- Cursor's skills page for `.grok/skills`, and whether Cursor documents a precedence rule.
- Copilot CLI's docs on skill depth, against its behavior.
- OpenCode: whether the unused `NameMismatchError` starts being enforced, and whether duplicates get an order.
- The Agent Plugins spec, if a later version adds component types beyond `skills/` and `mcp.json`.
