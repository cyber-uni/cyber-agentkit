# Prior art for plugin dependencies and reference-keyed overrides (October 2026)

## Question
Do existing systems solve (1) cross-harness plugin dependency declaration, (2) a read-only doctor, (3) neutral interface names with default/override/pin, (4) a namespaced extension key in a manifest standard?

## Scope
Findings only; no design decisions. Local facts: repo research `plugin-dependencies-and-overrides` (E-DEP-*, E-OVR-*), not re-verified.

## Findings
### (1) Declaring dependencies across harnesses
- Claude Code `dependencies` (E-DEP-1..3, E-PA-6): the only vendor-native plugin-to-plugin field; semver ranges; cross-marketplace allowlist. Cursor, Copilot CLI, Agent Plugins 1.0 have none (E-DEP-4). Codex: none found (E-PA-5, low).
- Microsoft APM (E-PA-1..3): closest cross-harness analog. Own manifest `apm.yml`, transitive resolution, lockfile with hashes, installs into many clients. Differs: it is an installer that writes files into each harness, not a library that reads what the harness installed.
- skills.sh / vercel-labs skills (E-PA-4): lockfile of sources only; no inter-skill dependency found.
- MCP registry (E-PA-7): no dependency field found.
- VS Code extensionDependencies / extensionPack (E-PA-8): the conceptual precedent for hard dependency vs. bundle.
- Home Assistant dependencies vs after_dependencies (E-PA-12): hard vs ordering-only distinction.
- npm peerDependencies + peerDependenciesMeta optional (E-PA-9): "host expects X" declaration with optional flag.

### (2) Doctor
- flutter doctor (E-PA-11): validator list, crash-isolated, result types (ok/partial/missing/crash/notAvailable) with differing exit effect.
- brew doctor (E-PA-10): named checks, `--list-checks`, non-zero exit on problems.
- apm audit --ci (E-PA-2): drift check against lockfile; exit 1 on failure.
- npm ls, apt/dpkg: not verified.

### (3) Neutral names, default/override/pin
- update-alternatives (E-PA-13): the closest semantic match. Priority picks automatic default; an explicit choice flips to manual and sticks; `--auto` returns; machine-readable `--query`.
- Gentoo virtuals (E-PA-14): neutral name is itself a package holding an any-of list; user-level override file; ordering = preference.
- ServiceLoader (E-PA-15) and Python entry points (E-PA-16): discovery only, deliberately no priority; leave conflicts to the consumer. Evidence that a resolver layer is the missing piece.
- npm overrides (E-PA-9): root-only, so a dependency cannot override its consumers; matches "project/user pin beats plugins".
- Nix overlays (E-PA-17): explicit ordered list, later wins; error on ambiguous user config location.
- Backstage (E-PA-18): extension points with a default and swap-in modules.
- APM collision rule (E-PA-2): direct beats transitive; same-level tie errors. Same shape as the existing "held by more than one plugin" failure (E-OVR-4).
- OSGi: not researched.

### (4) Namespaced extension key
- Agent Plugins s8 (E-PA-19): defines the key form, no registry, no conflict procedure; ignoring unknown namespaces is mandated, so presence on non-implementing clients is safe.
- Python entry-point groups prefixed with an owned PyPI name (E-PA-16) and MCP registry reverse-DNS with proven ownership (E-PA-7, low) are the two ownership-verification precedents; Agent Plugins only says "SHOULD be a domain the client controls".
- OpenAPI x-, package.json vendor fields, VS Code contributes: unverified.

## Contradictions
- APM client list differs across sources (E-PA-3).
- Codex dependency evidence is a third-party blog only (E-PA-5).

## Open questions
- Does Codex or Cursor have any undocumented dependency mechanism? Re-check vendor docs.
- Does APM's unread remainder (2M chars) define override/precedence for same-named primitives?
- OpenAPI x- rules, OSGi, npm ls, apt/dpkg, VS Code missing-dependency behavior.
- Does anything combine a read-only doctor with reference/skill resolution? None found.

## Sources consulted
See evidence.md.
