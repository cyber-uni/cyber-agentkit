---
spec-type: behavioral
status: draft
---

# skill-design/create — an author gets a working skill from a described job

Part of [skill-design](../README.md). Its What, non-goals, key terms, actors, every-command criteria, and aspect
contract apply here; IDs are shared across the parent and its children.

## Use cases

### UC1 — Create a skill for a described job (A1.1)

- **Trigger:** the author wants an agent to do a job repeatably, and has no skill for it.
- **Entry points:** skill (primary): `/skill create [description]`.
- **Inputs:** the author's description of the job; the selected implementation for each aspect (the default unless
  customized); where the skill goes.
- **Success:** the skill exists at the chosen location. It meets the Agent Skills specification and each core aspect's
  criteria, and Verification has passed against the Criteria. The author approved the output of Intent, Criteria, Shape,
  and Trigger before each was written.
- **Extensions:**
  - **UC1.1** A skill with that name already exists. `/skill` stops without overwriting it and points to `check`, `fix`,
    or `enhance`.
  - **UC1.2** The author rejects an aspect's draft. That aspect is redrafted, and any aspect approved after it is
    reopened.
  - **UC1.3** The selected implementation for an aspect cannot be found. That aspect uses the default, and the author is
    told which aspect fell back and which implementation was missing.
  - **UC1.4** Verification fails. The skill stays in place, and the failing criteria are reported so `fix` can repair
    them.
  - **UC1.5** The author stops partway. The aspects already approved stay on disk.
- **Example:** `/skill create "summarize a PR for release notes"`. The author approves the intent, two criteria, a
  single-file shape, and the trigger description; Verification runs the two criteria against a sample PR.

## Criteria

**Create (UC1, UC2)**

- R5 (UC1): `create` drafts Intent, Criteria, Shape, and Trigger in that order, then builds the skill, then runs `test`.
- R6 (UC1, UC2, UC10): At `ask`, no aspect's output is written before the author approves it.
- R7 (UC1.1, UC2.4): When a skill with that name exists at the chosen location, the command stops, leaves it unchanged,
  and points to `check`, `fix`, and `enhance`.
- R8 (UC1.2): When the author rejects an aspect's draft, that aspect is redrafted, and every aspect after it in K2's
  order that was approved is reopened.
- R9 (UC1.4, UC2.4): When the last step's `test` fails, the skill stays in place and the failing criteria are reported.
- R10 (UC1.5, UC2.4): When the author stops partway, every aspect already approved stays on disk.
