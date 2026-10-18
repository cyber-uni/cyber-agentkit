# Plugin dependencies

Design: [#110](https://github.com/spikyuni/uni-agent-kit/issues/110), [#107](https://github.com/spikyuni/uni-agent-kit/issues/107).
Facts: `.research/plugin-dependencies-and-overrides` (E-DEP-1 to E-DEP-5) and `.research/harness-detection` (E-CC-X1).

## Purpose and use cases

A plugin can need other plugins. Whether the harness enforces that depends on the harness:

- **Claude Code** enforces it natively. `claude plugin install` installs missing dependencies, a plugin with a missing
  or disabled one does not load, and a cross-marketplace dependency is skipped unless the root marketplace allows it
  (E-DEP-2, E-DEP-3). Installing through the normal flow needs no help from this package.
- **Every other harness** ignores the field, or has none (E-DEP-4, E-DEP-5). The plugin installs and then fails or
  misbehaves at the point it uses a missing sibling. Nothing warns anyone.

So this domain serves the cases the harness does not cover. Each use case names who calls it and what they get:

- **U1. A user asks what a plugin is missing.** "Is `repobuddy` set up?", "why does this skill say a reference is
  missing?", "I installed `repobuddy` in Cursor." The agent (or the user, through a skill) runs
  `checkPluginDependencies(harness, { pluginRoot })` and reads the states and steps. This is the main entry.
- **U2. A plugin points at its own requirements.** A plugin's README or skill says "if a reference or skill from
  `uni-agent-kit` is not found, load the `plugin-dependencies` reference". This is how an agent that has never heard of
  the domain finds it. The pointer belongs to the plugin that has the dependency; this package supplies the reference
  it points at.
- **U3. Claude Code, after a failed load or a silent skip.** A plugin did not load, or a cross-marketplace dependency
  was not installed. The check names which dependency is `missing` or `disabled` and the step that fixes it.
- **U4. A tool wants the answer as data.** `buddy-agent-harness`, `repobuddy` and `cyber-mux` import the function to
  gate a feature on a sibling plugin being present, instead of re-detecting it.

How the agent knows to ask: it does not detect the problem on its own on a harness without enforcement. It asks when
(a) the user asks (U1), (b) a plugin's own text tells it to (U2), or (c) a load fails (U3). The domain never runs
unprompted.

### Delivery: a read-only doctor skill (proposed, not in this change)

The user-facing entry for U1 and U3 is expected to be a doctor skill in this plugin. It diagnoses and prints the
commands for the user to run; it never installs, enables, or removes anything, and it does not need permission to.
This package likewise only returns steps. The skill needs a CLI subcommand (`agent-harness dependencies check
[--plugin <root>]`) bundled into its script like `reference.mjs`. Neither is built here.

The doctor answers two questions, and the library covers only the first so far:

1. **What is missing?** Each declared dependency is `enabled`, `installed`, `disabled`, `missing`, or `unknown`.
   Built.
2. **What is the remedy?** The cause decides it, so the diagnosis walks the causes in order. R1 is built; R2 to R5 are
   reported to the user as advice, and only R5 and R4 follow from facts the library already has.
   - **R1. The harness's own manifest lists no dependencies.** True of every harness but Claude Code. The listing
     is read from the plugin's authored source instead, in order: `extensions["org.cyberuni.universal-plugin"].dependencies`
     in the root open-standard `plugin.json`, then `dependencies` in `.claude-plugin/plugin.json`. Both use Claude Code's
     entry shapes (E-DEP-6). The standard's own schema is closed, so `extensions` is the only place it can sit (E-DEP-4).
     `buddy-agent-harness` declares `["cyber-agent-harness"]` this way. `cyberfleet` declares none, which the doctor
     reports as "declares no dependencies", not as a pass.
   - **R2. The dependency's marketplace may not be added.** This package cannot read which marketplaces a harness has
     (no verified query), so it does not guess. The doctor reports it to the user: it names the marketplace the
     dependency needs and says the user must check that it is added and, if not, add it. It does not run anything.
   - **R3. The marketplace is added but does not list the plugin.** The remedy is to tell the plugin's author; the user
     cannot fix it.
   - **R4. Cross-marketplace and not allowed.** Claude Code skips it unless the root marketplace lists the target in
     `allowCrossMarketplaceDependenciesOn` (E-DEP-3).
   - **R5. Installed but disabled.** Enable it.

## Reading what a plugin declares

- **D1.** `declaredPluginDependencies(manifest)` reads the `dependencies` array of a Claude Code `plugin.json`. An
  entry is `"name"`, `"name@marketplace"`, or `{ name, marketplace?, version? }`. It returns
  `{ name, marketplace?, version? }` per entry. For an object entry, `marketplace` wins over an `@marketplace` in `name`.
  An entry of any other shape is skipped.
- **D2.** A manifest with no `dependencies`, or one that is not an array, declares none.
- **D3.** `readPluginDependencies(pluginRoot)` applies D1 to the first source that declares any: the root
  `plugin.json`'s `extensions["org.cyberuni.universal-plugin"]`, then `.claude-plugin/plugin.json` (E-DEP-1, E-DEP-6).
  It reports the source in `path`. A missing file declares none; an unparsable one is reported in `error`. No other
  vendor manifest has the field (E-DEP-4), so none is read.

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

## Open question: the extension key

D3 reads `extensions["org.cyberuni.universal-plugin"]`, the only key in use (E-DEP-6). The direction is a standard that
grows with the reference feature, which suggests one normalized key such as `org.spikyuni.uni-agent-kit` for
dependencies and for the alias, default marker, and pin of #110's overrides bullet. It is not decided, so nothing reads
it. Agent Plugins 1.0.0 §8 says client data MUST sit under a reverse-domain namespace in `extensions`, that a client
SHOULD base it on a domain it controls and keep it stable, and that the key also names the client's top-level
directory (§8.2). A bare `plugin-manager` or `open-plugin-spec` is therefore not conforming; `org.spikyuni.<name>` is.
The spec reserves no names. When it is, `readPluginDependencies` tries the new key first and falls back to the old one, and
`universal-plugin`'s ADR 0013 needs a successor. Tracked in #110.

## Out of scope

Reference-keyed overrides, `website.*` references, and `extends`/`include`/`exclude` (other items of #110).
