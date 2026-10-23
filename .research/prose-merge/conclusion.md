# Conclusion: merging agent-written prose the owner also edits

## Last updated

October 2026

## Question

When a tool ships prose (a section, a reference document) that the owner may edit, and later ships a new wording, how does it decide add, replace, keep, or ask? Which part is mechanical diffing, and which part needs an agent to read intent?

## Verdict

This is a three-way merge problem, and the retired-wordings history is its merge base. Build it in two layers.

1. **Mechanical layer (library, deterministic).** Three-way merge at sentence granularity: base = the retired wording the section descends from, ours = the section as it stands, theirs = the current wording. Clean merge applies. A conflict, a missing base, or a base that cannot be identified escalates.
2. **Intent layer (agent, only on escalation).** The agent receives the three texts and the mechanical findings and decides: owner's own, came from here, or merge by meaning. The library never decides intent.

The mechanical layer is a strict improvement over what `enhance` does today (a model running a prompt-described comparison on every run). It replaces the "do whole sentences survive" question with a computed answer and leaves the structure and coverage questions to the agent.

## Reference material

| Situation | Mechanical result | Action |
| --- | --- | --- |
| Section equals current | identical | nothing to do |
| Section equals a retired wording byte-for-byte | ours == base | replace with current, no prompt needed |
| Section equals no retired wording, owner edits and tool edits touch different sentences | clean 3-way merge | apply merge; the owner's sentences survive |
| Owner and tool edit the same or adjacent sentences | conflict | escalate to the agent with base, ours, theirs |
| Section matches no retired wording, little sentence overlap | no usable base | owner's own: offer nothing |
| Section matches no retired wording, some overlap | base unknown | escalate (this is `enhance`'s "cannot tell") |
| No history at all | two-way only | the caller supplies whatever historic prose it has; with none, the result is `undetermined` |

Prior art in one line each:

| Tool | What it teaches |
| --- | --- |
| dpkg conffiles + ucf | Keep the checksum or copy of the shipped version so "did the owner edit this?" is a lookup. dpkg only picks keep, replace or ask; ucf adds a real 3-way merge via diff3 on the stored old version. |
| git merge-file / diff3 | The base is mandatory input; a different diff algorithm (histogram, patience) changes which edits conflict; `--diff3`/`--zdiff3` show the base inside the conflict, which is what an agent needs. |
| kubectl apply / Helm 3 | Store the last-applied version next to the live one so the third input exists. Without it, deletions are inexpressible. |
| Pijul / jj | Conflicts can be recorded as data and resolved later, not forced at merge time. jj stores the conflict as a list of trees, not markers. |
| Mergiraf (tree-sitter) | A structure-aware merge driver resolves conflicts line merge cannot, using the document's syntax tree. For prose the analogue is the markdown tree: heading, paragraph, sentence. |
| MergeBERT, ConGra | Learned/LLM resolution helps on the conflicts left over after mechanical merge, at 63-68% accuracy for MergeBERT versus 36% for diff3 on one benchmark; treat the agent as a proposer, not an authority. |

## Our own experiment

On the real Delegation wordings (base = the 2026-09-27 retired text, theirs = the next wording shaped like the current one, ours = an owner edit to the first sentence plus an appended sentence), `git merge-file` gave:

- one line per paragraph: one conflict covering both paragraphs (an owner edit anywhere in a paragraph conflicts with any tool edit in it);
- one line per sentence: two conflicts, exactly the two real collisions (the same sentence edited; two different sentences appended at the same point). Edits to different sentences would have merged clean.

So sentence-per-line is the right unit for prose. Appends at the same position always conflict; that is correct, order is intent.

## Recommendation for cyber-agentkit

- Domain: a new `prose-merge` folder under `src/`, named for the concept. It is not a harness fact, so it cites no harness research. It depends on no other domain.
- Public API sketch (not decided, see open questions):
  - `splitSentences(markdown)`: fence- and quote-aware, per the `enhance` rule that a quoted or fenced sentence is not asserted.
  - `merge3({ base, ours, theirs })` returning `{ status: 'clean' | 'conflict', text, conflicts[] }`, each conflict carrying base/ours/theirs.
  - `locateBase({ section, history })` returning the retired wording with the most surviving sentences, plus the survival ratio, or `none`.
  - `parseHistory(markdown)` for the dated, fenced-wording file format.
- Escalation contract: the function returns the three texts and the findings; the skill or agent decides. The library has no model calls.
- Where the historic prose comes from is the caller's concern; the skill takes new, current and historic prose as text.

## Confidence

Medium. The mechanics (3-way merge needs a base; sentence granularity; escalate on conflict) are well supported by git and diff3 behavior and by our experiment. The numbers for learned resolution come from code, not prose. API shape is a proposal.

## Strongest supporting evidence

E1-E7 in `evidence.md`, and the local experiment (E8).

## Strongest weakening evidence

The French-forum remark (E1) that ucf's three-way merge is almost never used in practice: merged prose that nobody reviews is risky, and a clean mechanical merge of sentences can still produce incoherent text. Mitigation: a clean merge of prose is still shown to the owner before it is written.

## Not supported

- That clean sentence merges preserve meaning. They preserve both sides' edits, not coherence.
- Any accuracy figure for LLM merging of prose. The sources measure code.
- CRDT/OT as a fit: they solve concurrent live editing, and this is asynchronous with a known base. Not researched in depth.

## Where evidence is thin

- Kustomize and JSON-patch semantics were not read from primary docs.
- Renovate/Dependabot as prior art was not examined.
- No primary read of the ucf manual beyond search summaries.
- Markdown-tree-aware merge for prose has no found prior art.

## Check again later

- Whether jj or Mergiraf grow markdown/prose support.
- Merge-Bench (2026) results for prose-like content.
