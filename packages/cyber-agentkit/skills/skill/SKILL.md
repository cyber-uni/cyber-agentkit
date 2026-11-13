---
name: skill
description: Use this skill when creating, checking, testing, fixing, enhancing, or customizing an agent skill (a SKILL.md and its folder), as in "write a skill for X", "is this skill any good", "run the skill's evals", "my skill doesn't trigger", or "improve this skill".
---

# Skill

Route the request to one command, load that command's file from this skill's folder, and follow it. Every command
works through the aspects below.

## Commands

| Command | Use it when | Instructions |
| --- | --- | --- |
| `help` | the author wants to know what each command does, or which one fits | [references/help.md](references/help.md) |
| `create [description]` | the author wants a new skill for a job they describe | [references/create.md](references/create.md) |
| `check [skill]` | the author wants to know whether a skill as written meets each aspect, without running it | [references/check.md](references/check.md) |
| `test [skill]` | the author wants the skill's evals run: does it fire on the right requests, and does its result meet its Criteria | [references/test.md](references/test.md) |
| `fix [skill]` | `check` or `test` found failures to repair | [references/fix.md](references/fix.md) |
| `enhance [skill] [prompt]` | the skill passes `check`, and the author wants it better, from its use or their own request | [references/enhance.md](references/enhance.md) |
| `customize [aspect]` | the author wants to see or change which implementation each aspect uses, or how much each command applies on its own | [references/customize.md](references/customize.md) |

Take an explicit command first. Otherwise read the intent from the request; if it fits two commands, ask which. With
no request, follow `help`.

## Aspects

An aspect is one step of designing a skill: what it receives, what it produces, and the checks on its output. The
core aspects, in the order `create` walks them, are Intent, Criteria, Shape, Trigger, then Verification. Every other
aspect is open: `check`, `fix`, and `enhance` use it, and `create` does not walk it.

Intent, Shape, and Trigger are written below. Criteria, Verification, and every open aspect are references a team can
swap. Load `skill-design.aspects.criteria` and `skill-design.aspects.verification` with the `reference` skill of
`cyber-agentkit`. For the open aspects, use that skill's Find mode to list `skill-design.aspects.*`, and load each name
it lists other than `criteria`, `verification`, and names ending `.interface`.

When the load reports that a chosen implementation is missing and the default answered instead, tell the author which
aspect fell back and which implementation was missing.

Each aspect's checks are listed as `- **<ID>** [<how>] <statement>`, or `- **<ID>** [<how>, warning] <statement>`.
`script` means a script decides it from the files alone, `read` means you decide it by reading the skill, and `run`
means only running the skill decides it: `check` reports it as not checked and points to `test`. A check marked
`warning` may wait; every other check is `critical`, and a failure of it must be fixed before a commit.

### Intent

Produces the opening paragraph of the skill's `README.md`, right under its `#` title: the one job the skill does, who
asks for it, and the result it hands back. It may also name the nearest job the skill does not do, when readers are
likely to confuse the two. It is for the people who keep the skill.
`SKILL.md` carries no Intent paragraph: its description, steps, and `## Done when` already tell the agent the job and
the result.

**Draft.** From the author's description (which `/skillify` may have written from work already done), write the
paragraph in four sentences or fewer. Ask the author when the job could be read two ways, and when the result is
not named.

- **INT-1** [read, warning] The opening paragraph of `README.md` names one job and the result the skill hands back.
- **INT-3** [read, warning] Nothing in the body works on a job the Intent does not name.

**Fix.** Changing the Intent is the author's decision: propose the change and ask, at every autonomy level.

### Shape

Produces the skill's folder layout: what stays in `SKILL.md`, and what moves to `references/`, `scripts/`, or `assets/`.

**Draft.** Keep everything in `SKILL.md` while its body stays under 500 lines. Move to `references/` text read only on
some paths, such as one command's steps, and link each file from the step that needs it. Move to `scripts/` any step a
program does the same way every time, such as parsing or validating a file. Propose the layout to the author.

- **SHP-1** [script, warning] The `SKILL.md` body is at most 500 lines.
- **SHP-2** [script] Every file the body links exists, and every file under `references/` is linked from the body or
  from a file it links, except a reference default (`<name>.default.md`), which is loaded by name.
