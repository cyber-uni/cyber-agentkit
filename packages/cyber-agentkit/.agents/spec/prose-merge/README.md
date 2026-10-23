---
spec-type: behavioral
---

# prose-merge — a section a tool wrote earlier is brought to its current wording without losing the owner's edits

Research: [prose-merge](../../../../../.research/prose-merge/conclusion.md). Depends on no other domain: where the historic prose
comes from is the caller's concern.

## What

A tool that writes a prose section into a file its owner also edits later ships a better wording. Without a record of
what it wrote before, it cannot tell the owner's edits from its own old text. It either skips the update, leaving stale
text, or replaces the section and deletes what the owner added. Each skill that does this solves it in its own prompt,
and a model re-judges the same comparison on every run.

This capability keeps the wordings a tool has retired and compares a section found in a file against them. It returns
structured facts: whether the section is current, which retired wording it descends from, which sentences are the
owner's, and either the updated text or the exact sentences that collide. A skill takes those facts and, only where they
do not settle it, asks the agent or the owner. The same facts give the same answer every run.

The point of reuse is a skill, not a command. A skill takes three things: the new prose, the current prose, and the
historic prose(s). It returns the recommended updated prose. The skill reads the facts, resolves what they leave open
by reading intent, and always ends in text a caller can show the owner.

Wordings are written to be revised by appending. A revision that only adds sentences after the old ones is cheap to
apply and cannot collide with the owner's edits, so it is the preferred shape of a revision.

**Non-goals:**

- N1 Judging whether a subject is already covered by meaning, or whether two texts have the same structure. That needs an
  agent; this returns facts for it.
- N2 Writing files, offering text to the owner, or asking. The skill does that.
- N3 Merging code or structured data, or any unit finer than a sentence.
- N4 Finding the prose inside a larger file (the part of an `AGENTS.md` that one addition owns). The caller passes the
  text; it may hold several sections.

**Key terms** (shared terms: [glossary](../glossary.md)):

- K1 **wording**: the full text of a section as a tool offered it.
- K2 **current wording**: the wording the tool offers now. **Retired wording**: one it offered before.
- K3 **history**: the retired wordings of one addition, newest first, each with a date and a reason, kept in a Markdown
  file the library reads and writes.
- K4 **sentence**: the unit compared. A sentence ends at `.`, `;`, `?` or `!` followed by a space or a line end; a heading
  line is one sentence. Text inside a fenced code block, a blockquote, or quotation marks is not a sentence of the
  section: it is shown, not asserted.
- K5 **base**: the retired wording a section descends from.
- K6 **append revision**: a revision whose wording holds every sentence of the one before it, in order, followed by new
  ones. Any other revision is a **rewrite**.
- K8 **recommended prose**: the text the skill proposes as the updated section, with a note of what it kept, took from the
  new wording, and decided by judgment. It is a proposal: nothing writes it without the caller's approval.
- K9 **part**: one heading path and the sentences under it before the next heading. A document is a list of parts; a
  document with no heading is one part with an empty path. Heading levels are read from the document's own top level,
  as in [reference](../reference/README.md) K5.
- K7 **owner sentence**: a sentence of the section found in no wording of the history.

## Actors and goals

- A1 **Wording author** (maintains the addition). A1.1 Ships a new wording and keeps the old one, so sections written
  from it can still be recognised.
- A2 **Calling skill** (acts for the owner; any skill that writes prose the owner may edit). A2.1 Hands over the new,
  current, and historic prose and gets recommended prose back. A2.2 Is told when a decision was judgment, not
  mechanical, so it can ask the owner.
- A3 **Owner** (never invokes). A3.1 Keeps sentences they wrote through every update. A3.2 Is asked only about real
  collisions.

## Use Cases

- **UC1 Classify a section.** Trigger: a skill passes the section, the current wording, and the history. Success: one
  outcome (C1) with the facts it rests on. Extensions: UC1.1 the history is empty or unreadable (outcome
  `undetermined`, reason named); UC1.2 the section is empty (outcome `undetermined`).
- **UC2 Update a section.** Trigger: the outcome is `update`. Success: the updated text, the revision kind (K6), and the
  owner sentences kept. Extensions: UC2.1 the edits collide (outcome `conflict`); UC2.2 the base is not identified
  (outcome `undetermined`).
- **UC3 Read and extend the history.** Trigger: a skill reads a history file, or a wording author retires a wording.
  Success: wordings parsed in order, or the outgoing wording added at the top with a date and reason, other text untouched.
  Extensions: UC3.1 a heading or fence does not parse (that entry is reported, the others are returned); UC3.2 the
  outgoing wording equals the newest retired one (nothing added).
- **UC5 Recommend updated prose.** Trigger: a calling skill invokes the `merge-prose` skill with the new prose, the
  current prose, and the historic prose(s). Success: recommended prose (K8), the outcome of UC1, and for each sentence
  whether it was kept, taken, or decided. Extensions: UC5.1 outcome `current` (the recommended prose is the current
  prose, unchanged); UC5.2 outcome `owners` (the recommended prose is the current prose, unchanged, and the note says
  the owner's own text was left alone); UC5.3 outcome `conflict` or `undetermined` (the skill resolves it by reading
  intent and marks every such sentence `decided`, or returns no recommendation and says what the owner must choose).

