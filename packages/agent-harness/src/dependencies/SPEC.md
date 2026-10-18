# Plugin dependencies

Design: [#110](https://github.com/spikyuni/uni-agent-kit/issues/110), [#107](https://github.com/spikyuni/uni-agent-kit/issues/107).
Facts: `.research/plugin-dependencies-and-overrides` (E-DEP-1 to E-DEP-5) and `.research/harness-detection` (E-CC-X1).

## Purpose

Tell an agent which plugins a plugin needs, which of them the running harness is missing, and what to do about it.
Nothing here installs anything; it returns steps.

## Reading what a plugin declares

- **D1.** `declaredPluginDependencies(manifest)` reads the `dependencies` array of a Claude Code `plugin.json`. An
  entry is `"name"`, `"name@marketplace"`, or `{ name, marketplace?, version? }`. It returns
  `{ name, marketplace?, version? }` per entry. For an object entry, `marketplace` wins over an `@marketplace` in `name`.
  An entry of any other shape is skipped.
- **D2.** A manifest with no `dependencies`, or one that is not an array, declares none.
- **D3.** `readPluginDependencies(pluginRoot)` reads `<pluginRoot>/.claude-plugin/plugin.json` and applies D1. A
  missing or unparsable file declares none and reports the problem in `error`. Only Claude Code's manifest has the
  field (E-DEP-1, E-DEP-4), so no other manifest is read.

## Checking them

`checkPluginDependencies(harness, { pluginRoot | dependencies, ...HarnessEnvironment })` joins the declared list with
`installedPlugins` and `enabledPlugins` and returns, per dependency, one `state`:

- **S1.** `enabled`: installed, and `enabledPlugins` has an explicit `true` for it.
- **S2.** `disabled`: installed, and `enabledPlugins` has an explicit `false`.
- **S3.** `installed`: installed, with no explicit entry. The harness default decides, which this package does not know.
- **S4.** `missing`: not installed.
- **S5.** `unknown`: the harness keeps no readable install record (`installedPlugins.supported` is false).
- **S6.** A dependency with a marketplace matches the id `<name>@<marketplace>`. A bare name matches that name in any
  marketplace, since it resolves in the declaring plugin's own marketplace, which this call does not know (E-DEP-1).
  When several installs match, the most enabled one wins.
- **S7.** The requested `version` is reported, not compared.

## Steps per harness

The result carries `supported` (`supportsPluginDependencies`), `autoResolved`, and ordered `steps` (plain strings).

- **P1. Claude Code** (E-DEP-2, E-DEP-3). `autoResolved` is true: installing the declaring plugin installs missing
  dependencies, and a plugin with a missing or disabled one does not load. Steps, only for dependencies that are
  `missing` or `disabled`:
  - missing: `claude plugin install <name>@<marketplace>` (just `<name>` when no marketplace is declared), then
    `/reload-plugins`.
  - disabled: enable `<id>`, then `/reload-plugins`.
  - a dependency whose marketplace is another than the declaring plugin's needs that marketplace in
    `allowCrossMarketplaceDependenciesOn` in the root marketplace, or the user must already have it enabled; a step
    says so. The call cannot tell the declaring marketplace, so it adds this step to every missing dependency that names
    a marketplace.
- **P2. Any other harness.** `supported` and `autoResolved` are false. No manifest of the harness declares
  dependencies (E-DEP-4, E-DEP-5, E-CC-X1), so nothing is resolved for the user. Steps: one line that says so, then one
  manual step per declared dependency: install `<name>` (from `<marketplace>` when named) through the harness's own
  plugin install flow, then enable it. No install command is given for a harness whose command has not been verified.
- **P3.** When every dependency is `enabled` or `installed`, `steps` is empty.

## The `plugin-dependencies` reference

`references/plugin-dependencies.md` in the package tells an agent how to install a plugin's dependencies. It is
rendered from the facts above by `renderDependencyReference()`; a test fails while the committed file differs from the
render, and `pnpm run generate:references` rewrites it. It loads through the `reference` skill by name
`plugin-dependencies`.

The package page's "Requires" section links it.

## Out of scope

Reference-keyed overrides, `website.*` references, and `extends`/`include`/`exclude` (other items of #110).
