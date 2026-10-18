# Reference

Loads, creates, updates, deletes, and finds [references](https://spikyuni.github.io/uni-agent-kit/concepts/reference-documents/): Markdown documents an agent reads on demand by name. It routes each request to the `reference` command, run from a launcher bundled in `scripts/`, and writes or deletes a reference only after the user approves it. Type `/reference` (`/cyber-agent-harness:reference` (pnpm install: `pnpm-@cyberuni+agent-harness-reference`) in Claude Code) to run it yourself.

| Mode | When |
| --- | --- |
| Load | a skill's instructions name references, or an interface whose implementations, to load with this skill |
| Create | writing a new reference; a plugin's is named `<plugin name>.<reference>.md`, and an implementation of an interface `<id>.<key>.md` |
| Update | changing a reference: the user's own in place, a plugin's by an override |
| Delete | removing a project or user copy, saying first which copy answers the name afterwards |
| Find | `search` for a topic, `list` every reference, or `implementations` of an interface |
| Inspect | `show`; `show --trace` for why a name resolved to one copy; `where` for the project and user files an override can be written to; `check` against an interface |
| Wire a skill | giving a skill the line below |

It ships in the `cyber-agent-harness` plugin:

```text
/plugin marketplace add cyberuni/cyberplace
/plugin install cyber-agent-harness@cyberplace
```

## Loading a reference from a skill

A calling skill names the references it needs in one line:

```text
Load `skill-design` and `agent-tool-output` with the `reference` skill in the `cyber-agent-harness` plugin.
```

Name the plugin as well as the skill: an agent that does not have the skill can then tell the user what to install. Write the skill's name in words, as above. Every harness reads the words, but each types the skill differently, and where the typed form does not name the plugin, two plugins' skills of the same name collide.

A skill written for one harness only may add that harness's typed form after the skill's name, for example "with the `reference` skill (`/cyber-agent-harness:reference` (pnpm install: `pnpm-@cyberuni+agent-harness-reference`)) in the `cyber-agent-harness` plugin" in Claude Code. Each harness names it this way:

<!-- generated: harness invocations -->
| Harness | Typed form | Names the plugin |
| --- | --- | --- |
| `claude-code` | `/cyber-agent-harness:reference` (pnpm install: `pnpm-@cyberuni+agent-harness-reference`) | yes |
| `cursor` | `/reference` | no |
| `codex` | `$reference` | no |
| `copilot-cli` | `/reference` | no |
| `opencode` | no typed form recorded | — |
| `kilo` | `/reference` | no |
| `gemini-cli` | no typed form recorded | — |
| `qwen-code` | no typed form recorded | — |
| `vscode-copilot` | `/cyber-agent-harness:reference` (pnpm install: `pnpm-@cyberuni+agent-harness-reference`) | yes |
| `cline` | `/reference` | no |
| `crush` | no typed form recorded | — |
| `openhands` | no typed form recorded | — |
| `augment` | no typed form recorded | — |
<!-- /generated -->

A skill that consumes an [interface](https://spikyuni.github.io/uni-agent-kit/concepts/reference-interfaces/) names the interface instead:

```text
Load the implementations of the `scaffold.recipe` interface with the `reference` skill in the `cyber-agent-harness` plugin.
```

The skill runs `implementations <id>` and hands back each implementation's pin, which the calling skill loads by name.

A calling skill may ship its own copy of a reference at `references/<name>.md`. The skill reads it when no tier holds the name, or when the command cannot run.

`scripts/reference.mjs` is the package's `reference` command bundled into this folder. It ships through the npm package and runs with no `node_modules`. Loading never falls back to `npx` or the network; the other modes fall back to `pnpm exec agent-harness`, or to `npx` pinned to this release's exact version, when the launcher is missing.
