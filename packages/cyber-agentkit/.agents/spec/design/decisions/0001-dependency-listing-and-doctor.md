# 0001 — Dependencies are listed in the extension key and checked by a read-only doctor

**Status:** accepted (2026-10-18); the extension key is superseded by [0002](0002-extension-key-on-cyber-uni.md);
the names and exit values were amended on 2026-11-22. **Source:** issues #106, #107, #110, #112.

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
- The doctor is the command `cyber-agentkit dependency doctor [--plugin <root>] [--harness <id>]`, run by the
  `dependency` router skill as `/dependency doctor`. It examines what the running harness has installed and enabled,
  which is a `doctor` in the glossary's verbs, not a `check`, which tests an artifact against its contract. The group is
  singular, like `reference` and `skill`. A router skill named after its object takes the bare verb, where
  `doctor-dependencies` would collide with another plugin's skill in a harness that lists skills without their plugin.
  It was named `dependencies check` until 2026-11-22.
- The doctor exits 0 whenever it answers, with each problem as a status in the result, as the reference commands do
  under [0003](0003-generated-scoped-references.md). Exit 1 means it could not complete, exit 2 that it was called
  wrongly. This replaces exit 1 for a plugin that is not ready.
- The dependencies spec stays at design level, as 0003 settled for the reference spec. Six review rounds kept
  finding gaps in the step order and the control flow, which tests settle better than prose. The command-level detail
  moved to test cases in #112; commit `57350ca` holds the last full text.
