# Conclusion: prior art for plugin dependencies and reference-keyed overrides

## Last updated
October 2026 (draft, not saved to any repo)

## Question
Are there existing systems close to cyber-agentkit's dependency declaration, doctor, neutral-name resolution, and namespaced extension key?

## Verdict
1. Dependencies across harnesses: only Claude Code has a native field. Microsoft APM is the one close cross-harness system, but as an installer with its own manifest. No agent-plugin system found that reads one neutral declaration and reports per-harness support. Nothing close to that exists, to the extent searched.
2. Doctor: strong generic patterns (flutter doctor, brew doctor); no agent-plugin doctor found (apm audit is the nearest, and it checks drift, not missing dependencies).
3. Neutral names with default/override/pin: update-alternatives and Gentoo virtuals match the semantics closely; ServiceLoader and entry points show that discovery-only designs push the problem to consumers. Nothing in the agent ecosystem found.
4. Namespaced key: the pattern is standard (Agent Plugins s8, entry-point groups, MCP reverse-DNS); the open point is ownership of the namespace.

## Reference material
| Sub-problem | Closest | Copy | Avoid |
| --- | --- | --- | --- |
| 1 | APM, Claude Code, VS Code, Home Assistant, npm peers | hard vs ordering-only vs optional distinction; lockfile hashes; direct beats transitive | making the library an installer; assuming silent success on harnesses with no field |
| 2 | flutter doctor, brew doctor, apm audit --ci | independent crash-guarded checks; result states beyond pass/fail; list-checks; non-zero exit | printing remedies not tied to a named check |
| 3 | update-alternatives, Gentoo virtuals, Nix overlays, npm overrides | auto/manual modes where an explicit pin sticks and has a way back; root-only overrides; ordered deterministic precedence | leaving conflict to the consumer (ServiceLoader, entry points); order-by-discovery |
| 4 | Agent Plugins s8, entry points, MCP registry | owned-prefix namespace; ignore-unknown tolerance | assuming reverse-domain implies verified ownership |

## Confidence
Medium for patterns; Low-Medium for APM details (partial read) and skills.sh absence claims.

## Strongest supporting evidence
E-PA-13, 15, 16, 17, 19 (primary docs, High). E-PA-1/2 (APM, primary but partially read).

## Weakening evidence
APM remainder unread; Codex/Cursor mechanisms may exist undocumented; Gentoo current behavior unverified.

## Not supported
That any agent-plugin system offers pins or default markers; that APM has a doctor.

## Thin
MCP registry, Codex, OSGi, OpenAPI x-, npm ls, apt/dpkg, VS Code missing-dependency behavior.

## Check again later
APM releases (fast-moving), Cursor and Codex manifests, skills.sh CLI `ci` command (issue #549).
