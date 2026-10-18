# 0001 — Dependencies are listed in the extension key and checked by a read-only doctor

**Status:** accepted (2026-10-18). **Source:** issues #106, #107, #110.

- Only Claude Code enforces plugin dependencies, via `dependencies` in `.claude-plugin/plugin.json`. Cursor, Codex,
  Copilot CLI, and the Agent Plugins 1.0 schema have none.
- A plugin authors its list once in its root `plugin.json` under `extensions["org.spikyuni.plugin-manager"]`.
  Agent Plugins 1.0.0 section 8 requires a reverse-domain key. `org.cyberuni.universal-plugin` stays read as a
  fallback because `buddy-agent-harness` authors it today.
- This library never installs, enables, or removes a plugin. It reports state and returns steps for the user to run.
- Reference-keyed overrides (alias, default marker, pin) are a separate decision, still open in #110.
- A dependency with no marketplace resolves only in the declaring plugin's marketplace, as Claude Code does. A
  same-named plugin from another marketplace never satisfies it, because the plugin author chose which plugin is meant.
  When the declaring marketplace is unknown the state is `unknown`, never guessed.
- The doctor command follows AXI exit codes: 0 success, 1 the plugin is not ready (each problem with its own code),
  2 usage error.
