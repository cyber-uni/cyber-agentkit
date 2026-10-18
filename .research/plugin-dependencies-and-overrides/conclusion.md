# Conclusion — Reference overrides and plugin dependencies (October 2026)

## Last updated

2026-10-18. Checked: `agent-harness` 0.7.1 built from this repository (`reference` command), Claude Code
plugin docs fetched 2026-10-18, Cursor, Agent Plugins 1.0, and Copilot CLI manifest schemas fetched
2026-10-18. Design issue: [#107](https://github.com/spikyuni/uni-agent-kit/issues/107), epic
[#106](https://github.com/spikyuni/uni-agent-kit/issues/106).

## Q1. Is `extends: []` in v1?

**No, and the `overrides: [<plugin>]` mechanism is dropped from the design.** The Council keyed overrides on
the reference, not the plugin:

- **R1. Neutral names.** `website.init`, `website.update`, and `website.deploy` belong to an interface, not
  to a plugin. Existing prefixed names such as `repobuddy.work-template.task` keep working through an alias
  until callers move.
- **R2. A default marker.** A shipped copy can mark itself default. A non-default plugin copy of the same
  name beats the default on its own, with no `overrides` line and no plugin name. `repobuddy` ships the
  default; `unional-skills` and `uni-agent-kit` just ship `website.init`.
- **R3. Pins settle ambiguity.** Two non-default providers of one name stay ambiguous until a user or project
  pin settles it, for example `website.init: unional-skills` in `.agents/`. The pin is where a later
  `extends`/`include`/`exclude` belongs; none of that is in v1.

The tier order is unchanged: managed, then project, then user, then plugin (E-OVR-1). A project or user copy
still beats every plugin's, and `merge` still defaults to `first-wins` (E-OVR-2).

### What exists today and what `uni-agent-kit` must add

Re-verified 2026-10-18 against the 0.7.1 source and command (E-OVR-8 to E-OVR-11).

| Piece | Today | Work |
| --- | --- | --- |
| Neutral name owned by an interface | **Partly exists.** An interface document `<id>.interface` fixes the contract and its owner's copy answers; implementations are named `<id>` or `<id>.<key>`. The document still sits in a plugin's layer, not in no plugin | Decide where `website.*` interface documents live; spec first |
| Alias from an old name to a neutral one | **Missing.** The only aliases in the resolver are a plugin's several names (`pkg` and manifest `name`) for a qualified `<plugin>/<name>`, not reference names | Add a name alias, with a warning that names the new name |
| Default marker | **Missing.** No frontmatter key marks a copy default | Add the marker and the rule that a non-default plugin copy beats the default |
| Pin | **Partly exists.** `implementations` prints a `pin` string `<plugin>/<name>` that a consumer may hand back, and a qualified name reads that plugin. Nothing is stored, and no file in `.agents/` is read | Add a pin file in `.agents/` and, for a user, `~/.agents/`; shape is for the spec |
| `overrides: [<plugin>]` | **Exists** (E-OVR-3 to E-OVR-5) and the design stops using it | Decide in the spec whether to remove it in a major, since removing it breaks any reference that sets it; none was found in the owner's local repositories (E-OVR-12) |

None of the missing pieces is implemented here. Library work needs a spec first.

## Q2. Migration order

[#101](https://github.com/spikyuni/uni-agent-kit/issues/101) already fixes the order of the rename; this
design only places `repobuddy`'s dependency in it and closes two gaps (E-MIG-1 to E-MIG-4).

1. #101 rename PR, trusted publisher, `uni-agent-kit@1.0.0` on npm, the plugin published as `uni-agent-kit`.
2. #101 downstream moves, `repobuddy` among them (import, six SKILL.md lines). `repobuddy` still declares no
   dependency here.
3. Only then does `repobuddy` add `uni-agent-kit` to `dependencies` in its manifest, and its marketplace
   lists `uni-agent-kit` too (Q3), so the dependency resolves.
4. The default marker, the name alias, and the pin file ship in a `uni-agent-kit` release after the spec.
5. The website references, the `unional-skills` copy, and the removal of `add-website` follow, since they
   load references through the plugin `repobuddy` now requires. A prefixed name keeps working through its
   alias until each caller has moved.

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

- `repobuddy`: marketplace lists `uni-agent-kit`; manifest `dependencies`; ships the default
  `website.init`, `website.deploy`, `website.update` in its `references/`, each marked default; README note for
  non-Claude harnesses.
- `unional-skills`: ships `website.init` (and the others that differ) with no `overrides` line; remove
  `add-website`.
- `uni-agent-kit`: spec, then the default marker, name alias, and pin file; the dependency domain; the
  `plugin-dependencies` reference; the website references.
