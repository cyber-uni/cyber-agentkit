# Reference

Loads, finds, inspects, creates, customizes, deletes, and migrates [references](https://cyber-uni.github.io/cyber-agentkit/concepts/reference-documents/): Markdown documents (or JSON, YAML, TOML, or text files, which are never merged) an agent reads on demand by name. It routes each request to the `reference` command, run from a launcher bundled in `scripts/`, and writes or deletes a reference only after the user approves it. Type `/reference` to run it yourself. Installed as a Claude Code plugin, it is `/cyber-agentkit:reference` (pnpm install: `pnpm-cyber-agentkit-reference`). Installed with pnpm, it is `pnpm-cyber-agentkit-reference`.

| Mode | When |
| --- | --- |
| Load | a skill's instructions name references, or an interface whose implementations, to load with this skill; it acts on each status and warning, and follows project sections for the folder the work is in |
| Find | `search` for a topic, `list` every reference, or `implementations` of an interface |
| Inspect | `load`; `load --trace` for how a name composed; `where` for the files a customization goes to; `check` against an interface |
| Create | writing a new reference from given text, for the repository, a folder, the user, a plugin (`<plugin name>.<reference>.md`), or a skill's default (`<name>.default.md`), or stubbing an interface; it shows where each section came from and offers the full document |
| Update | editing the user's own hand-written file in place |
| Customize | picking what a name builds on, changing its prose by request through a generator subagent, implementing an interface by request, or revising a stale generated document |
| Delete | removing a repo, user, or project-section contribution, saying first what answers the name afterwards |
| Migrate | rewriting files left in a version 1 form, and renaming files under a name a plugin renamed, with `migrate`; it shows the plan, calls out `user` files, and runs `migrate --write` only once the user approves |
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
