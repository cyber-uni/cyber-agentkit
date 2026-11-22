# Fix a skill

Repair what `check` or `test` found, and nothing else.

## 1. Settle the autonomy level

Settle it as `SKILL.md`'s Autonomy says, before anything else. Write the `Autonomy:` line now, and again as the first
line of the reply that ends the run, even when an earlier message stated it; a run that stops before any repair, or
finds nothing to repair, still opens with it.

## 2. Get the failures

Use the latest `check` or `test` result in this session, or the saved `test` result (the last one `test` saved, not the expected result). With neither, run [check](check.md),
and decide each `read` check it lists as not checked, by its ID, as its step 3 says, before the first repair: the
failures are every `script` and `read` check that failed. Run [test](test.md) only when the author asks, within the test budget as `SKILL.md`'s Autonomy says. With no failures, say there is nothing to fix and change nothing.

A criterion or trigger case marked known to fail ([fails](fails.md)) is a failure to repair when the author names it
as the target. Once `test` reports it `fixed?`, offer to clear the mark, and clear it only on yes; never clear one
that still fails, and never add one to make `test` pass.

## 3. Repair each one

1. If the skill came from an installed plugin, say before the first edit that a plugin update will overwrite it.
2. For each failure, apply its aspect's Fix: for Shape and Trigger, the one under
   [Core aspect fixes](#core-aspect-fixes); for Intent, its Fix in `SKILL.md`; for any other aspect, the Fix in its
   reference. Change only the part the
   failure named.
3. A repair that needs the author's decision, such as a new Intent, stops the run as Autonomy says.
4. At `apply-safe`, keep a repair only when the failed check now passes and no other check
   fails; ask about the rest.
5. When a repair makes another check fail, undo it, and report both with the options: keep it, leave it undone, or
   try another repair.

### Core aspect fixes

The Fix for Shape and Trigger, the core aspects `SKILL.md` writes out. "Draft" names that aspect's Draft in `SKILL.md`.

**Shape.** Move the text or the step as Draft says, and update the links. For SHP-1, offer the ways to trim in
[SHP-1: ways to trim](#shp-1-ways-to-trim). For SHP-5, propose the reference and the interface the skill should depend
on, and the author decides each move. Apply an approved one with the `reference` skill: Create the default, then Wire a
skill. For SHP-6, ship the default. For SHP-7 to SHP-11, move the file or folder the check names, and update what links
or names it. For SHP-12, write the body as steps or sections. For SHP-13, make the script print what the step needs,
and point the step at that. For SHP-14, add the flag. For SHP-15 and SHP-16, delete the text. For SHP-17, keep as the
default the option most runs need, and name the condition under which the step does otherwise. For SHP-18, move the
prose to stderr or behind `--verbose`. For SHP-19, make the step load the reference through the `reference` skill, and
keep the default only as the fallback; `fix` and `enhance` never replace a reference load with a direct read. For
SHP-20, declare the loads in the front matter as the `reference` skill's Wire a skill says: add each name the check
reports to the list, and take out a declared name the text no longer loads.

**Trigger.** Rewrite the description as Draft says; for TRG-4, use the failed cases in the `test` result. For TRG-5 and
TRG-6, set the description to exactly `By name only` and move what it said to the body or `README.md`. For TRG-7, name
the job and the words users type for it. For TRG-8, change whichever of the description and the body is out of date.
For TRG-9, add an `argument-hint` that lists what the user types, such as `"<command> [skill]"`. For TRG-10, rewrite the
first sentence as Draft says.

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

## 4. Check again

Run [check](check.md) again in full. Then pick the cases to test: the cases that failed, and the cases the repair
made stale, which `skill test <skill folder> --estimate --format json` lists in `selected.stale`. Name each with
`--case`, not every case. Estimate that run against the test budget as `SKILL.md`'s Autonomy says, and write the
`Test budget:` line. Within the budget, run [test](test.md) without asking, so the report holds the latest result.
Over it, stop as Stops says, keeping every repair. For a skill from an installed plugin, offer to file an issue with the plugin's source,
and file none unless the author accepts.

## Report

Open with the `Autonomy:` line, then each failure `check` or `test` found: repaired, with the change, or not repaired, with the reason; each decision made on
the author's behalf. End with the latest `check` result (each failing ID with its severity) and the `test` result per
criterion and per trigger case; when `test` did not run, give the `Test budget:` line or the reason it could not. Show
both even when every check passed.
