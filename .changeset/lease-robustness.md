---
'@cyberuni/agent-harness': minor
---

`release` now clears the lock of a leased worktree whose directory is gone, so `git worktree prune` can take it: a `Lease` records its repo's `commonDir` at claim. `acquire` takes an `undoCreate` callback, called when a slot its creator made loses the lease claim, so the creator's side effects (such as a herdr workspace) do not pile up across retries.
