---
"cyber-agentkit": minor
---

`skill test` contains each Claude Code run to its own folder, as the harness definition's new `containment` declares. Shell commands run in Claude Code's sandbox, the file tools stay in
the run's folder, and the network is closed except for the hosts a case lists in its new `network` field. The result
lists what a run tried and was refused under `blocked`. On macOS a run now gets an empty Claude config folder too, so
it sees none of the user's plugins or settings, and claude.ai connectors stay off. Before the first run, `skill test`
checks that a run can log in, and stops with `error: login:` saying why when it cannot, instead of failing each run
as "Not logged in". It stops with `error: sandbox:` when the sandbox cannot start. Codex runs and `--backend
plugin-eval` runs are not contained by skill test, and the test warns about it. The Claude Code login declaration
gains `keychainOn` and `status`, in place of `keepConfigDirOn` for macOS.

`skill test` also runs on Windows now: its run wrapper loaded promptfoo by a drive path, which Node refuses there.
