---
spec-type: behavioral
status: draft
---

# skill-design/check — an author knows whether a skill as written meets each aspect's criteria, without running it

Part of [skill-design](../README.md). Its What, non-goals, key terms, actors, every-command criteria, and aspect
contract apply here; IDs are shared across the parent and its children.

## Use cases

### UC3 — Check a skill as written (A1.3)

- **Trigger:** the author wants to know whether the skill is soundly built as written, meaning its structure,
  description, and instructions meet each aspect's criteria, before running it.
- **Entry points:** skill (primary): `/skill check [skill]`. Script: a check script that `/skill` ships, run without an
  agent, for CI; it covers only the checks a script can decide.
- **Inputs:** the skill, by name or path; the selected implementation for each aspect; optionally, a judge.
- **Success:** every aspect that has criteria, core or open, gets a pass or a fail. Each fail names the criterion it
  breaks and the part of the skill that breaks it. The checks a script can run give the same result without an agent,
  so they can run in CI. Nothing in the skill is run or changed.
  In an interactive run with failures, it ends by offering `fix`; nothing changes unless the author accepts.
- **Extensions:**
  - **UC3.1** The skill cannot be found. `/skill` stops and names what it looked for.
  - **UC3.2** The skill fails the Agent Skills specification. Those failures are reported, and the aspects are still
    checked in the same run.
  - **UC3.3** The selected implementation for an aspect cannot be found. The default is used, as in UC1.3.
  - **UC3.4** A criterion can only be decided by running the skill. It is reported as not checked and pointed to
    `test`, never as a pass.
  - **UC3.5** CI gates on the check script, blocking only on critical failures. Each failure carries its severity;
    a critical one must be fixed before a commit, and a warning is reported and let through.
  - **UC3.6** The skill is name-only: another skill loads it by name, and no user request should match it. Its
    description is checked for the form that declares the kind and for carrying nothing a request could match. The
    criteria on how it is matched to requests are reported as skipped, not as failures.
- **Example:** `/skill check release-notes` passes Intent, Criteria, Shape, and Security, and fails Trigger because the
  description says how the skill works instead of when to use it.

## Criteria

**Check (UC3)**

- R17 (UC3): Every aspect that has criteria, core or open, gets a pass, a fail, or a not checked. Each fail names the
  criterion and the part of the skill that breaks it.
- R18 (UC3): `check` changes no file and runs no part of the skill.
- R19 (UC3): The check script runs only the checks a script can decide, and each gives the same result as in
  `/skill check`. It reports every other check as not checked, needing `/skill check`, never as a pass. By default it
  exits non-zero only when a critical check it ran fails; under a fail-on-any policy, when any check it ran fails.
- R20 (UC3.2): A skill that fails the Agent Skills specification gets those failures reported, and every aspect is
  still checked in the same run.
- R21 (UC3.4): A criterion that only a run can decide is reported as not checked and points to `test`, never as a
  pass.
- R139 (UC3.5): Every check has a severity, critical or warning, and the report shows it on each failure. A check
  that names none is critical.
- R140 (UC3.6): A name-only skill is told by its description alone. `check` fails one whose description does not take
  the allowed form or carries trigger language, and reports each criterion on how a skill is matched to requests as
  skipped, never as a fail or a pass.
