---
spec-type: behavioral
status: draft
---

# skill-design/backfill — an author gets a working skill from work already done

Part of [skill-design](../README.md). Its What, non-goals, key terms, actors, every-command criteria, and aspect
contract apply here; IDs are shared across the parent and its children. The criteria of
[create](../create/README.md) that cite UC2 (R6, R7, R9, R10) apply here too.

## Use cases

### UC2 — Backfill a skill from work already done (A1.2)

- **Trigger:** the author has already done the job some other way (in a session, as instructions in a document, or in
  another skill) and wants it as a skill.
- **Entry points:** skill (primary): `/skill backfill [description]`.
- **Inputs:** the source, which is the current session's context unless the description names another (a document or
  another skill); the description, which can also say which job in the source to capture; the selected implementation
  for each aspect; where the skill goes.
- **Success:** the same as UC1, except that `/skill` answers each question `create` would ask the author from the
  source, and asks the author only what the source leaves open or where it differs from what the skill should do. The skill generalizes the
  source so it can be reused: the agent proposes what it generalizes over (what would differ on the next run, such as
  the repo, the version, or the target) and the author confirms it. The author decides every point where the source is
  silent, or where what it did differs from what the skill should do. The source is left unchanged.
- **Extensions:**
  - **UC2.1** The description names a source that cannot be read. `/skill` stops and names the source.
  - **UC2.2** The source says nothing for an aspect. That aspect is drafted from the author's answers, as in UC1.
  - **UC2.3** The source holds more than one job, and the description does not say which. `/skill` proposes one skill
    per job, and the author picks which to build.
  - **UC2.4** The same outcomes as UC1.1 and UC1.3 to UC1.5.
  - **UC2.5** The session holds no work to capture and the description names no other source. `/skill` says there is
    nothing to backfill and points to `create`.
- **Example:** `/skill backfill` right after a release done by hand. The session shows the steps taken; the agent
  proposes the package and the version as what varies, and the author decides which steps the skill keeps.

## Criteria

**Backfill (UC2)**

- R11 (UC2): `backfill` leaves its source unchanged.
- R12 (UC2): Before it drafts, `backfill` proposes what the skill generalizes over, and the author confirms it.
- R13 (UC2.2): An aspect the source says nothing for is drafted from the author's answers, as in `create`.
- R14 (UC2.1): When the named source cannot be read, `backfill` stops and names it.
- R15 (UC2.3): When the source holds more than one job and the description names none, `backfill` proposes one skill
  per job and builds none until the author picks.
- R16 (UC2.5): When the session holds no work and no other source is named, `backfill` says there is nothing to
  backfill, points to `create`, and writes nothing.
- R83 (UC2): Each question `create` asks the author is answered from the source when the source answers it, and the
  answer names where in the source it came from.
