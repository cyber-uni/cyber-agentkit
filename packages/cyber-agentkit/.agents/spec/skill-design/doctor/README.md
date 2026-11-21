---
spec-type: behavioral
status: draft
---

# skill-design/doctor — a skill's user knows whether its references work as installed and configured here

Part of [skill-design](../README.md). Its What, non-goals, key terms, actors, every-command criteria, and aspect
contract apply here; IDs are shared across the parent and its children.

`doctor` is its own command, not a mode of `check`. `check` reads a skill as written, against the aspects. `doctor`
reads a skill as this machine and this repository resolve the references it loads, so a managed policy, a
repository, or a user override is part of what it examines. `reference` gets no `doctor`: `reference check` already
composes each name as `load` does here, and covering a reference's variants belongs in that reference's test cases.

## Use cases

### UC28 — Examine whether a skill's references work here (A1.8)

- **Trigger:** a skill misbehaves in one repository, a team that customizes references updates a plugin, or a
  session-start hook wants an early warning.
- **Entry points:** skill (primary): `/skill doctor [skills...]`. Script: `skill doctor [skills...]`, run without an
  agent.
- **Inputs:** skill names or folders, or none.
- **Success:** each skill is found as `skill where` finds it. Its references are the names its load lines give, read
  as `reference uses` reads them from the text an agent reads when the skill runs. Each name is checked as `reference
  check` composes it here, the skill's own default joined; for an interface whose implementations it loads, the
  interface and each implementation a load may return. The report gives, per reference, the tiers that answer it,
  the file on top, and each failure or warning with what the user can do. Nothing is written.
- **Extensions:**
  - **UC28.1** No skill is named: every skill the detected harnesses load here is examined, and the report says
    when some harness's skill folders are not verified.
  - **UC28.2** A named skill is not found, or two skills share the name: a usage error, or the folders to choose
    from, and nothing is examined.
  - **UC28.3** A load line inside a fenced example, in the skill's `README.md`, or in its `evals/` is not a load.
- **Example:** the `issue` skill loads the tracker capabilities for the repository's host, and the repository's
  override of the GitHub one leaves out a required section. `skill doctor issue` reports that implementation as
  failed, names the repository's file, and says `reference customize` revises it.

## Criteria

**Doctor (UC28)**

- R169 (UC28): `doctor` writes nothing, whatever it finds, and exits 1 only when a reference fails; a warning alone
  exits 0.
- R170 (UC28): Each failure and warning names the file on top and an action: the command that owns the repair, or
  who to ask when a managed policy or a plugin answers.
- R171 (UC28.3): A name shown only in a fenced example, the skill's `README.md`, or its `evals/` is never reported.
