# Reference

Loads, creates, updates, selects, deletes, and finds [references](https://spikyuni.github.io/uni-agent-kit/concepts/reference-documents/): Markdown documents an agent reads on demand by name. It routes each request to the `reference` command, run from a launcher bundled in `scripts/`, and writes or deletes a reference only after the user approves it. Type `/reference` (`/uni-agent-kit:reference` (pnpm install: `pnpm-uni-agent-kit-reference`) in Claude Code) to run it yourself.

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

It ships in the `uni-agent-kit` plugin:

```text
/plugin marketplace add cyberuni/cyberplace
/plugin install uni-agent-kit@cyberplace
```

## Loading a reference from a skill

A calling skill names the references it needs in one line:

```text
Load `skill-design` and `agent-tool-output` with the `reference` skill of `uni-agent-kit`.
```

Name the package as well as the skill: an agent that does not have the skill can then tell the user what to install. Write the skill's name in words, as above. Every harness reads the words, but each types the skill differently, and where the typed form does not name the plugin, two plugins' skills of the same name collide.

A skill written for one harness only may add that harness's typed form after the skill's name, for example "with the `reference` skill (`/uni-agent-kit:reference` (pnpm install: `pnpm-uni-agent-kit-reference`)) of `uni-agent-kit`" in Claude Code. Each harness names it this way:

<!-- generated: harness invocations -->
| Harness | Typed form | Names the plugin |
| --- | --- | --- |
| `claude-code` | `/uni-agent-kit:reference` (pnpm install: `pnpm-uni-agent-kit-reference`) | yes |
| `cursor` | `/reference` | no |
| `codex` | `$reference` | no |
| `copilot-cli` | `/reference` | no |
| `opencode` | no typed form recorded | — |
| `kilo` | `/reference` | no |
| `gemini-cli` | no typed form recorded | — |
| `qwen-code` | no typed form recorded | — |
| `vscode-copilot` | `/uni-agent-kit:reference` (pnpm install: `pnpm-uni-agent-kit-reference`) | yes |
| `cline` | `/reference` | no |
| `crush` | no typed form recorded | — |
| `openhands` | no typed form recorded | — |
| `augment` | no typed form recorded | — |
<!-- /generated -->

A skill that consumes an [interface](https://spikyuni.github.io/uni-agent-kit/concepts/reference-interfaces/) names the interface instead:

```text
Load the implementations of the `scaffold.recipe` interface with the `reference` skill of `uni-agent-kit`.
```

The skill runs `implementations <id>` and hands back each implementation's pin, which the calling skill loads by name.

A calling skill may ship its own default of a reference at `references/<name>.default.md`. Loading passes the calling skill's folder as `--default`, so the default sits below every plugin, user, project, and managed contribution, and anyone can customize it. The skill reads the default by itself only when the command cannot run. A copy at `references/<name>.md`, the old layout, is not read as a default.

`scripts/reference.mjs` is the package's `reference` command bundled into this folder. It ships through the npm package and runs with no `node_modules`. Loading never falls back to `npx` or the network; the other modes fall back to `pnpm exec uni-agent-kit`, or to `npx` pinned to this release's exact version, when the launcher is missing.
