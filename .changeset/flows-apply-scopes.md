---
"cyber-agentkit": minor
---

The `skill` skill's flows apply eval scopes.

- `skill check` fails an eval folder named for no instructions file (SHP-21), reads every eval folder's cases for the
  Verification checks, warns on each stale case with its scope and the input that changed or that it has no entry
  (VER-18), and lists each expected entry carried forward without a run (VER-19).
- `skill case add --scope <part>` adds an outcome case to that part's eval folder; `skill case remove` and
  `skill fails` find a case in whichever eval file lists it.
- `create` gives each part that runs on its own an instructions file and an eval folder, and every case an ID.
  `update` puts a new case in the scope it changes, proposes moving shared text that concerns only some parts, tests
  only the stale cases, and reports which scopes ran and why. `enhance` reviews how a skill is split, and `fix` tests
  the failing cases and the cases its repair made stale.
