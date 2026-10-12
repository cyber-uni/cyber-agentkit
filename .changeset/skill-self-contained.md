---
"@cyberuni/agent-harness": patch
---

The `reference` skill is now self-contained across install channels. Its bundled `scripts/reference.mjs` is committed, so a git-sourced install carries it, and the skill's fallback is `pnpm exec agent-harness reference`, then `npx` pinned to this release's exact version rather than a `^` range. `plugin build` adds the pnpm skill name (`pnpm-@cyberuni+agent-harness-reference`) beside the skill's typed form in its README.
