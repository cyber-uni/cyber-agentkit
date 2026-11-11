---
spec-type: behavioral
status: draft
---

# skill-design/skillify — an author gets a working skill from work already done

Part of [skill-design](../README.md). Its What, non-goals, key terms, actors, every-command criteria, and aspect
contract apply here; IDs are shared across the parent and its children. The criteria of
[create](../create/README.md) that cite UC2 (R6, R7, R9, R10) apply here too. Retired IDs: R12, R83.

## Use cases

### UC2 — Turn work already done into a skill (A1.2)

- **Trigger:** the author has already done the job some other way (in a session, as instructions in a document, or in
  another skill) and wants it as a skill.
- **Entry points:** skill (primary): `/skillify [prompt]`, a skill of its own that ends by running `/skill create`.
  The prompt names the sources, such as a document, another skill, or the sessions of the last week; with no prompt,
  the source is the current session.
- **Inputs:** the sources; the prompt, which can also say which job in them to capture; the selected implementation
  for each aspect; where the skill goes.
- **Success:** the same as UC1, run as `/skill create` with a description `/skillify` writes from the sources. The
  description answers the questions `create` asks the author: the job and the result it hands back, what the author
  corrected or rejected, the steps done the same way every time, the words the author used to ask for the job, and the
  requests and inputs a case could use. Each answer names the part of a source it came from. It also says what the
  skill generalizes over: across several sources, the steps they share are the skill's steps and what differs between
  them is its inputs; from one source, it proposes what would differ on the next run. The author confirms all of it
  when `create` asks them to approve the Intent. The sources are left unchanged.
- **Extensions:**
  - **UC2.1** The prompt names a source that cannot be read. `/skillify` stops and names the source.
  - **UC2.2** The sources say nothing for an aspect. `create` drafts that aspect from the author's answers, as in UC1.
  - **UC2.3** One source holds more than one job, and the prompt does not say which. `/skillify` proposes one skill
    per job, and the author picks which to build.
  - **UC2.4** The same outcomes as UC1.1 and UC1.3 to UC1.5.
  - **UC2.5** The session holds no work to capture and the prompt names no other source. `/skillify` says there is
    nothing to skillify and points to `/skill create`.
  - **UC2.6** A source states a fact about the repository that no longer holds. The description uses what holds now
    and names the difference.
  - **UC2.7** Several sources do not share one job. `/skillify` proposes one skill per job found in more than one
    source, names the jobs found in only one, and the author picks which to build.
- **Example:** `/skillify notes/build.md`, where the notes record rebuilding a package's skill scripts after a code
  change. The description names "a change left generated files stale" as the job, with the plugin manifests as a
  second case, cites the notes for each answer, and says the notes name three bundles where the package maps two.
  `/skill create` runs on it at once.

## Criteria

**Skillify (UC2)**

- R11 (UC2): `skillify` leaves its sources unchanged.
- R13 (UC2.2): An aspect the sources say nothing for is drafted from the author's answers, as in `create`.
- R14 (UC2.1): When a named source cannot be read, `skillify` stops and names it.
- R15 (UC2.3): When one source holds more than one job and the prompt names none, `skillify` proposes one skill per
  job and builds none until the author picks.
- R16 (UC2.5): When the session holds no work and no other source is named, `skillify` says there is nothing to
  skillify, points to `/skill create`, and writes nothing.
- R84 (UC2): `skillify` runs `/skill create` with the description it wrote, without asking the author first.
- R85 (UC2): The description states the job and its result, the corrections the author made, the steps done the same
  way every time, and the words the author used to ask, wherever the sources hold them.
- R86 (UC2): Each answer in the description names the part of a source it came from.
- R87 (UC2): The description states what the skill generalizes over. With several sources, the steps the skill keeps
  are those every source shares, and each value that differs between them is named as an input.
- R88 (UC2.6): When a source states a fact about the repository that no longer holds, the description uses what holds
  now and names the difference.
- R89 (UC2.7): When several sources do not share one job, `skillify` proposes one skill per job found in more than one
  source, names the jobs found in only one, and builds none until the author picks.
