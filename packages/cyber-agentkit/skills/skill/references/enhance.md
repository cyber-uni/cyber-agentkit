# Enhance a skill

Suggest what would make a skill that passes `check` better, one suggestion at a time.

## 1. Start

1. Find the skill as [check](check.md) does. If the prompt names evidence that cannot be read, stop and name it.
2. Run `check`. When it fails, point to `fix`, and go on only if the author says so; with no author present, stop.
3. When the prompt asks for a different job from the skill's Intent, say so, point to `create`, and change nothing.

## 2. Gather evidence

The evidence is this session by default, or what the prompt points to: past transcripts, the harness's memory, a
saved `test` result. Read only what the harness already records. Note where each lesson appears: a lesson from use is
offered only once it has happened at least twice across everything read. Evidence that points at another skill, or at
no skill, changes nothing; say where it points.

## 3. Suggest

Review the skill against every aspect, core and open, using each aspect's Enhance, the evidence, and the prompt. For
each suggestion give the change, the aspect it touches, the reason, and the evidence it came from. Leave out any change
the skill already has, and any the author declined before for this skill.

- A trigger miss becomes a new trigger case; a wrong result becomes a new outcome case.
- A change to a core aspect reopens every core aspect after it.

## 4. Apply

At `ask` (the default), offer each suggestion on its own; the answer to one decides nothing about the others. Write only
accepted ones. With no author present, apply a suggestion only when the level allows it and `test` shows no criterion
worse than the skill's expected result, or, with none, the last saved result; when `test` cannot run, apply nothing. Never edit a skill from an installed plugin from
evidence of use: leave the suggestion for the author to send upstream.

After writing, run `check`; it passes, or [fix](fix.md)'s rule for a check that a change broke applies.

## Report

Each suggestion with its outcome: applied, declined, or left for the author with its evidence. With nothing to suggest,
say so and change nothing.
