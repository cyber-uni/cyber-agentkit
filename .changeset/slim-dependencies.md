---
"@cyberuni/agent-harness": minor
---

The package no longer declares runtime `dependencies`, so a consumer that imports only `@cyberuni/agent-harness/worktrees` (or the root entry) installs nothing beyond the package itself. `yaml` is now bundled into `dist`, and the `agent-harness` bin bundles `clibuilder` and `@clibuilder/axi`. `clibuilder` and `@clibuilder/axi` become optional peer dependencies: install them (as a host CLI already does) to import `@cyberuni/agent-harness/commands`, which still composes into the host's own `clibuilder` instance.
