---
spec-type: behavioral
---

# update — a calling skill gets the recommended updated prose for text the owner may have edited

Part of [prose-merge](../README.md); its terms (K1 to K10) and actors apply here.

## Use cases

### UC5 — Recommend updated prose (A2.1, A2.2, A3.1, A3.2)

- **Trigger:** a skill writes prose the owner may have edited, and a newer wording is available.
- **Entry points:** Skill: `/prose-update` (the way to reuse this capability).
- **Inputs:** the offered prose, the found prose, the historic prose(s), as text (R17).
- **Success:** recommended prose (K8), the outcome of UC1 for each part, and for each sentence whether it was kept, taken,
  or decided.
- **Extensions:**
  - UC5.1 Outcome `up-to-date` or `owners`: the recommended prose is the found prose, unchanged.
  - UC5.2 Outcome `conflict` or `undetermined`: the skill resolves it by reading intent and marks the sentences it
    decided, or gives no recommendation for that part and says what the owner must choose.
  - UC5.3 The offered wording is empty: refused (R33).

### UC1 — Get the mechanical facts and the merged text (A2.3, A1.2)

- **Trigger:** a skill's script, or a program using the library, needs the outcome for each part without judgment, or
  an author wants to know whether a revision was an append.
- **Entry points:** Script: the `prose-update` skill's script. Code: `classify`.
- **Inputs:** the found text, the offered wording, the history (as text).
- **Success:** one outcome per part (R1) with the facts it rests on, and the merged text where the outcome is `update`.
- **Extensions:**
  - UC1.1 The history is empty: `undetermined`, reason `no-history`.
  - UC1.2 The found text or a part is empty: `undetermined`, reason `empty-section`.
  - UC1.3 Two retired wordings share the most: `undetermined`, reason `tied-base`.
  - UC1.4 No retired wording shares a sentence with the found text, and a part shares sentences with the offered wording
    without being up to date: `undetermined`, reason `no-base`.
  - UC1.5 The offered wording is empty: refused (R33).
  - UC1.6 The edits collide: `conflict`, carrying the colliding sentences.

## Criteria

**Outcomes** (UC1)

- R1 `classify` returns, for each part, exactly one outcome of `up-to-date`, `update`, `conflict`, `owners`,
  `undetermined`. A part on one side only gets its outcome from R22 or R23.
- R2 `up-to-date`: the found part holds every sentence of the offered part, in order, and no sentence found only in a
  retired wording; or the part is one the owner deleted (R22). Sentences the owner added around or between them do not
  change this.
- R3 `owners`: the found part shares no sentence with the base or the offered wording. Nothing is offered.
- R4 The base is the retired wording with the largest shared count (K10) with the whole found text, at least 1. Equal
  largest counts for two wordings give `undetermined` with reason `tied-base`, naming both, for every part.
- R10 Every outcome except `owners` and `up-to-date` reports the base (when it has one), the shared count, the base's
  sentence count, and the revision kind (K6).

**Update** (UC1)

- R6 `update`: a found part equal to its base part sentence for sentence takes the offered part with no owner
  sentences. Otherwise base, found part and offered part merge three-way at sentence level with no collision. A collision is two
  changes touching the same base sentence, two changes with no unchanged base sentence between them, or two insertions in
  the same gap; two identical changes are one change and do not collide. The result keeps every owner sentence and takes every sentence the offered part changed or added.
- R8 When the revision is an append revision, the new sentences go immediately after the found sentence that is the
  base's last sentence; when the owner replaced it, after the last sentence of the run of found sentences between the
  nearest shared sentences on either side of it; when the owner deleted it, after the nearest earlier shared sentence; if
  there is none, at the end of the part. Owner sentences already after that point stay after the new ones. An append revision
  never gives `conflict`.
- R9 `conflict` (rewrites only) carries each collision as base, found and offered sentences. Nothing is merged in a
  conflicting collision, and the non-colliding sentences of the part are returned as merged.
- R30 For `up-to-date` and `owners`, the returned text is the found text unchanged; for `update` it is the merged text.

**Several sections** (UC1)

- R21 Text is divided into parts (K9) and each part is classified and merged by R1–R9. Parts are matched across the
  base, the found text, and the offered wording by heading path.
- R22 A part only in the offered wording is added (outcome `update`) after the nearest preceding part the found text
  holds, or first if none; a part only in the found text is the owner's and stays (outcome `owners`); a part in the base and the offered wording but absent from the
  found text stays absent (outcome `up-to-date`) unless the offered part differs from the base's, which is a `conflict`.
- R23 A part in the base and the found text but absent from the offered wording is removed if the found part equals the
  base's; otherwise it is a `conflict`.
- R24 The base is chosen once for the whole found text by R4; parts are then aligned within it. The document's outcome is
  the first that any part has, in the order `conflict`, `undetermined`, `update`, `owners`, `up-to-date`.
- R31 When R4 finds no base, a found part that shares sentences with the offered wording and is not `up-to-date` is
  `undetermined` with reason `no-base`, and one that shares none is `owners`. (UC1.4)
- R33 An empty offered wording is refused with an error; nothing is classified. (UC1.5)
- R32 When one heading path occurs more than once in a text, its occurrences are matched across texts by their order; an
  occurrence without a match is an added or removed part.
- R25 A heading renamed by either side is a removed part and an added part; no outcome depends on guessing a rename.

**Script and skill inputs** (UC1, UC5)

- R26 The skill script prints, for each part: path, outcome, reason when `undetermined`, base, shared count and the base's sentence count,
  revision kind, the text for `up-to-date`, `owners` and `update`, and the collisions for `conflict`. It uses the same
  `--format` option as the reference and asset commands.
- R17 The `prose-update` skill takes exactly three inputs, as text: offered prose, found prose, and historic prose(s), which
  is either a history text (parsed by R11) or one or more retired wordings. It reads no file the caller did not name.

**Skill behavior** (UC5; judged by an agent scenario, because no deterministic test reaches it)

- R18 For outcomes `up-to-date`, `owners` and `update`, the recommended prose is the library's text, with no sentence
  marked `decided`.
- R19 Every sentence of the recommended prose that is not from the found text, the offered wording, or an owner sentence
  is marked `decided` with the reason.
- R20 No owner sentence is dropped from the recommended prose unless it is marked `decided` with the reason.
- R28 The skill raises a question for the owner only for a part whose outcome is `conflict` or `undetermined`, or whose
  recommended prose carries a `decided` sentence.
- R29 For a part it does not recommend, the skill names the part and the choice the owner must make.

## Open questions

None.
