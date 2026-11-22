# Evidence log

Retrieved 2026-11-21. Literature entries come from search-result summaries unless noted; the
papers were not read in full. Status: supported, weakened, or unverified.

| ID | Claim | Source | Type | Status | Confidence | Notes |
|---|---|---|---|---|---|---|
| E101 | Multi-document QA accuracy is U-shaped in the position of the relevant passage | [Liu et al., Lost in the Middle (TACL 2024)](https://arxiv.org/abs/2307.03172) | Paper | Supported | High | Position, not reference structure; weak transfer |
| E102 | Multi-hop accuracy falls to the level of the least visible evidence; dispersed evidence hurts in long contexts | [Weakest Link Effect (ACL 2026)](https://aclanthology.org/2026.acl-long.1937.pdf); [arXiv 2601.02023](https://arxiv.org/html/2601.02023v1) | Paper | Supported | Medium | A comprehension dependency needs facts from two files; cycles untested |
| E103 | Accuracy falls with hop depth (1 to 4) over long narratives | [NovelHopQA](https://arxiv.org/pdf/2506.02000) | Benchmark | Supported | Medium | Per-hop numbers not retrieved |
| E104 | Input length alone degrades performance, even with perfect retrieval | [arXiv 2510.05381](https://www.arxiv.org/pdf/2510.05381) | Paper | Supported | Medium | Confound: a cycle also adds tokens |
| E105 | Drops are steeper on multi-hop and aggregation than on retrieval as context grows | [MLRBench](https://arxiv.org/html/2504.12845v1) | Benchmark | Supported | Medium | Synthetic; no cycle structure |
| E106 | Instruction following degrades with instruction count (about 68% at 500 for the best models) | [IFScale (NeurIPS 2025)](https://arxiv.org/abs/2507.11538) | Benchmark | Supported | Medium | Independent instructions; says nothing on circularity |
| E107 | Small agent models loop by re-reading files in chunks | [Lauffer et al. (Dec 2025)](https://arxiv.org/pdf/2512.14895) | Paper | Unverified | Low | Abstract did not confirm the claim |
| E108 | Repetitive actions correlate with unresolved SWE-agent and OpenHands trajectories | [Graphectory](https://arxiv.org/html/2512.02393) | Paper | Unverified | Low | No document-reference variable |
| E109 | Agent loops rise with task length and with memory compaction | [arXiv 2610.20959](https://arxiv.org/pdf/2610.20959) | Paper | Unverified | Low | Not opened |
| E110 | "Circular reasoning" loops in reasoning models | [LoopBench](https://arxiv.org/html/2601.05693v1) | Paper | Weakened | Low | Text-level loops, not between documents |
| E111 | Cross-document coreference is much harder than within-document | [EMNLP 2025](https://aclanthology.org/anthology-files/pdf/emnlp/2025.emnlp-main.1737.pdf); [IdentifyMe](https://arxiv.org/abs/2411.07466) | Paper | Supported | Low | NLP task, not instruction documents |
| E201 | Claude partially reads files referenced from referenced files; keep references one level deep | [Anthropic skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) | Vendor docs | Supported | High | Mechanism stated, not measured; no mention of cycles |
| E202 | CLAUDE.md imports recurse to a maximum of four hops | [Claude Code memory docs](https://code.claude.com/docs/en/memory) | Vendor docs | Supported | High | Loader safeguard, not comprehension evidence |
| E203 | A proposed AGENTS.md include directive requires rejecting circular includes | [openai/codex#17401](https://github.com/openai/codex/issues/17401) | Feature request | Unverified | Low | Proposal, not an incident |
| E204 | A forked skill re-invoked itself and spawned about 102 subagents in about 5 minutes | [anthropics/claude-code#55592](https://github.com/anthropics/claude-code/issues/55592) | Issue with reproduction | Supported | Medium | Invocation loop, not reading |
| E205 | Circular skill calls fail silently and burn tokens until timeout | [aiwg no-circular-skill-calls](https://app.unpkg.com/aiwg@2026.5.10/files/agentic/code/addons/aiwg-dev/rules/no-circular-skill-calls.md) | Maintainer rule | Supported | Low | Invocation, not comprehension |
| E206 | Skills auto-trigger each other through overlapping descriptions | [claudecodeguides.com](https://claudecodeguides.com/fix-claude-skill-infinite-loop/) | Blog | Weakened | Low | Hypothetical; no reproduction |
| E207 | Spec-driven tools name drift between spec artifacts; none addresses circular spec references | [Augment Code guide](https://www.augmentcode.com/guides/living-specs-vs-static-specs) | Secondary | Unverified | Low | Search snippets only |
| E301 | ADR-0021's comprehension-cycle rule argues by analogy to the code rule and cites no incident | [cyber-sdd ADR-0021](https://github.com/cyberuni/cyber-sdd/blob/main/docs/adr/0021-spec-dependency-kinds.md) | ADR | Supported | High | First added at f07024e0 (2026-07-03) in cyber-sdd |
| E302 | The Spec Dependencies concept page restates the analogy | [cyber-sdd Spec Dependencies page](https://github.com/cyberuni/cyber-sdd/blob/main/apps/web/src/content/docs/sdd/spec-dependencies.md) | Docs | Supported | n/a | Derivative |
| E303 | The incidents ADR-0021 cites are rename drift and slug leakage (`aces`→`aced`, fabricated `sdd:builder`) | [cyber-sdd ADR-0021](https://github.com/cyberuni/cyber-sdd/blob/main/docs/adr/0021-spec-dependency-kinds.md), Context | ADR | Supported | Medium | Not cycles; commits not traced |
| E304 | A bare cross-reference that withholds content imposes a bridging cost on human readers | [cyber-sdd documentation-craft research](https://github.com/cyberuni/cyber-sdd/blob/main/.research/documentation-craft/conclusion.md) | Research dossier | Supported | Medium | Human readers; cross-page transfer is inference |
| E305 | Shipped skills referenced flags, scripts, and paths that did not exist | [cyber-sdd#172](https://github.com/cyberuni/cyber-sdd/pull/172) | PR | Supported | Medium | Dangling references, not cycles |
| E306 | No local record of an agent confused by mutual document references | cyber-sdd ledger, `.research/`, `docs/adr`, cyberuni issues and PRs | Absence | Supported | Medium | Sibling repos searched through `gh` only |
