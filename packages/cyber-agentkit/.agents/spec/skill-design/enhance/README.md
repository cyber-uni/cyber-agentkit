---
spec-type: behavioral
status: draft
---

# skill-design/enhance — an author gets suggestions to improve a skill that passes, and applies only the ones they accept

Part of [skill-design](../README.md). Its What, non-goals, key terms, actors, every-command criteria, and aspect
contract apply here; IDs are shared across the parent and its children.

## Use cases

### UC5 — Suggest enhancements to a skill (A1.5, A2.1)

- **Trigger:** the skill passes `check`, and the author wants to know what could make it better. They may have evidence
  from using it, such as a run that went wrong or a correction they made, or a request of their own.
- **Entry points:** skill (primary): `/skill enhance [skill] [prompt]`.
- **Inputs:** the skill; an optional prompt, which is a focus ("make it safer"), a request ("also draft the changelog
  entry"), or a pointer to evidence; evidence of use, the current session by default; the selected implementation for
  each aspect.
- **Success:** `/skill` reviews the skill against every aspect, and against the evidence and the prompt when there are
  any. It offers each suggestion on its own, with the change, the aspect it touches, and the reason; a suggestion that
  came from evidence cites it. A suggestion the skill already covers is not offered. The author's answer to one
  suggestion decides nothing about the others. Only accepted suggestions are written, and a change to a core aspect
  reopens the core aspects after it, as in UC1.2. `check` passes afterwards. With no author present, `/skill` applies
  only what the autonomy setting allows (UC10) and reports the rest.
- **Extensions:**
  - **UC5.1** The skill cannot be found. `/skill` stops and names what it looked for.
  - **UC5.3** The skill fails `check`. `/skill` points to `fix`, and continues only if the author says so.
  - **UC5.4** An accepted suggestion makes a criterion fail. Handled as in UC4.4.
  - **UC5.5** There is nothing to suggest. That is reported, and the skill is unchanged.
  - **UC5.6** The selected implementation for an aspect cannot be found. The default is used, as in UC1.3.
  - **UC5.7** The request describes a different job from the skill's Intent. `/skill` says so and points to `create`.
  - **UC5.9** The prompt names evidence that cannot be read. `/skill` stops and names it.
- **Example:** after a run in which the author told the skill to leave out merge commits, `/skill enhance
  release-notes` suggests a criterion excluding them, citing that correction, and Security suggests asking before the
  skill posts to GitHub. The author accepts both.

### UC7 — Improve a skill from its own use (A2.1)

- **Trigger:** while or after using a skill, the agent sees evidence that the skill could be better: the user corrected
  the result, a step failed or was worked around, or the skill fired when it should not have, or did not when it
  should.
- **Entry points:** skill (primary): `/skill enhance [skill] [prompt]`, run by the agent with that evidence (UC5). When
  the loop runs is out of scope (N3).
- **Inputs:** the evidence, from what the harness already records (the session where the skill ran, past transcripts,
  its memory store), with no hooks required; the skill; the autonomy setting (UC10).
- **Success:** the evidence becomes suggestions, as in UC5. A lesson is offered only once it has occurred at least
  twice. A trigger miss also becomes a new trigger eval case, and a wrong result a new outcome case, so the same
  failure is tested from then on. A suggestion is applied only when the autonomy setting allows it and `test` shows no
  criterion worse than the last result; every other suggestion is left for the author, citing its evidence.
- **Extensions:**
  - **UC7.1** The evidence points at another skill, or at no skill (for example a fault in the harness). Nothing
    changes, and the report says where the evidence points.
  - **UC7.2** `test` cannot run, for example because there are no cases or the budget ran out. The change is not
    applied, and is left as a suggestion.
  - **UC7.3** The change makes a criterion worse than the last result. The change is not applied, as in UC4.4 with no
    author present.
  - **UC7.4** The skill came from an installed plugin. The skill is not edited, because a plugin update would overwrite
    the change; the suggestion is left for the author to contribute upstream.
- **Example:** in one session the user tells the agent twice to leave out merge commits. At the end the agent runs
  `enhance` with that session; it adds a "no merge commits" criterion and a case for it, `test` shows the criterion
  passing and nothing worse, and the change is applied within the autonomy setting and reported.

## Criteria

**Enhance and self-improvement (UC5, UC7)**

- R44 (UC5): `enhance` reviews the skill against every aspect installed, core and open.
- R45 (UC5): Each suggestion is offered on its own, with the change, the aspect it touches, and the reason. A
  suggestion drawn from evidence cites it.
- R46 (UC5): No suggestion repeats a change the skill's text already has, or one the author declined earlier for this
  skill.
- R47 (UC5): Only accepted suggestions are written, and the answer to one decides nothing about the others.
- R48 (UC5): A written change to a core aspect reopens every core aspect after it, as in R8.
- R49 (UC5): After `enhance` writes, `check` passes, or R42 applies.
- R50 (UC5.3): When the skill fails `check`, `enhance` points to `fix` and goes on only if the author says so. With no
  author present, it stops.
- R51 (UC5.5): With nothing to suggest, `enhance` says so and leaves the skill unchanged.
- R52 (UC5.7): When the request describes a different job from the skill's Intent, `enhance` says so, points to
  `create`, and leaves the skill unchanged.
- R53 (UC5.9): When the prompt names evidence that cannot be read, `enhance` stops and names it.
- R54 (UC7): A lesson from evidence of use is offered only once it occurs at least twice across all the evidence
  read, whether in one session or several.
- R55 (UC7): A trigger miss adds a trigger eval case, and a wrong result adds an outcome case.
- R56 (UC7): A suggestion is applied without the author only when the autonomy level allows it and `test` shows no
  criterion worse than the skill's expected result, or, with none, the last saved result. Every other suggestion is left for the author, citing its evidence.
- R57 (UC7): Evidence is read from what the harness already records, with no hook installed.
- R58 (UC7.1): Evidence that points at another skill, or at no skill, changes nothing, and the report says where it
  points.
- R59 (UC7.2): When `test` cannot run, the change is not applied and is left as a suggestion.
- R60 (UC7.4): A skill that came from an installed plugin is not edited from evidence of use; the suggestion is left
  for the author to contribute upstream.
