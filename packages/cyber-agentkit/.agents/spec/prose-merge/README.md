---
spec-type: behavioral
---

# prose-merge — a section a tool wrote earlier is brought to its current wording without losing the owner's edits

Research: [prose-merge](../../../../../.research/prose-merge/conclusion.md). Related to [reference](../reference/README.md),
which can use this to update an override copied from a plugin; this spec does not depend on it.

## What

A tool that writes a prose section into a file its owner also edits later ships a better wording. Without a record of
what it wrote before, it cannot tell the owner's edits from its own old text. It either skips the update, leaving stale
text, or replaces the section and deletes what the owner added. Each skill that does this solves it in its own prompt,
and a model re-judges the same comparison on every run.

This capability keeps the wordings a tool has retired and compares a section found in a file against them. It returns
structured facts: whether the section is current, which retired wording it descends from, which sentences are the
owner's, and either the updated text or the exact sentences that collide. A skill takes those facts and, only where they
do not settle it, asks the agent or the owner. The same facts give the same answer every run.

Wordings are written to be revised by appending. A revision that only adds sentences after the old ones is cheap to
apply and cannot collide with the owner's edits, so it is the preferred shape of a revision.

**Non-goals:**

- N1 Judging whether a subject is already covered by meaning, or whether two texts have the same structure. That needs an
  agent; this returns facts for it.
- N2 Writing files, offering text to the owner, or asking. The skill does that.
- N3 Merging code or structured data, or any unit finer than a sentence.
- N4 Choosing which section of a file belongs to which addition. The caller passes the section.

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
- K7 **owner sentence**: a sentence of the section found in no wording of the history.

## Actors and goals

- A1 **Wording author** (maintains the addition). A1.1 Ships a new wording and keeps the old one, so sections written
  from it can still be recognised.
- A2 **Skill** (acts for the owner). A2.1 Learns, from structured facts, whether the section is current, updatable, or
  needs a decision. A2.2 Gets the updated text when the update is mechanical.
- A3 **Owner** (never invokes). A3.1 Keeps sentences they wrote through every update. A3.2 Is asked only about real
  collisions.
- A4 **Reference consumer** (a library caller). A4.1 Uses the same comparison for a copied override against the text it
  was copied from.

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
- **UC4 Compare a copy with its source.** Trigger: a consumer passes the copy, the source text at copy time, and the
  source now. Success: the same outcomes with the source at copy time as the single base. Extensions: as UC1 and UC2.

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
- R16 The library reads and writes no instruction file; callers pass text and receive text. (N2)

## Open questions

- Q1 What does a copied reference override record as its base: the source text, a hash, or a plugin version? UC4 assumes
  the text is available. [reference](../reference/README.md) owns the answer.
- Q2 Adapters. Skills run scripts, not library calls: does a `prose-merge` command return these outcomes as
  structured output, as the reference and asset commands do?
- Q3 Does a heading-path-aware merge (reference's `patch`) replace sentence splitting for documents with several
  sections, or does the caller pass one section at a time (N4)?
- Q4 The history file's heading wording. This spec assumes buddy-agent-harness's current shape (a dated `Superseded`
  heading with a reason, then the wording in a Markdown fence); confirm before the format is a contract.

## References

- [prose-merge research](../../../../../.research/prose-merge/conclusion.md): prior art and the sentence-granularity
  experiment.
- `buddy-agent-harness` skill `enhance`: the procedure and history files this generalises.
- [reference](../reference/README.md): `combine` and `patch` are declared overlays; this handles a copy that must be
  updated, a different problem.
