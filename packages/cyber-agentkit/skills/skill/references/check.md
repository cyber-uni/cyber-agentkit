# Check a skill

Read the skill against every aspect without running it. Change no file, and run no part of the skill.

## 1. Find it

Take a path, or a name looked up in the repository's and the user's skills folders. If it cannot be found, stop and
say where you looked.

## 2. Run the script checks

Run `node <this skill's folder>/scripts/skill-check.mjs <skill folder>`. It reports the Agent Skills specification
checks and every `script` check of the chosen implementations, and lists the rest as not checked. When the script is
missing or cannot run, decide the `script` checks yourself by reading the files.

## 3. Decide the rest

For each aspect, core and open, decide each `read` check by reading the skill. Report each `run` check as not checked,
pointing to `test`, never as a pass. A skill that fails the Agent Skills specification still gets every aspect checked.

## Report

One line per aspect: pass, fail, or not checked. Under each fail, the check's ID, its statement, and the part of the
skill that breaks it, quoted with its file. In an interactive run with failures, offer `fix`.
