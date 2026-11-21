# Doctor a skill

Examine whether a skill's references work as it is installed and configured here: on this machine, in this
repository, with the plugins and managed policy that apply. Change no file. A repair goes to the command that owns it.

## 1. Run it

Run `doctor <skills...> --format json` as `SKILL.md`'s Run the command says, with each skill's name or folder. With no
skill named, it examines every skill the detected harnesses load here; when the author asks about one skill, name it.
It exits 1 when a reference fails, and 0 when they pass or only warn.

When it reports `skill-not-found`, stop and say the name was not found among the skill folders the detected
harnesses read. When it reports `skill-ambiguous`, list the folders it printed and ask which one.

## 2. Report

For each skill, give its status, then each reference it loads that failed or warned: its name, the tiers that answer
it (`answeredBy`, bottom first), the `file` on top, and each failure and warning with its message and its `action`, as
printed. Name the passed references in one line. When `note` or `unverified` says some skills are not covered, say so.

When the author wants a repair, run the command its `action` names through the skill that owns it, such as `reference
customize` or `reference migrate` with the `reference` skill of `cyber-agentkit`. Doctor itself never runs one.