- **SHP-3** [read, warning] A step that applies fixed rules to data (filtering, sorting, grouping, counting, or
  formatting) is a script, not prose, however few its rules. Judgment, such as choosing what to say, stays prose.
- **SHP-4** [read, warning] Each file under `references/` is read only on some paths; text every run needs is in
  `SKILL.md`.
- **SHP-5** [read, warning] A choice only one team would make (a host, tool, workflow, template, policy, or path) is a
  reference the skill loads, not text in the skill, unless the skill cannot work without it.
- **SHP-6** [read, warning] Each reference the skill loads ships a default, or the skill names the plugin that supplies
  it and says what it does when the name is missing.

**Fix.** Move the text or the step as Draft says, and update the links. For SHP-5, propose the reference and the
interface the skill should depend on (a new host, tracker, or workflow is then an implementation, not an edit to the
skill), and the author decides each move. Apply an approved one with the `reference` skill: Create the default, then
Wire a skill. For SHP-6, ship the default.

### Trigger

Produces the `description` in the skill's front matter, and the near misses Verification turns into `skip` cases.

**Draft.** Start with "Use this skill when", then name the job in the words users type, with two or three phrasings.
Say nothing about when not to use it. List three or more near misses: requests a user could plausibly make that
belong to the nearest other jobs. They go to Verification as `skip` cases, not into the description.

- **TRG-1** [read] The description says when to use the skill, in words a user would type.
- **TRG-3** [read, warning] It describes when to use the skill, not how the skill works.
- **TRG-4** [run] The skill fires on the requests it should and not on near misses.

**Fix.** Rewrite the description as Draft says; for TRG-4, use the failed cases in the `test` result.

## Run the command

```sh
node <this skill's folder>/scripts/skill.mjs <subcommand> ...
```

`scripts/skill.mjs` is the package's `skill` command bundled into one file. When it is missing or cannot run, use
`pnpm exec cyber-agentkit skill` when the package is a direct dependency, else `npx -y cyber-agentkit@2.3.0 skill`,
with the same arguments.

## Autonomy

Load `skill-design.autonomy` with the `reference` skill of `cyber-agentkit`. It sets one level per command:

- `ask`: propose each item; the author decides.
- `apply-safe`: apply each change after which `check` and `test` pass with no criterion worse than before; ask about
  the rest, or report them when no author is present.
- `apply`: apply every change, and report each one.

A decision only the author can make (changing the Intent, what a skill generalizes over, an aspect the description says
nothing about) is asked at every level; with no author present, report it as not applied. A level set for `check` or
`test` has no effect: say so. A level that names no known value leaves the command at its default: say so.

## Rules

- When the skill named cannot be found, stop, say where you looked, and write nothing.
- A skill that `create` writes meets the Agent Skills specification: `name` is 1 to 64 lowercase letters,
  digits, and hyphens and matches the folder; `description` is 1 to 1024 characters.
- Run no judge unless the author names one.
- In an interactive run that found failures, end `check` and `test` by offering `fix`. Change nothing unless the author
  accepts. With no author present, make no offer.
- Never edit a skill that came from an installed plugin without saying first that a plugin update will overwrite the
  change.

## Done when

Before reporting done, check each of these against the result. Report any that fails.

- **C1.** When the skill named cannot be found, the reply says where it looked, and no file changed.
- **C2.** `check` changed no file, and reported each check only a run can decide as not checked.
- **C3.** `check` reports no failure on a skill that meets every aspect, and names each check a skill fails, by its ID.
- **C4.** `create` on a name that already exists left that skill unchanged and pointed to `check`, `fix`, and `enhance`.
- **C5.** At `ask`, `create` wrote nothing the author had not approved.
- **C6.** After `fix`, the checks it repaired pass a fresh `check`.
- **C7.** `fix` reported each failure by its ID, and changed no part of the skill that no failure named, and no file
  outside it.
- **C8.** `help` named every command and `/skillify`, and changed no file.
- **C9.** `customize` showed each aspect with the implementation in use, and changed no file the author had not picked.
