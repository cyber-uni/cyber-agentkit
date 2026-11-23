---
name: skill
description: Create, check, test, fix, update, and enhance agent skills (a SKILL.md and its folder). Load it before adding, editing, or linking any file of a skill (its SKILL.md, or a file under its references/, scripts/, assets/, or evals/) or a reference a skill loads, during any work, such as implementing an issue or fixing a bug, even when the request never says "skill". Also customize, vet, or report on a skill, standalone or inside a plugin or npm package, as in "write a skill for X", "add a skill to this plugin", "teach agents to use our library", "is this skill any good", "do this skill's references work here", "run the skill's evals", "publish the skill's eval results on its docs page", "my skill doesn't trigger", "improve this skill", "is this skill from GitHub safe to install", "switch an aspect's implementation", and before handing skill writing to a subagent. Take it over aced:define-skill and aced:improve-skill.
argument-hint: "<description> | help | create [description] | check [skill] | doctor [skills...] | test [skill] | fix [skill] | update [skill] [change] | enhance [skill] [prompt] | vet <source> | attest [skill] <criterion or case> <link> | fails [skill] [case] [criterion] | report [skill] | customize [aspect]"
metadata:
  references: skill-design.autonomy skill-design.vet.trusted-sources
  reference-interfaces: skill-design.aspects.criteria skill-design.aspects.verification skill-design.aspects.research skill-design.aspects.security
---

# Skill

Route the request to one command, load that command's file from this skill's folder, and follow it. A `create`, `fix`,
`update`, or `enhance` reply opens with its `Autonomy:` line (see Autonomy), even when the run stops before any change.

## Commands

| Command | Use it when | Instructions |
| --- | --- | --- |
| `help` | the author wants to know what each command does, or which one fits | [help.md](references/help.md) |
| `create [description]` | the author wants a new skill for a job they describe | [create.md](references/create.md) |
| `check [skill]` | the author wants to know whether a skill as written meets each aspect, without running it | [check.md](references/check.md) |
| `doctor [skills...]` | the author wants to know whether a skill's references work as installed and configured here, such as after a repository override or a plugin update | [doctor.md](references/doctor.md) |
| `test [skill]` | the author wants the skill's evals run: does it fire on the right requests, and does its result meet its Criteria | [test.md](references/test.md) |
| `fix [skill]` | `check` or `test` found failures to repair | [fix.md](references/fix.md) |
| `update [skill] [change]` | other work edits an existing skill: a request, an issue, a bug | [update.md](references/update.md) |
| `enhance [skill] [prompt]` | the skill passes `check`, and the author wants it better, from its use or their own request | [enhance.md](references/enhance.md) |
| `vet <source>` | the author wants a third-party skill vetted before installing it: its Security checks, an install verdict, and who publishes it | [vet.md](references/vet.md) |
| `attest [skill] <criterion or case> <link>` | the author saw a criterion or case pass in the skill's real use and names the link, for a check a run cannot judge cheaply | [attest.md](references/attest.md) |
| `fails [skill] [case] [criterion]` | the author names a case or criterion known to fail, with the reason, or wants the marks listed or one cleared | [fails.md](references/fails.md) |
| `report [skill]` | the author wants a skill's eval results in its docs or README, or as JSON | [report.md](references/report.md) |
| `customize [aspect]` | the author wants to see or change which implementation each aspect uses, or how much each command applies on its own | [customize.md](references/customize.md) |

Take a named command first. When the request describes a skill to write but names no command, as in `/skill a
skill for release notes`, follow `create`. Otherwise read the intent
from the request; if it fits two commands, ask which. With no request, follow `help`.

When other work adds a skill, such as implementing an issue, follow `create`. When it edits an existing one, follow
`update`.

## Aspects

An aspect is one step of designing a skill: what it receives, what it produces, and the checks on its output. The
core aspects, in the order `create` walks them, are Intent, Criteria, Shape, Trigger, then Verification. Every other
aspect is open: `check`, `fix`, and `enhance` use it, and of them `create` walks only Research.

Intent, Shape, and Trigger are written below. Criteria, Verification, and every open aspect are references a team can
swap. Load the implementations of the interfaces `skill-design.aspects.criteria` and `skill-design.aspects.verification`
with the `reference` skill of `cyber-agentkit`. For the open aspects, the built-in ones are the interfaces
`skill-design.aspects.research` and `skill-design.aspects.security`; use that skill's Find mode to list
`skill-design.aspects.*` for any a team added, and load each name it lists other than `criteria`, `verification`, and
names ending `.interface`.

