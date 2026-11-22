---
'cyber-agentkit': minor
---

Examine whether a plugin's dependencies are ready. `cyber-agentkit dependency doctor [--plugin <root>] [--harness <id>]`
reports each declared dependency's state on the running harness, every problem with its own code
(`dependency-missing`, `dependency-disabled`, `dependency-unknown`, `manifest-unparsable`), and the steps to run. It
exits 0 whenever it answers, 1 with `harness-not-detected` when no single harness is detected and none is given, and
2 when called wrongly. It changes nothing. The new `dependency` skill runs it as `/dependency doctor`.

`checkPluginDependencies()` returns `problems`, each with its code, and takes `declaringMarketplace`. A dependency
named without a marketplace now matches only in the declaring plugin's marketplace: the one passed in, else the one
the plugin root is installed from, else it is `unknown`. A same-named plugin from another marketplace no longer
satisfies it. Only a missing, disabled, or unknown dependency gets steps, in a fixed order: on Claude Code a bare name
installs as `<name>@<declaring marketplace>` and the reload step comes only after an install or enable step; on every
other harness the first step says nothing is installed for you, and there is no reload step. A manifest that cannot
be parsed is reported even when a later source lists the dependencies.
