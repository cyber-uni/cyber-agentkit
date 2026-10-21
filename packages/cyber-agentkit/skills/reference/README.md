# Reference

Loads, creates, updates, selects, deletes, and finds [references](https://cyber-uni.github.io/cyber-agentkit/concepts/reference-documents/): Markdown documents an agent reads on demand by name. It routes each request to the `reference` command, run from a launcher bundled in `scripts/`, and writes or deletes a reference only after the user approves it. Type `/reference` to run it yourself. Installed as a Claude Code plugin, it is `/cyber-agentkit:reference`. Installed with pnpm, it is `pnpm-cyber-agentkit-reference`.

| Mode | When |
| --- | --- |
| Load | a skill's instructions name references, or an interface whose implementations, to load with this skill |
| Create | writing a new reference for a project, a user, a plugin (`<plugin name>.<reference>.md`), or a skill's default (`<name>.default.md`); an implementation of an interface is `<id>.<key>.md` |
| Update | changing a reference: the user's own in place, a plugin's by a customization that patches it |
| Select | choosing which plugins, or the skill's default, a name builds on, which settles an ambiguous name |
| Delete | removing a project or user contribution, saying first what answers the name afterwards |
| Find | `search` for a topic, `list` every reference, or `implementations` of an interface |
| Inspect | `show`; `show --trace` for how a name composed; `where` for the project and user files a customization goes to; `check` against an interface |
| Wire a skill | giving a skill the line below |

It ships in the `cyber-agentkit` plugin:

```text
/plugin marketplace add cyber-uni/marketplace
/plugin install cyber-agentkit@cyber-uni
```

## Loading a reference from a skill

A calling skill names the references it needs in one line:

```text
Load `skill-design` and `agent-tool-output` with the `reference` skill of `cyber-agentkit`.
```

Name the package as well as the skill: an agent that does not have the skill can then tell the user what to install. Write the skill's name in words, as above. Every harness reads the words, but each types the skill differently, and where the typed form does not name the plugin, two plugins' skills of the same name collide.

A skill written for one harness only may add that harness's typed form after the skill's name, for example "with the `reference` skill (`/cyber-agentkit:reference` (pnpm install: `pnpm-cyber-agentkit-reference`)) of `cyber-agentkit`" in Claude Code. Each harness names it this way:

<!-- generated: harness invocations -->
| Harness | Typed form | Names the plugin |
| --- | --- | --- |
| `claude-code` | `/cyber-agentkit:reference` (pnpm install: `pnpm-cyber-agentkit-reference`) | yes |
| `cursor` | `/reference` | no |
| `codex` | `$cyber-agentkit:reference` | yes |
| `copilot-cli` | `/reference` | no |
| `opencode` | `/reference` | no |
| `kilo` | `/reference` | no |
| `gemini-cli` | no typed form recorded | — |
| `qwen-code` | no typed form recorded | — |
| `vscode-copilot` | `/cyber-agentkit:reference` (pnpm install: `pnpm-cyber-agentkit-reference`) | yes |
| `cline` | `/reference` | no |
| `crush` | no typed form recorded | — |
| `openhands` | no typed form recorded | — |
| `augment` | no typed form recorded | — |
<!-- /generated -->

A skill that consumes an [interface](https://cyber-uni.github.io/cyber-agentkit/concepts/reference-interfaces/) names the interface instead:

```text
Load the implementations of the `scaffold.recipe` interface with the `reference` skill of `cyber-agentkit`.
```

The skill runs `implementations <id>` and hands back each implementation's pin, which the calling skill loads by name.

A calling skill may ship its own default of a reference at `references/<name>.default.md`. Loading passes the calling skill's folder as `--default`, so the default sits below every plugin, user, project, and managed contribution, and anyone can customize it. The skill reads the default by itself only when the command cannot run. A copy at `references/<name>.md`, the old layout, is not read as a default.

`scripts/reference.mjs` is the package's `reference` command bundled into this folder. It ships through the npm package and runs with no `node_modules`. Loading never falls back to `npx` or the network; the other modes fall back to `pnpm exec cyber-agentkit`, or to `npx` pinned to this release's exact version, when the launcher is missing.
