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
Every system that merges well stores the base (ucf cache, Helm/kubectl last-applied, git history). `enhance`'s retired-wordings file is that store, but only for wordings it shipped; owner-written or copied text without a recorded source has no base. Asset overrides made by `copyAsset` have the same gap today (reference overrides declare their changes and do not).

### Granularity decides conflicts
E8: paragraph lines over-conflict; sentence lines conflict only on real collisions.

### Conflicts as data
jj and Pijul keep a conflict as structured data. Our equivalent is returning `{base, ours, theirs}` triples, not markers, so an agent or the owner resolves later.

## Contradictions

- ucf offers three-way merging but is reportedly rarely used; mechanical power may not equal adoption. Review before write is the mitigation.

## Open questions

- Q1 Is "append" a first-class outcome? `enhance` has none; same-position appends always conflict in diff3.
- Q2 Where is the base stored for a copied asset override: a hash, the full text, or a pointer to a plugin version?
- Q3 Which domain owns it: `prose-merge` standalone, or inside `references`?
- Q4 Does the library parse the history file format, making buddy-agent-harness a consumer?
- Q5 Whether markdown-tree-aware sentence units (skipping fences and quotes) are enough or lists/tables need their own units.

## Sources consulted

See `evidence.md`.

## Whole-text copy note (Q1)

Correction (2026-10-23): this is an asset-domain question, not a reference one. `reference` has no copy-based create; its overrides declare changes (`replace`, `patch`, `combine`, `remove`), so they carry no stale copy. Only `asset create --copy` (`copyAsset`) makes a whole-text copy.

An asset override made by copy is the owner's edit of a plugin's file. The
plugin later ships a new version. Merging needs the text that was copied (the base). The copy records nothing today.

Options:
- A. Store the base next to the copy (a sidecar or frontmatter field). Always works; duplicates text and can drift if
  the owner moves the file.
- B. Record the source plugin, version and a hash of the copied text. The base is found in the plugin's own history of
  retired wordings, or in a cached older plugin version, by matching the hash. Small, but the plugin must keep history
  and the cache may have dropped the version (installed caches did hold 0.20.0 and 0.21.0 side by side).
- C. Record nothing; fall back to the library's best-match base (R4). No cost to the owner, but frequently
  `undetermined`.

Recommendation: B, with A as the fallback when the plugin ships no history. For prose, a reference override that declares `patch` or `combine` needs no base at all; only whole-text copies need this.

## Several sections (Q3)

Divide by heading path, conquer by sentence. Flatten the heading tree into a list of parts keyed by heading path; no
recursion is needed because each part's own sentences are merged and children are separate parts. Nested headings are
handled by the path, and depth is bounded by Markdown's six levels. A rename is a removed part plus an added part;
guessing renames would make results depend on a heuristic. The base is chosen once for the whole document.
