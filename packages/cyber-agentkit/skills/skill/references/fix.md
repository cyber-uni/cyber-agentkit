# Fix a skill

Repair what `check` or `test` found, and nothing else. Settle the autonomy level as `SKILL.md`'s Autonomy says before
step 1, so the reply opens with the autonomy line even when the run stops before any repair.

## 1. Get the failures

Use the latest `check` or `test` result in this session, or the saved `test` result (the last one `test` saved, not the expected result). With neither, run [check](check.md),
and run [test](test.md) only when the author asks, within the test budget as `SKILL.md`'s Autonomy says. With no failures, say there is nothing to fix and change nothing.

## 2. Repair each one

1. If the skill came from an installed plugin, say before the first edit that a plugin update will overwrite it.
2. For each failure, apply its aspect's Fix. Change only the part the failure named.
3. A repair that needs the author's decision, such as a new Intent, stops the run as Autonomy says.
4. At `apply-safe`, keep a repair only when the failed check now passes and no other check
   fails; ask about the rest.
5. When a repair makes another check fail, undo it, and report both with the options: keep it, leave it undone, or
   try another repair.

### SHP-1: ways to trim

Before changing anything, estimate what each way to trim that applies saves, at four characters a token, naming the
sections it touches:

1. **Drop dead text**: text for a command, option, or case the skill no longer has.
2. **Move to a reference**: a section only one command or case reads moves to its own file under `references/`, and
   the body says when to load it. It saves the most when the skill serves several commands.
3. **Tighten the prose**: cut what SHP-15 names, repeats, and explanations of reasons, and shorten sentences without
   changing what the agent does. Never cut or weaken a `## Done when` criterion.
4. **Move checkable detail to a script**: a rule a script or test can decide moves there, and the prose keeps a
   one-line pointer to it.

At `ask`, offer each one, lettered, with its estimate, and apply only what the author picks. At `apply-safe` and
`apply`, apply them in that order until SHP-1 passes, keeping each only when `test` is no worse.

## 3. Check again

Run the failed checks again. For a skill from an installed plugin, offer to file an issue with the plugin's source,
and file none unless the author accepts.

## Report

The autonomy line; each failure: repaired, with the change, or not repaired, with the reason; each decision made on
the author's behalf; and the result of the checks run again.
