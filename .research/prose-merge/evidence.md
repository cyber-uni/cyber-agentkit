# Evidence: prose-merge

Confidence: H high, M medium, L low. All accessed 2026-10-22 through search summaries unless noted; primary reads still due.

## E1 dpkg and ucf
- Claim: dpkg records conffile checksums and, when the owner edited a file the package changes, only keeps, replaces or asks; ucf adds a diff3 three-way merge by caching the old shipped version. A forum reports it is rarely used in practice.
- Source: https://manpages.debian.org/jessie/ucf/ucf.1.en.html ; https://raphaelhertzog.com/2010/09/21/debian-conffile-configuration-file-managed-by-dpkg/ ; https://linuxfr.org/forums/linux-debian-ubuntu/posts/lister-les-modifications-de-conf
- Type: official man page, blog, forum. Confidence: M.

## E2 diff3 formal analysis
- Claim: diff3 is the algorithm behind git-style merges; its properties are subtler than assumed, e.g. edits to well-separated regions are not guaranteed conflict-free in general.
- Source: https://www.cis.upenn.edu/~sanjeev/papers/fsttcs07_diff3.pdf (abstract only read). Confidence: M.

## E3 git merge-file options
- Claim: `--diff-algorithm` takes myers (default), patience, histogram, minimal; histogram can avoid mismerges on unimportant matching lines; `--diff3`/`--zdiff3` show the base in conflicts; `--ours/--theirs/--union` resolve by favoring sides. No word-level option.
- Source: https://git-scm.com/docs/git-merge-file . Confidence: H.

## E4 Pijul
- Claim: models merges as pushouts of patches; conflicts are first-class states (same-position inserts, insert vs delete).
- Source: https://pijul.org/manual/conflicts ; https://pijul.com/model . Confidence: M.

## E5 Jujutsu
- Claim: conflicts are stored as data (odd-length list of trees), resolved later; automatic simplification is knowingly lossy.
- Source: https://git.joshthomas.dev/mirrors/jj/src/branch/main/docs/conflicts.md (mirror of jj docs). Confidence: M.

## E6 Learned/LLM merge
- Claim: MergeBERT 63-68% accuracy vs diff3 36.1% (TypeScript set); ConGra: longer context does not always help; general LLMs beat code LLMs on conflict resolution. Code only.
- Source: https://arxiv.org/pdf/2109.00084 ; https://arxiv.org/html/2409.14121v1 ; https://arxiv.org/pdf/2605.25890 . Confidence: M (figures vary by version).

## E7 Structure-aware and three-way apply systems
- Claim: Mergiraf resolves conflicts line merge cannot using tree-sitter trees (33 languages, Oct 2025). Helm 3 and kubectl apply use last-applied + live + target; Helm 2's two-way patch could not see out-of-band edits; strategic merge patch exists because plain merge patch cannot express deletion.
- Source: https://lwn.net/Articles/1042355 ; https://v3.helm.sh/docs/faq/changes_since_helm2 ; https://itnext.io/kubernetes-strategic-merge-patch-4bdd19b48789 (secondary). Confidence: M.

## E8 Local experiment (first-hand)
- Claim: `git merge-file` on Delegation wordings: per-paragraph lines give one conflict; per-sentence lines give two, both genuine.
- Source: scratch run 2026-10-22 using the 2026-09-27 retired wording from buddy-agent-harness `skills/enhance/references/delegation.history.md`. Confidence: H for this case, L for generality.

## E9 enhance's current procedure
- Claim: history = per-addition `*.history.md` of retired wordings; model-run two-question comparison; verdicts current / stale / owner's / cannot tell.
- Source: buddy-agent-harness `skills/enhance/SKILL.md` step 3 (0.21.0). Confidence: H.