When a load reports a chosen implementation missing, tell the author which aspect fell back to its default.

Each aspect lists its checks as `- **<ID>** [<how>] <statement>`; a warning check adds `, warning` after `<how>`.
`script`: a script decides it from the files alone; `read`: you decide it by reading the skill; `run`: only running
the skill decides it ([test](references/test.md)). A check marked
`warning` may wait; every other check is `critical`, and a failure of it must be fixed before a commit.
The Fix for a failed check of Shape or Trigger is in [fix](references/fix.md#core-aspect-fixes).

### Intent

Produces the opening paragraph of the skill's `README.md`, right under its `#` title: the one job the skill does, who
asks for it, and the result it hands back. It may also name the nearest job it does not do, when readers
could confuse the two. It is for the people who keep the skill; `SKILL.md` carries no Intent paragraph.

- **INT-1** [read, warning] The opening paragraph of `README.md` names one job and the result the skill hands back.
- **INT-3** [read, warning] Nothing in the body works on a job the Intent does not name, says again what another part
  of the skill already says, or composes a skill, reference, or command that no longer exists or no longer does what
  the body expects.

**Fix.** Changing the Intent is the author's decision: propose the change and ask, at every autonomy level. Removing a
repeat or a stale reference under INT-3 is not a change to the Intent.

### Shape

Produces the skill's folder layout: what stays in `SKILL.md`, and what moves to `references/`, `scripts/`, or `assets/`.

**Draft.** Keep everything in `SKILL.md` while its body stays under 500 lines. Move to `references/` text read only on
some paths, such as one command's steps, and link each file from the step that needs it. Move to `scripts/` any step a
program does the same way every time, such as parsing or validating a file.

- **SHP-1** [script, warning] The `SKILL.md` body is at most 500 lines and about 5,000 tokens, at four characters a
  token.
- **SHP-2** [script] Every file the body links, or names as a plain-text path under `scripts/`, `references/`, or
  another of its folders, exists; every `#anchor` it links matches a heading; and every file under `references/` is
  linked from the body or from a file it links, except a reference default (`<name>.default.md`), which is loaded by
  name.
- **SHP-3** [read, warning] A step that applies fixed rules to data (filtering, sorting, grouping, counting, or
  formatting) is a script, not prose, however few its rules. Judgment, such as choosing what to say, stays prose.
- **SHP-4** [read, warning] Each file under `references/` is read only on some paths, and the step that loads it says
  when; text every run needs is in `SKILL.md`, and large reference material (long tables, examples, or catalogs) is
  under `references/`.
- **SHP-5** [read, warning] A choice only one team would make (a host, tool, workflow, template, policy, or path) is a
  reference the skill loads, not text in the skill, unless the skill cannot work without it.
- **SHP-6** [read, warning] Each reference the skill loads ships a default, or the skill names the plugin that supplies
  it and says what it does when the name is missing.
- **SHP-7** [script] `SKILL.md` sits in its own folder, directly under a skill root: a folder named `skills`.
- **SHP-8** [script] A skill that ships to others (its `skills` root is not inside a dot-folder such as `.agents/`)
  links and names no file outside its folder: no `../` path that leaves it, and no repository path such as `docs/` or
  `src/`.
- **SHP-9** [script] `skill.json`, when present, is a JSON object, and its `distribution`, when present, sets
  `install_via` to `package_manager` with a `package.name`.
- **SHP-10** [script, warning] The skill folder holds no folder but `scripts/`, `references/`, `assets/`, `evals/`, and
  `agents/`, and `agents/` holds YAML files only.
- **SHP-11** [script, warning] Static resources (images, data files, templates) are in `assets/`, and the root of the
  skill folder holds no Markdown file but `SKILL.md` and `README.md`.
- **SHP-12** [script, warning] The body gives the agent steps to follow: numbered steps or `##` sections.
- **SHP-13** [script, warning] When the skill bundles scripts, no Markdown the agent reads tells it to parse a script's
  output; a script prints what the agent needs, or JSON.
- **SHP-14** [script, warning] A script that prompts the user takes a `--yes` flag, and the skill's Markdown documents
  it.
- **SHP-15** [read, warning] The body gives no instruction the model would follow without it, such as "be thorough" or
  "write clean code", and does not open with a paragraph that repeats the description.
- **SHP-16** [read, warning] The body has no `## Why`, `## Rationale`, or `## Next Steps` section.
- **SHP-17** [read, warning] Where a step could be done more than one way, it names one default and when to leave it,
  not a menu of options to choose from.
- **SHP-18** [read, warning] Each script or command the body runs writes machine output to stdout, in the format the
  body asks for, and prints prose only behind `--verbose`.
- **SHP-19** [read, warning] Where the body loads a reference the `reference` skill composes, it says to load it with
  that skill, and reads the reference's bundled `<name>.default.md` directly only as the fallback for when the command
  cannot run.
- **SHP-20** [script, warning] The front matter declares each reference the skill loads under `metadata.references`,
  and each interface whose implementations it loads under `metadata.reference-interfaces`, as one string of names
  separated by spaces; every declared name is mentioned in backticks where it is loaded, and the text loads no name the
  lists leave out.
- **SHP-21** [script] Each eval folder, a folder under `evals/` holding an `evals.yaml`, is named for an instructions
  file: `evals/<name>/` holds the cases of `references/<name>.md`.

### Trigger

Produces the `description` in the skill's front matter, and the near misses Verification turns into `skip` cases.

**Draft.** Draft the description, near misses included, as [trigger-draft.md](references/trigger-draft.md) says.

**Name-only skill.** A skill that another skill loads by name, and that no user request should match, is name-only. Its
description declares it: exactly `By name only`, or `Partial Skill: ` followed by text. Write exactly `By name only`, and put what the skill is, who calls
it, and what it returns in the body and `README.md`. Its near misses still go to Verification as `skip` cases. TRG-1,
TRG-4, TRG-7, TRG-9, and TRG-10 do not apply to a name-only skill, and TRG-5 and TRG-6 apply only to one: report a check that
does not apply as skipped.

- **TRG-1** [read] The description says when to use the skill, in words a user would type, with no lead-in or filler
  words, unless the skill is user-only.
- **TRG-3** [read, warning] It describes when to use the skill, not how the skill works.
- **TRG-4** [run] The skill fires on the requests it should and not on near misses.
- **TRG-5** [script] A name-only skill's description is exactly `By name only`, or `Partial Skill: ` followed by text
  with no trigger phrase, such as "use when" or "when to use".
- **TRG-6** [read, warning] A name-only skill's description carries no operational detail (what it does, who calls it, or how
  it works) and no trigger language.
