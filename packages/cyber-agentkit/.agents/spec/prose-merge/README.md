---
spec-type: behavioral
---

# prose-merge — a section a tool wrote earlier is brought to its offered wording without losing the owner's edits

Research: [prose-merge](../../../../../.research/prose-merge/conclusion.md). Depends on no other domain: where the
historic prose comes from is the caller's concern. Retired IDs: A4, UC4, R5, R7, R15, R16.

## What

A tool that writes a prose section into a file its owner also edits later ships a better wording. Without a record of
what it wrote before, it cannot tell the owner's edits from its own old text. It either skips the update, leaving stale
text, or replaces the section and deletes what the owner added. Each skill that does this solves it in its own prompt,
and a model re-judges the same comparison on every run.

This capability compares the text found in a file against the wording the tool offers now and the wordings it has
retired. It returns structured facts: whether the found text is up to date, which retired wording it descends from,
which sentences are the owner's, and either the updated text or the exact sentences that collide. A skill takes those
facts and, only where they do not settle it, asks the agent or the owner. The same inputs give the same facts every run.

The point of reuse is a skill, not a command. A skill takes three things: the offered prose, the found prose, and the
historic prose(s). It returns the recommended updated prose. The skill reads the facts, resolves what they leave open by
reading intent, and always ends in text a caller can show the owner.

Wordings are written to be revised by appending. A revision that only adds sentences after the old ones is applied
without collision, so the facts report whether a revision is an append, and an author can see which revisions were not.

**Non-goals:**

- N1 Judging whether a subject is already covered by meaning, or whether two texts have the same structure. That needs an
  agent; this returns facts for it.
- N2 Writing files, offering text to the owner, or asking. The skill does that.
- N3 Merging code or structured data, or any unit finer than a sentence.
- N4 Finding the prose inside a larger file (the part of an `AGENTS.md` that one addition owns). The caller passes the
  text; it may hold several sections.

**Key terms** (shared terms: [glossary](../glossary.md)):

- K1 **wording**: the full text of a section as a tool offered it.
- K2 **offered wording**: the wording the tool offers now. **Retired wording**: one it offered before. **Found text**:
  the text in the file being updated. **Prose**: any of these passed as text; "offered prose", "found prose" and
  "historic prose(s)" are the offered wording, the found text and the retired wordings.
- K3 **history**: the retired wordings of one addition, newest first, each with a date and a reason, kept as a Markdown
  text the library parses and writes.
- K4 **sentence**: the unit compared. Text is split at `.`, `;`, `?` or `!` followed by whitespace or the end of the text,
  except after `e.g.`, `i.e.`, `etc.` and `vs.`; at every blank line; and so that a heading line, a list item, and a table
  row are each one sentence. A fenced code block and a blockquote are each one sentence, compared whole, so a change inside
  one is a change; a line inside a fence is never a heading. Two sentences are equal when they match after each run of
  whitespace becomes one space; case, punctuation and inline markup must match exactly.
- K5 **base**: the retired wording the found text descends from.
- K6 **append revision**: an offered wording that holds every sentence of the base, in order, followed by new ones. Any
  other revision is a **rewrite**.
- K7 **owner sentence**: a sentence of the found text that is in no wording of the history and not in the offered wording.
- K8 **recommended prose**: the text the skill proposes as the updated section, with a note of what it kept, took from the
  offered wording, and decided by judgment. It is a proposal: nothing writes it without the caller's approval.
- K9 **part**: one heading path and the sentences under it before the next heading. A document is a list of parts; a
  document with no heading is one part with an empty path. Heading levels are read from the document's own top level.
- K10 **shared**: the number of sentences in the longest common subsequence of two texts. Equal sentences repeated in
  both texts are matched in order, earliest first.

## Actors and goals

- A1 **Wording author** (maintains the addition). A1.1 Ships a new wording and keeps the old one, so sections written
  from it can still be recognised. A1.2 Sees whether a revision was an append or a rewrite.
- A2 **Calling skill** (acts for the owner; any skill that writes prose the owner may edit). A2.1 Hands over the offered,
  found, and historic prose and gets recommended prose back. A2.2 Is told when a decision was judgment, not mechanical,
  so it can ask the owner.
- A3 **Owner** (never invokes). A3.1 Keeps sentences they wrote through every update. A3.2 Is asked only about parts
  where the facts do not settle the update.

