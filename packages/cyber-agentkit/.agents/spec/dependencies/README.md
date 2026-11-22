---
spec-type: behavioral
---

# dependencies — a user learns what a plugin needs, what is missing, and what to run

The work to make the code meet this spec is tracked in #112. Its test cases hold the functional detail.

## What

A plugin can need other plugins. Claude Code enforces that itself: it installs missing dependencies and refuses to
load a plugin whose dependency is missing or disabled. Every other harness ignores the field, so the plugin installs
and fails later with nothing to say why. And each tool that wants to know a plugin's dependencies would otherwise read
the list its own way.

This capability reads the dependencies a plugin lists, compares them with what the running harness has installed and
enabled, and reports each one's state with the steps the user can run. It is the agent-level equivalent of `depcheck`
or `knip`: one shared answer to "what does this plugin declare, and is it there?". It changes nothing.

**Non-goals:**

- N1 Installing, enabling, or removing plugins.
- N2 Comparing versions. A requested version is reported, never checked.
- N3 Finding dependencies a plugin uses but did not list, or lists but never uses (the `knip` half).
- N4 Reference-keyed overrides: alias, default marker, pin. Decision 0003 replaced them for references.
- N5 Telling whether a marketplace lists a plugin (only its author can fix that), or which marketplaces a harness has
  added. No verified query exists, so the user is asked.

**Key terms** (shared terms: [glossary](../glossary.md), including *declaring marketplace* and *cross-marketplace
dependency*):

- K1 **state**: one of `enabled` (installed and set on), `installed` (installed, no explicit setting), `disabled`
  (installed and set off), `missing` (not installed), or `unknown` (it cannot be told).
- K2 **bare name**: a dependency that names no marketplace.
- K3 **step**: an instruction the user runs, in a fixed order. A step is either for one dependency or for the whole
  list (K4).
- K4 **list step**: a step that belongs to the whole list, not to one dependency: Claude Code's reload step, and, on
  every other harness, the step saying that nothing is installed for the user.
- K5 **problem**: a dependency that is not `enabled` or `installed`, a manifest that cannot be parsed, or no harness
  to examine. Each carries a stable code.

## Use Cases

**Actors and goals.** A4 is affected by the outcome without invoking it.

| ID | Actor | Goal |
| --- | --- | --- |
| A1.1 | A1 user, on any harness | Learn what a plugin is missing and exactly what to run, without the tool changing anything |
| A2.1 | A2 tool (`universal-plugin`, and siblings such as `repobuddy` that gate a feature on a plugin) | Read a plugin's declared list with the same meaning as every other tool |
| A2.2 | A2 | Judge the declared list against what the harness has installed |
| A3.1 | A3 agent, sent by a plugin's text to the how-to reference | Learn where a plugin declares its dependencies and what to do per harness |
| A4.1 | A4 plugin author | Have the list they wrote read the same way everywhere, and a bare name match only the plugin they meant |

A2's goal comes from the owner (#110 discussion): `universal-plugin` does at the agent level what `depcheck` and
`knip` do for packages.

### UC1 — Examine a plugin's dependencies (A1.1, A4.1)

- **Trigger:** a plugin fails to work, or a user wants to know before using it whether it has what it needs.
- **Entry points:**
  - CLI (primary): `cyber-agentkit dependency doctor [--plugin <root>] [--harness <id>]`.
  - Skill: the `dependency` router skill's `doctor` command (`/dependency doctor`), which runs the CLI. It has its own
    spec, [dependencies/skill](./skill/README.md).
  - Library: `checkPluginDependencies(harness, { pluginRoot })`.
- **Inputs:** the plugin root (default the current folder); the running harness, detected or given.
- **Success:** each declared dependency with its state, then the steps that make the plugin ready, each problem with its
  code.
- **Extensions:**
  - UC1.1 The plugin declares no dependencies, or none of its entries is usable: the report says it declares none, with
    no steps.
  - UC1.2 A manifest cannot be parsed: the problem is reported, and a later source's list is still used.
  - UC1.3 The harness keeps no readable install record, or a bare name's declaring marketplace cannot be found (the
    plugin is not installed, for example while under development): those dependencies are `unknown`, never guessed.
  - UC1.4 The harness has no dependency support (every harness but Claude Code): the same states are reported, and the
    steps are manual.
  - UC1.5 No single harness is detected and none is given: nothing is examined, and the user is told to name the
    harness.
  - UC1.6 The command is called wrongly (an unknown option, a plugin root that does not exist): a usage error.

### UC2 — Read and judge a declared list (A2.1, A2.2, A4.1)

- **Trigger:** `universal-plugin` build or validate, or a sibling tool, needs the list or needs it compared with what
  is installed.
- **Entry points:** Library: `declaredPluginDependencies(manifest)`, `readPluginDependencies(pluginRoot)`, and
  `checkPluginDependencies(harness, { dependencies, declaringMarketplace })`.
- **Inputs:** a manifest, a plugin root, or a list; for judging, the harness and optionally the declaring marketplace.
- **Success:** a list of `{ name, marketplace?, version? }`; when judged, each entry's state and the steps, as in UC1.
- **Extensions:**
  - UC2.1 An entry is neither a name nor a named object: it is skipped, and the valid ones are kept.
  - UC2.2 A list is given with a plugin root: the list is used, and the manifest is not read.
  - UC2.3 Neither a list nor a plugin root is given: an empty list, no error.
  - UC2.4 No source lists any, or a manifest cannot be parsed: as UC1.1 and UC1.2.