- **TRG-7** [script, warning] The description is at least 12 words, and uses no phrase that fits any skill, such as
  "helps with" or "various tasks".
- **TRG-8** [read, warning] It matches the body: each command, file, or skill it names exists and does what it says.
- **TRG-9** [script, warning] A skill whose body documents the arguments it takes (a command table whose commands take
  arguments, an `Arguments:` line or heading, or `$ARGUMENTS`) declares an `argument-hint` in its front matter.
- **TRG-10** [script, warning] The description's first sentence is at most 100 characters and opens with what the
  skill does, not a lead-in.

## Run the command

```sh
node <this skill's folder>/scripts/cyber-agentkit.mjs skill <subcommand> ...
```

Run it from the working folder, by the script's path. Never `cd` into this skill's folder or its plugin's, not even
for one command: either may be read-only, and a shell left there fails every later command.

## Autonomy

Never decide whether an author is present: the level decides where a run stops.

`create`, `fix`, `update`, and `enhance` each run at one level:

- `ask`: propose each item, and stop for the answer before writing it.
- `apply-safe`: apply each change after which `check` and `test` pass with no criterion worse than before; stop and ask
  about the rest.
- `apply`: apply every change, and report each one.

Settle the level before anything else, taking the first that answers. Open every reply with it as one line, written
exactly `Autonomy: <level> (<source>: <reason>)`, even when the run stops or changes nothing:

1. `author`: the request names a level, or says to apply without asking ("I approve every change") or to ask first.
   Other work that adds or edits a skill, as Commands says, is the approval to apply: take `apply`, or `apply-safe` on
   a skill from an installed plugin.
2. `reference`: load `skill-design.autonomy` with the `reference` skill of `cyber-agentkit`; the level it sets for the
   command answers. Its shipped default is `apply` for `create` and `update`, `apply-safe` for `fix`, and `ask` for `enhance`. An
   unknown level, such as `derive`, is ignored: say so, and take the shipped default.

A level set for `check` or `test` does nothing: say so.

Report each decision made for the author,
such as a name or a place: what was chosen, why, and whether `check` and `test` showed it safe or it
was applied on that reason alone.

### Stops

