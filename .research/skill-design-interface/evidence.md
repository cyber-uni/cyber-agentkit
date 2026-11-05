# Evidence: skill-design-interface

Confidence: H high, M medium, L low. All read 2026-11-05 from the primary text in the repositories.

## E1 Vercel skills CLI
- Claim: `npx skills init` writes one SKILL.md template (placeholder description, "When to use" and "Instructions" headings) and prints publishing options. It defines no design stages. Documents an internal-visibility flag and about 50 per-harness skill folders.
- Source: https://github.com/vercel-labs/skills (docs on creating skills; the `init` function in the CLI source)
- Type: code and docs. Confidence: H.

## E2 plugin-dev process
- Claim: six ordered steps (examples, plan resources, structure, edit, validate, iterate), imperative body, third-person description, 1,500-2,000 words, "one home per fact".
- Source: https://github.com/anthropics/claude-plugins-official/blob/main/plugins/plugin-dev/skills/skill-development/SKILL.md
- Type: official skill text. Confidence: H.

## E3 plugin-dev and separation
- Claim: it moves schemas, policies, and templates into bundled reference and asset files for context size and reuse; no step asks which choices another team would make differently.
- Source: same as E2. Type: official skill text. Confidence: M (the motive is inferred).

## E4 autoharness lifecycle
- Claim: hooks and small subagents only propose changes; a deterministic promoter lands them. Order: capture, compare against the index and prefer patching, reconcile, write at rule altitude, description first, choose level, validate. Curator merges clusters and prunes after probation.
- Source: https://github.com/tigerless-labs/autoharness (README, reflector and curator agent text)
- Type: code and docs. Confidence: H. The guard module was not read.

## E5 rebelytics three-container rule
- Claim: "needs three containers, not two": process in the skill, specifics in a private config file, only the trigger in the prompt. Test: would a different person need a different value here. Config wins for configuration, the skill wins for process, config can never relax a rule. First-run fallback asks for values.
- Source: https://github.com/rebelytics/one-skill-to-rule-them-all (authoring reference, section "Configuration vs process")
- Type: maintainer docs. Confidence: H.

## E6 rebelytics process and lifecycle
- Claim: authoring rules include open-source versus internal, pre-flight, description readers, upstream check, skill families with a reconciliation note, three eval scenarios first, hostile tests for scripts, and "harvest before you retire".
- Source: same as E5. Type: maintainer docs. Confidence: H. The weekly review file was not read.

## E7 Memento-Skills
- Claim: runtime lifecycle Read, Execute, Reflect, Write; failure attributed to one skill, rewritten in an isolated copy, gated, deployed atomically or rolled back. Bundled skill-creator is a modified copy of Anthropic's.
- Source: https://github.com/Memento-Teams/Memento-Skills (README, evolution engine, bundled skill-creator)
- Type: code and docs. Confidence: H; M for the background consolidation claim (README only).
