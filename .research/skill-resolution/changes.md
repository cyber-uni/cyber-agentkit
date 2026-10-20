# Changes

## 2026-10-20 — created

- What changed: topic created for issue #114.
- Why: the reference spec's Q12 left the `default` tier and default discovery in `list` and `search` unbuilt until
  each harness's plugin skill folders, install records, same-name precedence, and loaded-skill context were known, and
  until it was settled whether a plugin-root `references/` folder belongs to the Agent Plugins spec.
- Conclusion changed materially: n/a (first version).
- Triggered by: vendor docs, source at pinned commits (Codex, OpenCode, Gemini CLI, Agent Plugins, Agent Skills),
  shipped bundles (Cursor, Copilot CLI), and direct experiments against the six installed CLIs, logged as E-SR-* in
  `evidence.md`.
- Corrections to `harness-detection`, recorded in the conclusion: Codex and Copilot CLI plugin skills can be
  namespaced; Cursor also reads `.grok/skills`; Copilot CLI reads `~/.agents/skills` only with the default
  `COPILOT_HOME`; Copilot CLI plugin skills nest deeper than its docs say; OpenCode does not enforce unique names.