### UC3 — Learn how to handle dependencies from the shipped reference (A3.1)

- **Trigger:** a plugin's README or skill points an agent at the reference because a plugin it needs is missing.
- **Entry points:** Skill: the `reference` skill loads `plugin-dependencies` by name.
- **Inputs:** none.
- **Success:** the agent reads where a plugin declares its dependencies, how to examine them, and the steps on Claude
  Code and on every other harness.
- **Extensions:** none, it is a shipped document with no inputs.

## Criteria

**Reading the list (UC2)**

- R1 (UC2): The list comes from the first source that lists any, in this order:
  `extensions["io.github.cyber-uni.plugin-manager"]`, then `extensions["org.cyberuni.universal-plugin"]` in the root
  `plugin.json`, then `.claude-plugin/plugin.json`.
- R2 (UC2): An entry may be a name, `name@marketplace`, or an object with `name`, `marketplace`, and `version`; each
  keeps its marketplace and version.
- R3 (UC2.1): A malformed entry is skipped and its valid siblings are kept. It raises no warning: a known limitation.
- R4 (UC1.2, UC2.4): A manifest that cannot be parsed is a problem, even when a later source lists the dependencies.
- R5 (UC2.2, UC2.3): A given list wins over a plugin root, which is then not read. Neither gives an empty list and no
  error.

**States (UC1, UC2)**

- R6 (UC1, UC2): Every declared dependency gets exactly one state (K1), on every harness.
- R7 (UC1, A4.1): A dependency that names a marketplace matches an install from that marketplace only.
- R8 (UC1.3, A4.1): A bare name matches an install from the declaring marketplace only, so a same-named plugin from
  another marketplace never satisfies it. The declaring marketplace is the one passed in, else the one the plugin is
  installed from. When neither is known, the state is `unknown`.
- R9 (UC1.3): When the harness keeps no readable install record, every dependency is `unknown`.
- R10 (UC1, N2): A requested version is reported and never changes the state.

**Steps for one dependency (UC1)**

- R11 (UC1): Only a `missing`, `disabled`, or `unknown` dependency gets steps. An `enabled` or `installed` one gets
  none.
- R12 (UC1): On Claude Code, a `missing` dependency gets an install command, a `disabled` one an enable command. A bare
  name is installed as `<name>@<declaring marketplace>`. An `unknown` bare name gets a step that says its declaring
  marketplace is not known and asks the user to install the plugin from a marketplace or to name one; no command is
  guessed.
- R13 (UC1, N5): Only a `missing` dependency that names a marketplace gets a step asking the user to check that the
  marketplace is added, and to add it if not.
- R14 (UC1): On Claude Code, a `missing` dependency whose marketplace differs from the declaring one, or whose declaring
  marketplace is unknown, gets a step to add the marketplace: the root marketplace must allow it as a
  cross-marketplace dependency, or the user must already have it enabled.
- R15 (UC1.4): On a harness without dependency support, each `missing`, `disabled`, or `unknown` dependency gets a
  manual step, and no install command is given.

**Steps for the whole list (UC1)**

- R16 (UC1): On Claude Code, the last step is the reload step when at least one install or enable step exists, and
  there is no reload step otherwise. A plugin whose only problems are `unknown` gets none.
- R17 (UC1.4): On a harness without dependency support, when any step exists, the first says that nothing is installed
  for the user. There is never a reload step.
- R18 (UC1): The steps come in a fixed order, the same for the same input.

**Report (UC1)**

- R19 (UC1.1): A plugin with no usable entries still gets a report, which says it declares none and has no steps.
- R20 (UC1): Every problem is listed, each with its own stable code: `dependency-missing`, `dependency-disabled`,
  `dependency-unknown`, `manifest-unparsable`, and `harness-not-detected` (UC1.5). The human wording is not a contract.

**Adapters**

- R21 (UC1): Exit values follow clibuilder's `axi` contract. Exit 0 whenever the command answers: a problem is a status
  in the result, not a failure. Exit 1 when it could not complete. Exit 2 when it was called wrongly (UC1.6).
- R22 (UC1, UC2, N1): No entry point writes a plugin or settings file.

**The shipped how-to reference (UC3)**

- R23 (UC3): The `plugin-dependencies` reference ships in the plugin and is written from the same facts as the
  examination, by `renderDependencyReference()`. A repository test fails while the committed file differs from the
  generator's output.

## Open questions

None.

## References

- Why the list lives in an extension key, and why bare names follow Claude Code: decision
  [0001](../design/decisions/0001-dependency-listing-and-doctor.md); the key itself:
  [0002](../design/decisions/0002-extension-key-on-cyber-uni.md).
- Why command-level detail lives in tests, not here: decision
  [0003](../design/decisions/0003-generated-scoped-references.md). The last full text, with its control flow and
  scenario suite, is commit `57350ca`.
- Agent Plugins 1.0.0 section 8 (reverse-domain keys in `extensions`): evidence E-DEP-7.
- Claude Code installs missing dependencies, refuses to load without them, and resolves a bare name in the declaring
  plugin's marketplace: E-DEP-1, E-DEP-2, E-DEP-3. No other harness has a dependency field: E-DEP-4, E-DEP-5. All in
  `.research/plugin-dependencies-and-overrides`.
- Independent, listable results follow `flutter doctor` and `brew doctor`: `.research/plugin-dependency-prior-art`.
- Command and skill names: the verbs in the [glossary](../glossary.md#verbs).
