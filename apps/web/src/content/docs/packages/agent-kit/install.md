---
title: Install
description: Install uni-agent-kit as a library, as a command, or as an agent plugin, and run your first reference command.
sidebar:
  order: 1
---

Pick the form that matches how you will use it. The library and the command come from the same npm
package. The plugin is the same package packaged for an agent harness.

## As a library or command

Node 22 or later is required, as the repository root declares in `engines`.

```sh
npm install uni-agent-kit
```

Run the command without installing it:

```sh
npx -y uni-agent-kit reference list
```

With the package installed, `npx uni-agent-kit reference list` or `pnpm exec uni-agent-kit reference list`
runs the same command.

## As an agent plugin

The plugin is named `uni-agent-kit`. Its `plugin.json` declares four harnesses: `claude-code`,
`cursor`, `codex`, and `copilot-cli`. In Claude Code, add the marketplace and install it:

```text
/plugin marketplace add cyberuni/cyberplace
/plugin install uni-agent-kit@cyberplace
```

Those two lines come from the [package readme](https://github.com/spikyuni/uni-agent-kit/tree/main/packages/agent-kit#the-reference-skill).
For Cursor, Codex, and Copilot CLI, install the plugin with that harness's own plugin command. The
package ships a manifest for each: `.claude-plugin`, `.cursor-plugin`, and `.codex-plugin`.

## Check it works

In the repository where you installed the plugin, ask the agent:

> Which references exist?

The agent loads the [`reference` skill](/uni-agent-kit/packages/agent-kit/skills/reference/),
which runs the [`list`](/uni-agent-kit/packages/agent-kit/cli/reference-list/) command and
reports the layers it read. From a shell, the same check is:

```sh
npx -y uni-agent-kit reference list
```

## Use the skill

Describe what you want done with a reference. You do not name the command:

1. Ask the agent to create one: "Create a project reference called release-checklist." It shows you the path and the content, and writes only after you approve.
2. Ask it to read one: "Show me release-checklist."
3. Ask why a copy won: "Why does release-checklist resolve to that file?"

[The skill page](/uni-agent-kit/packages/agent-kit/skills/reference/) lists every kind of request
and what the agent does for each.

## Use the command

Run `reference` subcommands directly when you script around them. The default `toon` format is
compact for agents; add `--format json` to pipe the answer to another tool.

```sh
npx uni-agent-kit reference search release
npx uni-agent-kit reference show release-checklist
npx uni-agent-kit reference show release-checklist --trace
```

The [CLI reference](/uni-agent-kit/packages/agent-kit/cli/) documents every command and option.
