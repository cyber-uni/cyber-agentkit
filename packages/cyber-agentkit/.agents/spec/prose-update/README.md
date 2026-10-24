---
spec-type: behavioral
---

# prose-update — a section a tool wrote earlier is brought to its offered wording without losing the owner's edits

Research: [prose-update](../../../../../.research/prose-update/conclusion.md). Depends on no other domain: where the
historic prose comes from is the caller's concern. Retired IDs: A4, UC2, UC4, R5, R7, R15, R16.

## What

A tool that writes a prose section into a file its owner also edits later ships a better wording. Without a record of
what it wrote before, it cannot tell the owner's edits from its own old text. It either skips the update, leaving stale
text, or replaces the section and deletes what the owner added. Each skill that does this solves it in its own prompt,
and a model re-judges the same comparison on every run.

This capability gives a skill one thing to ask: here is the wording I offer now, the text found in the file, and the
wordings I retired; recommend the updated text. The `prose-update` skill answers, and it is the way other skills reuse
this. Beneath it, a library and a script return the facts that settle most cases without judgment (whether the found
text is current, which retired wording it descends from, which sentences are the owner's, the merged text or the exact
sentences that collide), and keep the retired wordings. The skill reads those facts and resolves only what they leave
open, by reading intent. The same inputs give the same facts every run.

Wordings are written to be revised by appending. A revision that only adds sentences after the old ones is applied
without collision, so the facts report whether a revision is an append, and an author can see which revisions were not.

**Non-goals:**

- N1 Judging whether a subject is already covered by meaning, or whether two texts have the same structure. That needs an
  agent; this returns facts for it.
- N2 Writing files, offering text to the owner, or asking. The calling skill does that.
- N3 Merging code or structured data, or any unit finer than a sentence.
- N4 Finding the prose inside a larger file (the part of an `AGENTS.md` that one addition owns). The caller passes the
  text; it may hold several sections.

**Key terms** (shared terms: [glossary](../glossary.md)):

- K1 **wording**: the full text of a section as a tool offered it.
- K2 **offered wording**: the wording the tool offers now. **Retired wording**: one it offered before. **Found text**:
  the text in the file being updated. **Prose**: any of these passed as text; "offered prose", "found prose" and
  "historic prose(s)" are the offered wording, the found text and the retired wordings.
- K3 **history**: the retired wordings of one addition, newest first, each with a date and a reason, kept as a Markdown
  text that the library parses and extends.
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

| ID | Actor | Goal |
| --- | --- | --- |
| A1.1 | A1 wording author (maintains the addition) | Ship a new wording and keep the old one, so sections written from it can still be recognised |
| A1.2 | A1 | See whether a revision was an append or a rewrite |
| A2.1 | A2 calling skill (acts for the owner; any skill that writes prose the owner may edit) | Hand over the offered, found, and historic prose and get recommended prose back |
| A2.2 | A2 | Be told when a decision was judgment, not mechanical, so it can ask the owner |
| A2.3 | A2, or a program using the library | Get the mechanical facts and the merged text, with no judgment involved |
| A3.1 | A3 owner (never invokes) | Keep the sentences they wrote through every update |
| A3.2 | A3 | Be asked only about parts where the facts do not settle the update |

## Child specs

Each use case lives in the child that owns the capability. The delivery (skill, script, library) is an entry point of the
use case, never a reason to split.

| Child | Capability | Use cases | Criteria |
| --- | --- | --- | --- |
| [update](./update/README.md) | Bring found text to the offered wording | UC5, UC1 | Outcomes, Update, Several sections, Script and skill inputs, Skill behavior |
| [history](./history/README.md) | Keep the retired wordings | UC3 | History |

## Cross-cutting criteria

- R14 The same inputs give the same outcomes and text on every call. No outcome depends on a model, a clock, or a file
  beyond the inputs. (UC1, UC3)

## Open questions

None.

## References

- [prose-update research](../../../../../.research/prose-update/conclusion.md): prior art and the sentence-granularity
  experiment.
- `buddy-agent-harness` skill `enhance`: the procedure and history files this generalises.
- [reference](../reference/README.md): `combine` and `patch` declare a change over a base; this recovers the change from
  texts when none was declared.
