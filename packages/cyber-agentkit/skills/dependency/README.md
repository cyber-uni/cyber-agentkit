# Dependency

Tells a user whether the plugins a plugin declares it needs are installed and enabled on the harness running here. A
user asks `/dependency doctor` when a plugin fails to load or before relying on it, and gets each dependency's state,
each problem with its code, and the steps to run, in order. It runs `cyber-agentkit dependency doctor` and changes
nothing: it never installs, enables, or removes a plugin. It does not check a plugin's manifests against their schema
(`universal-plugin`'s doctor does), and it does not look for npm package dependencies.

| Command | Does |
| --- | --- |
| `doctor` | reports each declared dependency's state (`enabled`, `installed`, `disabled`, `missing`, or `unknown`), every problem with its code, and the steps that make the plugin ready |

```text
/dependency doctor
/dependency doctor --plugin ./my-plugin --harness codex
```

Only Claude Code installs a plugin's dependencies itself. On every other harness the steps are manual, and the first
says nothing is installed for you. Installed as a Claude Code plugin, it is `/cyber-agentkit:dependency` (pnpm install: `pnpm-cyber-agentkit-dependency`).

It ships in the `cyber-agentkit` plugin:

```text
/plugin marketplace add cyber-uni/marketplace
/plugin install cyber-agentkit@cyber-uni
```

## Research

Full, done for the command this skill runs: the harness facts in
[plugin-dependencies-and-overrides](https://github.com/cyber-uni/cyber-agentkit/tree/main/.research/plugin-dependencies-and-overrides)
and the prior art in
[plugin-dependency-prior-art](https://github.com/cyber-uni/cyber-agentkit/tree/main/.research/plugin-dependency-prior-art).
No agent-plugin doctor for dependencies was found there; `flutter doctor` and `brew doctor` set the report's shape. Of
the skills installed here, `universal-plugin:doctor-universal-plugin` checks a plugin's manifests, not whether its
dependencies are installed, and `cyber-agentkit:skill`'s `doctor` checks a skill's references, so this skill is still
needed. The research changed nothing in the Intent.
