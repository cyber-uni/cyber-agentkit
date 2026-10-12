---
'@cyberuni/agent-harness': minor
---

Moves to clibuilder 12. `@clibuilder/axi` is gone, and `clibuilder` is the only optional peer, at `^12.0.0`. `--format` is now clibuilder's global option, so a host that mounts `createReferenceCommand` from `./commands` sets the default format with `cli({ format })`; the `text` default of `show`, `create`, and `delete` stays with the `agent-harness` CLI. The `reference` skill's `scripts/reference.mjs` is now compiled by `universal-plugin plugin build` from the `scripts` entry in `plugin.json`, with no `import()` left to resolve at runtime.
