---
description: The default Criteria aspect of /skill - a skill's Criteria as a Done when list of boolean statements about its result.
tags: [skill-design, aspect, criteria]
implements: skill-design.aspects.criteria@1
check-script: ../skills/skill/scripts/check-criteria.mjs
---

## Draft

1. From the Intent, list what must be true of the result when the job is done well. Ask what a reviewer of the result
   would reject, and what the author corrected last time the job was done by hand.
2. Write each as one statement that is true or false of the result: "every merged pull request appears once", not
   "summarize the pull requests well". Name the thing in the result a reader looks at.
3. Keep only what a reader can decide from the result and the case's inputs, without seeing how the agent worked. A
   rule about how to work belongs in the steps, not here.
4. Give each an ID, `C1`, `C2`, and so on, in the order a reviewer would check them.
5. Write them as the last section of `SKILL.md`, `## Done when`, one per line: `- **C1.** <statement>`. Add one line
   before the list: "Before reporting done, check each of these against the result. Report any that fails."
6. Show the list to the author. Three to seven criteria is usual; more than ten usually means two jobs.

## Criteria

- **CRI-1** [script] `SKILL.md` has a `## Done when` section with at least one item.
- **CRI-2** [script] Each item starts with an ID `C<n>`, and no ID appears twice.
- **CRI-3** [read] Each item is true or false of the result, not a goal or a quality ("clear", "good", "well").
- **CRI-4** [read] Each item can be decided from the result and the case's inputs alone.
- **CRI-5** [read] Together the items cover the result the Intent names; nothing the Intent promises is left without
  a criterion.
- **CRI-6** [read] No item restates a rule another aspect already checks, such as the description's length.

## Fix

- CRI-1: draft the section as in Draft, and ask the author to approve it.
- CRI-2: number the items in order; a duplicate ID takes the next free one, and its rubric is renamed with it.
- CRI-3, CRI-4: rewrite the item as the observable fact the author meant, and ask the author when there are two
  readings.
- CRI-5: propose a criterion for each uncovered part of the Intent; the author decides.
- CRI-6: remove the item.

## Enhance

- A correction the user made while using the skill that no criterion catches.
- A criterion every saved result passes in the baseline run too: it does not show what the skill adds.
- A criterion that fails often with the skill: it may ask for something the steps never say.
