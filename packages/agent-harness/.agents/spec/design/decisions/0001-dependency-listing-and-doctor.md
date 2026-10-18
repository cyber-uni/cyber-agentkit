# 0001 — Dependencies are listed in the extension key and checked by a read-only doctor

**Status:** accepted (2026-10-18). **Source:** issues #106, #107, #110.

- Only Claude Code enforces plugin dependencies, via `dependencies` in `.claude-plugin/plugin.json`. Cursor, Codex,
  Copilot CLI, and the Agent Plugins 1.0 schema have none.
- A plugin authors its list once in its root `plugin.json` under `extensions["org.spikyuni.plugin-manager"]`.
  Agent Plugins 1.0.0 section 8 requires a reverse-domain key. `org.cyberuni.universal-plugin` stays read as a
  fallback because `buddy-agent-harness` authors it today.
- This library never installs, enables, or removes a plugin. It reports state and returns steps for the user to run.
- Reference-keyed overrides (alias, default marker, pin) are a separate decision, still open in #110.
