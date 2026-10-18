# Conclusion — Reference overrides and plugin dependencies (October 2026)

## Last updated

2026-10-18. Checked: `agent-harness` 0.7.1 built from this repository (`reference` command), Claude Code
plugin docs fetched 2026-10-18, Cursor, Agent Plugins 1.0, and Copilot CLI manifest schemas fetched
2026-10-18. Design issue: [#107](https://github.com/spikyuni/uni-agent-kit/issues/107), epic
[#106](https://github.com/spikyuni/uni-agent-kit/issues/106).

## Q1. Is `extends: []` in v1?

**No.** The first version needs no setting, because the `reference` command already lets a plugin
contribute an override and lets the user choose among them (E-OVR-1 to E-OVR-6).

- **Tier precedence** is managed, then project, then user, then plugin (E-OVR-1). A project or user copy
  always beats a plugin's.
- **Merge** defaults to `first-wins` when `merge` is absent (E-OVR-2). The highest copy then answers alone and
  every copy below it is `shadowed`. With `merge: merge-sections` the copy replaces only the sections it
  redefines and keeps the rest of the copy below.
- **A plugin override beats repobuddy's reference** only when its copy declares `overrides: [repobuddy]`
  (E-OVR-3). Without it, two plugins holding one name are alternatives and the unqualified name fails as
  ambiguous (E-OVR-4). This is the one trap for the design.
- **Two overriders that do not order are ambiguous** (E-OVR-4). `unional-skills` and the `uni-agent-kit`
  website references both override `repobuddy`. Enabled together, `show website.init` fails until one names the
  other: the more specific plugin lists both, `overrides: [repobuddy, uni-agent-kit]` (E-OVR-5). A name in
  `overrides` that is not installed does no harm (E-OVR-5).
- **Choice already exists** without `extends`: enable or disable the plugin; write a project or user
  override, which sits above every plugin; or ask for `<plugin>/<name>`, which reads that plugin plus the
  copies that override it (E-OVR-6).

Reconsider `extends` when a user needs to exclude one enabled plugin's override for one project without
disabling the plugin, or when two overriders cannot name each other. Neither occurs in this epic.

## Q2. Migration order

[#101](https://github.com/spikyuni/uni-agent-kit/issues/101) already fixes the order of the rename; this
design only places `repobuddy`'s dependency in it and closes two gaps (E-MIG-1 to E-MIG-4).

1. #101 rename PR, trusted publisher, `uni-agent-kit@1.0.0` on npm, the plugin published as `uni-agent-kit`.
2. #101 downstream moves, `repobuddy` among them (import, six SKILL.md lines). `repobuddy` still declares no
   dependency here.
3. Only then does `repobuddy` add `uni-agent-kit` to `dependencies` in its manifest, and its marketplace
   lists `uni-agent-kit` too (Q3), so the dependency resolves.
4. The website references, the `unional-skills` override, and the removal of `add-website` follow, since they
   load references through the plugin `repobuddy` now requires.

Gaps in #101: (a) R3 renames the marketplace entry `cyber-agent-harness` to `uni-agent-kit`, which breaks
every dependent still declaring `cyber-agent-harness` until it moves. Keep the old entry until the last
dependent has moved, then remove it. (b) A bare dependency name resolves in the declaring plugin's own
marketplace, and `repobuddy`'s lists only `repobuddy`.

## Q3. Dependency manifest field per harness

Re-verified 2026-10-18 against vendor documentation and schemas (E-DEP-1 to E-DEP-4):

| Harness | Field | Supports dependencies |
| --- | --- | --- |
| Claude Code | `dependencies` in `.claude-plugin/plugin.json`: `"name"`, `"name@marketplace"`, or `{ name, marketplace, version }` | Yes |
| Cursor | none; the schema is closed (`additionalProperties: false`) | No |
| Codex | none; Agent Plugins 1.0 root schema is closed | No |
| GitHub Copilot CLI | none; unknown top-level fields are reported and ignored | No |
| Every other harness in `harness-detection` | none (E-CC-X1 and the R5 list stand, not re-fetched) | No |

On Claude Code, `claude plugin install` installs missing dependencies; an unresolved one leaves the plugin
unloaded (E-DEP-2). A bare name resolves in the declaring plugin's marketplace; another marketplace needs
`name@marketplace` and `allowCrossMarketplaceDependenciesOn` in the root marketplace (E-DEP-3).
`packages/agent-harness` already answers the support question with `supportsPluginDependencies` and the web
generator already reads `dependencies` (#108).

## Q4. Where the dependency-docs reference lives

**`uni-agent-kit`.** It owns the per-harness facts and the dependency domain, so the reference that tells an
agent how to install a plugin's dependencies is generated from them. `repobuddy` cannot host it: the
reference is loaded through the very plugin that may be missing. `repobuddy` therefore also carries a short
static note in its README and its website "Requires" section, which a user reads without any plugin installed.

## What this settles for the children

- `repobuddy`: marketplace lists `uni-agent-kit`; manifest `dependencies`; website references `website.init`,
  `website.deploy`, `website.update` in its `references/`; README note for non-Claude harnesses.
- `unional-skills`: a `website.*` override per reference with `overrides: [repobuddy, uni-agent-kit]` and
  `merge: merge-sections`; remove `add-website`.
- `uni-agent-kit`: dependency domain, `plugin-dependencies` reference, website references, and the order
  between the three.
