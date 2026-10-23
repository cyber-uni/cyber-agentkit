# Merging agent-written prose the owner edits (October 2026)

## Question

How should a toolkit decide add, replace, append or ask when the prose it wrote earlier may have been edited by the owner, and the tool now has a newer wording? Which part is mechanical diffing and which needs an agent?

## Scope

In: three-way merge over prose and markdown, base selection from a retired-wordings history, escalation to an agent, prior art, API direction for cyber-agentkit. Out: code-merge accuracy beyond what informs the escalation rule; live collaborative editing.

## Source angles

- How `enhance` does it today (E9)
- Config-file upgrade merging: dpkg/ucf (E1)
- Diff and merge algorithms: diff3, git (E2, E3)
- Conflict as data: Pijul, jj (E4, E5)
- Learned and structure-aware merging (E6, E7)
- Declarative three-way apply: Helm, kubectl (E7)
- First-hand experiment (E8)

## Findings

### Two levels
Mechanical: three-way merge over sentences, base from history. Intent: an agent reads base/ours/theirs and decides ownership or meaning. The seam is the conflict or the missing base.

### The merge base is the hard part
Every system that merges well stores the base (ucf cache, Helm/kubectl last-applied, git history). `enhance`'s retired-wordings file is that store, but only for wordings it shipped; owner-written or copied text without a recorded source has no base. Reference overrides made by `copyAsset` have the same gap today.

### Granularity decides conflicts
E8: paragraph lines over-conflict; sentence lines conflict only on real collisions.

### Conflicts as data
jj and Pijul keep a conflict as structured data. Our equivalent is returning `{base, ours, theirs}` triples, not markers, so an agent or the owner resolves later.

## Contradictions

- ucf offers three-way merging but is reportedly rarely used; mechanical power may not equal adoption. Review before write is the mitigation.

## Open questions

- Q1 Is "append" a first-class outcome? `enhance` has none; same-position appends always conflict in diff3.
- Q2 Where is the base stored for reference overrides: a hash, the full text, or a pointer to a plugin version?
- Q3 Which domain owns it: `prose-merge` standalone, or inside `references`?
- Q4 Does the library parse the history file format, making buddy-agent-harness a consumer?
- Q5 Whether markdown-tree-aware sentence units (skipping fences and quotes) are enough or lists/tables need their own units.

## Sources consulted

See `evidence.md`.
