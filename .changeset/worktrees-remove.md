---
"@cyberuni/agent-harness": minor
---

Add `removeWorktree` to `./worktrees`: remove one caller-named worktree by path, with an explicit `force` that maps to `git worktree remove --force`. It returns the same outcome and skip reason as `pruneWorktrees`. It never removes the primary checkout or a leased worktree, force or not; `force` waives the foreign, busy, prunable, dirty, and unmerged checks, and never kills a process.
