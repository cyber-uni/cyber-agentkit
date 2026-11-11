# Fix a skill

Repair what `check` or `test` found, and nothing else.

## 1. Get the failures

Use the latest `check` or `test` result in this session, or the saved `test` result (the last one `test` saved, not the expected result). With neither, run [check](check.md),
and run [test](test.md) only when the author asks. With no failures, say there is nothing to fix and change nothing.

## 2. Repair each one

1. If the skill came from an installed plugin, say before the first edit that a plugin update will overwrite it.
2. For each failure, apply its aspect's Fix. Change only the part the failure named.
3. A repair that needs the author's decision, such as a new Intent, is asked; with no author present, report it as not
   repaired.
4. At `apply-safe` (the default for `fix`), keep a repair only when the failed check now passes and no other check
   fails; ask about the rest.
5. When a repair makes another check fail, show both to the author, who keeps it, undoes it, or asks for another
   repair. With no author present, undo it and report both.

## 3. Check again

Run the failed checks again. For a skill from an installed plugin, offer to file an issue with the plugin's source;
with no author present, file none.

## Report

Each failure: repaired, with the change, or not repaired, with the reason; and the result of the checks run again.
