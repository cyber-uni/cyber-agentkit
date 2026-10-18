# Changes — Reference overrides and plugin dependencies

- 2026-10-18. Topic created for #107. Verified reference tier and override behavior by running the 0.7.1
  `reference` command; re-verified the Claude Code `dependencies` field and the Cursor, Agent Plugins, and
  Copilot CLI schemas against vendor sources.
- 2026-10-18. Revised Q1 after the Council keyed overrides on the reference (neutral names, a default
  marker, a pin) and dropped `overrides: [<plugin>]`. Re-verified what the resolver has today (E-OVR-8 to
  E-OVR-11) and listed what `uni-agent-kit` must add. Q2 gains the default marker, alias, and pin before the
  website references; the children follow.
