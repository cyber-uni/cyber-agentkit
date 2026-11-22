# Doctor a skill

Examine whether a skill's references work as it is installed and configured here: on this machine, in this
repository, with the plugins and managed policy that apply. Change no file. A repair goes to the command that owns it.

## 1. Run it

Run `doctor <skills...> --format json` as `SKILL.md`'s Run the command says, with each skill's name or folder. With no
skill named, it examines every skill the harness loads here; when the author asks about one skill, name it. It checks
the harness running now. Add `--all-harnesses` when the author asks about every harness on this machine, or names one
that is not running. It exits 1 when a reference fails, and 0 when they pass or only warn.

When it reports `skill-not-found`, stop and say the name was not found among the skill folders the detected
harnesses read. When it reports `skill-ambiguous`, list the folders it printed and ask which one.

## 2. Report

The report holds one section per harness checked, under `harnesses`. When a section's `harness` is `unknown`, say
that no harness was detected, so only `SKILL.md` and what it loads were read. With more than one section, report each
under its harness's name. For each skill, give its status, then each reference it loads that failed or warned: its name, the tiers that answer
it (`answeredBy`, bottom first), the `file` on top, and each failure and warning with its message and its `action`, as
printed, then each of the skill's own `warnings`, such as where Codex ignores its Codex metadata file. Name the
passed references in one line. Pass on each of a skill's `notes`: a file it reads from outside `references/`
and `assets/` is for `check` to judge, and a harness's own file was not examined. When `unverified` says some skills
are not covered, say so.

When the author wants a repair, run the command its `action` names through the skill that owns it, such as `reference
customize` or `reference migrate` with the `reference` skill of `cyber-agentkit`. Doctor itself never runs one.
