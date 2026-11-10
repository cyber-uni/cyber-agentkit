---
spec-type: behavioral
status: draft
---

# skill-design/fix — the failures that check or test found are repaired

Part of [skill-design](../README.md). Its What, non-goals, key terms, actors, every-command criteria, and aspect
contract apply here; IDs are shared across the parent and its children.

## Use cases

### UC4 — Fix what check or test found (A1.4)

- **Trigger:** failures were reported, by a `check` or `test` run that just ended or by an earlier result, and the
  author, or an agent, wants them repaired.
- **Entry points:** skill (primary): `/skill fix [skill]`, or accepting the offer at the end of `check` or `test`.
- **Inputs:** the skill; the failures, from the latest `check` or `test` result in the session, or else from running
  `check`, and `test` only when the author asks for it; the selected implementation for each aspect; optionally, a
  judge.
- **Success:** each failure is repaired, or reported as not repaired with the reason. Each change touches only what a
  failure named. The checks that failed are run again and pass.
- **Extensions:**
  - **UC4.1** The skill cannot be found. `/skill` stops and names what it looked for.
  - **UC4.2** There are no failures. `/skill` says there is nothing to fix and leaves the skill unchanged.
  - **UC4.3** A repair needs a decision only the author can make, such as changing the Intent. The author is asked;
    with no author present, the failure is reported as not repaired.
  - **UC4.4** A repair makes another criterion fail. With the author present, `/skill` shows both criteria and the
    author keeps the change, undoes it, or asks for another repair. With no author present, the repair is undone and
    both criteria are reported.
  - **UC4.5** The skill came from an installed plugin. Before the first edit, `/skill` says that a plugin update will
    overwrite it, then edits, and offers to file an issue with the plugin's source. With no author present, no issue is
    filed.
  - **UC4.6** The selected implementation for an aspect cannot be found. The default is used, as in UC1.3.
- **Example:** `check` fails Trigger on `release-notes` and offers `fix`. The author accepts, `fix` adds when-not-to-use
  lines to the description, and `check` then passes Trigger.

## Criteria

**Fix (UC4)**

- R36 (UC4): `fix` repairs the failures in the latest `check` or `test` result of the session. With none, it runs
  `check`, and runs `test` only when the author asks.
- R37 (UC4): Each failure is repaired or reported as not repaired, with the reason.
- R38 (UC4): No part of the skill changes that no failure named.
- R39 (UC4): After repairing, `fix` runs the failed checks again and reports their result.
- R40 (UC4.2): With no failures, `fix` says there is nothing to fix and leaves the skill unchanged.
- R41 (UC4.3): A repair that needs a decision only the author can make is asked. With no author present, the failure
  is reported as not repaired.
- R42 (UC4.4, UC5.4): When a change makes another criterion fail, the author is shown both criteria and keeps the
  change, undoes it, or asks for another repair. With no author present, the change is undone and both criteria are
  reported.
- R43 (UC4.5): `fix` edits a skill that came from an installed plugin. Before the first edit it says that a plugin
  update will overwrite the change, and after it offers to file an issue with the plugin's source. With no author
  present, no issue is filed.
