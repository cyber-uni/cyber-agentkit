---
"@cyberuni/agent-harness": minor
---

Add `removeWorktree` to `./worktrees`: remove one caller-named worktree by path, with an explicit `force` that maps to `git worktree remove --force`. It returns the same outcome and skip reason as `pruneWorktrees`. It never removes the primary checkout or a leased worktree, and never kills a process. `force: true` waives the foreign, prunable, dirty, and unmerged checks but still skips a busy worktree, or one whose process probe cannot be verified, with its reason. `force: 'in-use'` does everything `true` does and also removes busy and unverified worktrees, reporting the occupants. Unlike git's `--force-with-lease` (a safer force), `'in-use'` is the stronger one.