A run stops only where its level says to ask, for a `test` over the budget, and for a decision only the author can
make: changing the Intent (such as adopting or extending an existing skill that Research found), what a skill
generalizes over, an aspect the description says nothing about, or removing or weakening a `## Done when` criterion. A Criteria fix that makes a criterion checkable keeps what it asks for: it is
not weakening it. A request naming such a change still stops: say what it changes, and ask.

A stop is the same every time:

1. Keep every part already written, and apply nothing that depends on the answer.
2. Report the work done so far.
3. End with the question and its options, each lettered. For a `test` over the budget, give the run count, the
   estimate, and how long the last run took, with the options to run it all, run some cases (`--case`), or not run it.

## Rules

- When the skill named cannot be found, stop, say where you looked, and write nothing.
- Pass `--judge` only for a judge the author named, and `--no-judge` only when the author asks to run without one.
- When `check` or `test`, run as the command asked, finds failures, end by offering `fix`, and change nothing unless the
  author accepts. When another command runs them, it goes on as its own steps say.
- Before editing a skill from an installed plugin, say that a plugin update will overwrite the change.

## Done when

Before reporting done, check each against the result, and report any that fails.

- **C1.** When the skill named cannot be found, the reply says where it looked, and no file changed.
- **C2.** `check` changed no file, and reported each check only a run can decide as not checked.
- **C3.** `check` reports no failure on a skill that meets every aspect, and names each check a skill fails, by its ID.
- **C4.** `create` on a name that already exists left that skill unchanged and pointed to `check`, `fix`, and `enhance`.
- **C5.** At `ask`, or when the author asked to approve each part, `create` wrote nothing the author had not approved.
- **C6.** After `fix`, the checks it repaired pass a fresh `check`.
- **C7.** `fix` named each failure by its ID or in words, and changed no part of the skill that no failure named,
  and no file outside it.
- **C8.** `help` named every command and `/skillify`, and changed no file.
- **C9.** `customize` showed each aspect with the implementation in use, and changed no file the author had not picked.
- **C10.** `vet` installed nothing, left no checkout behind, reported the install blocked on every critical failure and
  on every warning from a source no trusted entry covers, and showed no number but a skills.sh count as installs.
- **C11.** `create` ran `check` on the skill it built, then estimated `test` as [test](references/test.md) says, stated the
  estimate's `line`, and, within the budget, started `test` without asking.
- **C12.** When other work added a skill, the skill was written in the same run without asking about each aspect,
  and `check` ran on it before the work was reported done.
- **C13.** Each `create`, `fix`, `update`, and `enhance` reply opened with the line `Autonomy: <level> (<source>: <reason>)`, even
  when the run stopped before any change.
- **C14.** A `test` estimated over the budget, as `skill-design.autonomy` sets it, started no run, the skill written so far stayed on disk, and the reply
  ended by asking whether to run it, giving the run count, the estimate, and the options.
- **C15.** A decision only the author can make stopped the run at every level: nothing that depends on it changed, and
  the reply reported the work done so far, then ended with the decision and its options.
- **C16.** No run decided whether an author is present: the level came from the request or `skill-design.autonomy`,
  and the run stopped only where Autonomy's Stops says.
- **C17.** `create` ran Research before it wrote Criteria: the skill's `README.md` has a `## Research` section, or,
  when an existing skill covers the job, the run wrote no `SKILL.md`, named that skill, and asked whether to adopt it.
- **C18.** When SHP-1 failed, `fix` named each way to trim that applies with the tokens it saves, and at `ask` changed
  no file before the author picked.
- **C19.** Sandbox failures were reported as uncounted, a held result as unsaved until `skill accept`, with no `fix`.
- **C20.** `report` wrote the results as `skill report` printed them, and changed no other file.
- **C21.** New cases came from `skill case`, history in setup scripts.
- **C23.** On `error: sandbox:`, the folder-only sandbox was offered, not taken.
- **C24.** A result's `sandbox` and each `wroteOutside` path were said before any pass rate.
- **C25.** `update` and `fix` each ended with the final `check` result and the `test` result per criterion, or the estimate's `line`
  and why `test` did not run.
- **C26.** A pass was attested only on the author's request naming its target and link, and then with `skill attest`.
- **C27.** A known failure was marked only on the author's request with its reason, and then with `skill fails`.
- **C28.** `doctor` changed no file, and named each reference that failed or warned with the file on top and the action it printed.
- **C29.** `create` gave each part that runs on its own an instructions file and an eval folder, and each case an `id`.
- **C30.** `update` tested only the stale cases, and its report named each scope that ran with why.
- **C31.** `migrate` showed its plan and wrote nothing unasked.
