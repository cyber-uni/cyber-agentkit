# Fix a skill

Repair what `check` or `test` found, and nothing else.

## 1. Get the failures

Use the latest `check` or `test` result in this session, or the saved `test` result (the last one `test` saved, not the expected result). With neither, run [check](check.md),
and run [test](test.md) only when the author asks, within the test budget as `SKILL.md`'s Autonomy says. With no failures, say there is nothing to fix and change nothing.

## 2. Repair each one

1. Settle the autonomy level as `SKILL.md`'s Autonomy says.
2. If the skill came from an installed plugin, say before the first edit that a plugin update will overwrite it.
3. For each failure, apply its aspect's Fix. Change only the part the failure named.
4. A repair that needs the author's decision, such as a new Intent, stops the run as Autonomy says.
5. At `apply-safe`, keep a repair only when the failed check now passes and no other check
   fails; ask about the rest.
6. When a repair makes another check fail, undo it, and report both with the options: keep it, leave it undone, or
   try another repair.

## 3. Check again

Run the failed checks again. For a skill from an installed plugin, offer to file an issue with the plugin's source,
and file none unless the author accepts.

## Report

The autonomy line; each failure: repaired, with the change, or not repaired, with the reason; each decision made on
the author's behalf; and the result of the checks run again.