## Use Cases

- **UC1 Classify found text.** Trigger: a skill passes the found text, the offered wording, and the history (as text).
  Success: one outcome per part (R1) with the facts it rests on. Extensions: UC1.1 the history is empty (`undetermined`,
  reason `no-history`); UC1.2 the found text or a part is empty (`undetermined`, reason `empty-section`); UC1.3 two
  retired wordings share the most (`undetermined`, reason `tied-base`); UC1.4 no retired wording shares a sentence with the
  found text, and a part shares sentences with the offered wording without being up to date (`undetermined`, reason
  `no-base`); UC1.5 the offered wording is empty (refused, R33).
- **UC2 Update found text.** Trigger: a part's outcome is `update`. Success: the updated text, the revision kind (K6),
  and the owner sentences kept. Extensions: UC2.1 the edits collide (`conflict`); UC2.2 the base is not identified
  (`undetermined`).
- **UC3 Read and extend the history.** Trigger: a skill passes a history text, or a wording author retires a wording.
  Success: wordings parsed in order, or the history text returned with the outgoing wording added at the top with a date
  and reason, other text untouched. Extensions: UC3.1 a heading or fence does not parse (that entry is reported, the
  others are returned); UC3.2 the outgoing wording equals the newest retired one (nothing added).
- **UC5 Recommend updated prose.** Trigger: a calling skill invokes the `merge-prose` skill with the offered prose, the
  found prose, and the historic prose(s). Success: recommended prose (K8), the outcome of UC1, and for each sentence
  whether it was kept, taken, or decided. Extensions: UC5.1 outcome `up-to-date` or `owners` (the recommended prose is
  the found prose, unchanged); UC5.2 outcome `conflict` or `undetermined` (the skill resolves it by reading intent and
  marks the sentences it decided, or gives no recommendation for the part and says what the owner must choose).

## Criteria

**Library: outcomes** (UC1)

- R1 `classify` returns, for each part, exactly one outcome of `up-to-date`, `update`, `conflict`, `owners`,
  `undetermined`. A part on one side only gets its outcome from R22 or R23.
- R2 `up-to-date`: the found part holds every sentence of the offered part, in order, and no sentence found only in a
  retired wording; or the part is one the owner deleted (R22). Sentences the owner added around or between them do not
  change this.
- R3 `owners`: the found part shares no sentence with the base or the offered wording. Nothing is offered.
- R4 The base is the retired wording with the largest shared count (K10) with the whole found text, at least 1. Equal
  largest counts for two wordings give `undetermined` with reason `tied-base`, naming both, for every part.
- R10 Every outcome except `owners` and `up-to-date` reports the base (when it has one), the shared count, the base's sentence count, and
  the revision kind (K6).
- R14 The same inputs give the same outcomes and text on every call. No outcome depends on a model, a clock, or a file
  beyond the inputs.

**Library: update** (UC2)

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

**Library: several sections** (UC1, UC2)

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

**Library: history** (UC3)

- R11 `parseHistory` takes text and returns each retired wording as text, date, reason, newest first. An entry that does
  not parse is returned in `invalid` with its position; the rest are returned.
- R12 `retire` takes the history text, the outgoing wording, a date and a reason, and returns the history text with the
  wording, the date text exactly as given, and the reason added at the top and every other byte unchanged. The wording equal to the newest retired one changes nothing.
- R13 `parseHistory(retire(h, w))` returns `w` first, exactly.
- R27 The history text starts from the `buddy-agent-harness` shape (a dated `Superseded` heading with a reason, then the
  wording in a Markdown fence); a change to it is a spec change.

**Adapters** (UC5)

- R26 The skill script prints, for each part: path, outcome, reason when `undetermined`, base, shared count and the base's sentence count,
  revision kind, the text for `up-to-date`, `owners` and `update`, and the collisions for `conflict`. It uses the same
  `--format` option as the reference and asset commands.
- R17 The `merge-prose` skill takes exactly three inputs: offered prose, found prose, historic prose(s), as text. It reads
  no file the caller did not name.

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

## References

- [prose-merge research](../../../../../.research/prose-merge/conclusion.md): prior art and the sentence-granularity
  experiment.
- `buddy-agent-harness` skill `enhance`: the procedure and history files this generalises.
- [reference](../reference/README.md): `combine` and `patch` declare a change over a base; this recovers the change from
  texts when none was declared.