## Criteria

**Outcomes**

- R1 `classify` returns exactly one outcome of `current`, `update`, `conflict`, `owners`, `undetermined`. (UC1)
- R2 `current`: the section holds every sentence of the current wording, in order, and no sentence found only in a
  retired wording. Sentences the owner added around or between them do not change this. (UC1)
- R3 `owners`: the section shares no sentence with any wording of the history. Nothing is offered. (UC1)
- R4 The base is the retired wording sharing the most sentences with the section, in order. Equal counts for two
  wordings give `undetermined`, naming both. (UC1, UC2.2)
- R5 `undetermined` carries a reason: `no-history`, `empty-section`, `tied-base`, or `partial-overlap`. `partial-overlap`
  is a section sharing sentences with a retired wording without holding its order. (UC1, UC2.2)

**Update**

- R6 `update`: base, section and current merge three-way at sentence level with no overlapping change. The result keeps
  every owner sentence and takes every sentence the current wording changed or added. (UC2)
- R7 A section equal to its base byte-for-byte updates to the current wording with no owner sentences. (UC2)
- R8 When the revision is an append revision, the new sentences go after the section's last sentence of the base, and
  no owner edit can make the outcome `conflict`. (UC2)
- R9 `conflict` carries each collision as base, ours, and theirs sentences. Two sentences added at the same position by
  both sides collide. Nothing is merged or written in a conflict. (UC2.1)
- R10 Every outcome except `owners` and `current` names the base and the sentences shared with it. (UC1, UC2)

**History**

- R11 `parseHistory` returns each retired wording as text, date, reason, newest first. An entry that does not parse is
  returned in `invalid` with its position; the rest are returned. (UC3, UC3.1)
- R12 `retire` adds the outgoing wording at the top of the history, with the date and reason it is given, and leaves
  every other byte unchanged. Retiring the wording equal to the newest retired one changes nothing. (UC3, UC3.2)
- R13 `parseHistory(retire(h, w))` returns `w` first, exactly. (UC3)

**Determinism and scope**

- R14 The same inputs give the same outcome and text on every call. No outcome depends on a model, a clock, or a file
  beyond the inputs. (UC1, UC2)
- R15 Sentence splitting ignores fenced, quoted and blockquoted text (K4); a heading line is a sentence. (UC1)
- R17 The `merge-prose` skill takes exactly three inputs: new prose, current prose, historic prose(s), as text. It reads
  no file the caller did not name. (UC5)
- R18 For outcomes `current`, `owners`, and a clean `update`, the recommended prose is the library's text, with no
  sentence marked `decided`. (UC5, UC5.1, UC5.2)
- R19 Every sentence of the recommended prose that is not from the current prose, the new prose, or an owner sentence is
  marked `decided`; the recommendation is returned only with that mark. (UC5.3)
- R20 No owner sentence is dropped from the recommended prose unless it is marked `decided` with the reason. (UC5, A3.1)
**Several sections**

- R21 Prose is divided into parts (K9) and merged part by part; every rule above applies to a part. Parts are matched
  across the base, the section and the current wording by heading path. (UC1, UC2)
- R22 A part only in the current wording is added after the nearest preceding part both sides hold; a part only in the
  section is the owner's and stays; a part in the base and current wording but absent from the section stays deleted
  unless the current wording changed it, which is a `conflict`. (UC2)
- R23 A part present in the base and the section but absent from the current wording is removed only if the section's
  part equals the base's; otherwise it stays and is reported `retired-by-tool`. (UC2)
- R24 The base is chosen once for the whole document by R4 over all its sentences, then parts are aligned within it.
  Outcomes are reported per part, and the document's outcome is `current` only if every part is. (UC1)
- R25 A heading renamed by either side is a removed part and an added part; no outcome depends on guessing a rename.
  (UC2)
- R16 The library reads and writes no instruction file; callers pass text and receive text. (N2)

## Open questions

- Q2 How the skill reaches the library's facts: a script it runs, as the reference and asset skills do, or the library
  called directly. Reuse is at the skill (decided); this is only the wiring.
- Q4 The history file format. Settled direction: any shape that is optimal after detailed design, starting from
  buddy-agent-harness's (a dated `Superseded` heading with a reason, then the wording in a Markdown fence). The skill
  takes the wordings as text (R17), so the file is the library's storage, not the skill's contract.

## References

- [prose-merge research](../../../../../.research/prose-merge/conclusion.md): prior art and the sentence-granularity
  experiment.
- `buddy-agent-harness` skill `enhance`: the procedure and history files this generalises.
- [reference](../reference/README.md): `combine` and `patch` are declared overlays; this handles a copy that must be
  updated, a different problem.
