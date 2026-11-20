---
'cyber-agentkit': patch
---

The `skill`, `instruction`, and `prose-update` skills run the CLI through a small forwarding script,
`scripts/cyber-agentkit.mjs`, in place of a 599 KB compiled copy. In a checkout it runs the checkout's
CLI, so testing a skill exercises your change; elsewhere it runs the release that matches the plugin.
The skills call it as `node <skill folder>/scripts/cyber-agentkit.mjs <command> ...` and no longer
carry a `pnpm exec` or `npx` fallback.

`bin/cyber-agentkit.mjs` now imports `dist/cli.js` by a literal relative path. The forwarder uses that
path to see that a git-sourced install has no build output, and runs the published release instead.
