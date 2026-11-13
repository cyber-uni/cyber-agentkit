# Check a skill

Read the skill against every aspect without running it. Change no file, and run no part of the skill.

## 1. Find it

Take a path, or a name looked up in the repository's and the user's skills folders. If it cannot be found, stop and
say where you looked.

## 2. Run the script checks

Run `check <skill folder> --format json` as `SKILL.md`'s Run the command says. It reports the Agent Skills
specification checks and every `script` check of the chosen implementations, running each one's check script, and
lists the rest as not checked. It exits 1 when a check fails; with `--fail-on critical`, as CI runs it, only when a
critical one fails. When no form of the command can run, decide the `script`
checks yourself by reading the files. The same command runs in CI.

## 3. Decide the rest

For each aspect, core and open, decide each `read` check by reading the skill. Report each `run` check as not checked,
pointing to `test`, never as a pass. A skill that fails the Agent Skills specification still gets every aspect checked.

To decide SHP-5 and SHP-6, run the `reference` skill's `audit <skill folder>` (its Audit mode, steps 1 to 3). It lists
pattern leads with their lines and the references the skill loads with no default. A lead is a candidate, not a failure:
SHP-5 fails only for a choice you judge another team would make differently. Changes nothing.

## Report

One line per aspect: pass, fail, or not checked. Under each fail, the check's ID, its severity (`critical` or
`warning`), its statement, and the part of the skill that breaks it, quoted with its file. List the critical failures
first: they must be fixed before a commit. In an interactive run with failures, offer `fix`.
