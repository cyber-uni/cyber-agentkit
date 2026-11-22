# Evidence: capability-references

Confidence: H high, M medium, L low. All read 2026-11-22. Repository sources were read from a shallow clone of
`repobuddy/repobuddy` on `main` and from this repository.

## E1 repobuddy ships one interface and three implementations, not an Asana one
- Claim: `packages/buddy/references/` holds `project-tracker.capabilities.interface.md` and its GitHub, GitLab, and
  Jira implementations. Each declares `implements: project-tracker.capabilities@1`. No Asana or Linear implementation
  exists in repobuddy, and cyber-asana's `references/` holds report and sprint-model references only.
- Source: https://github.com/repobuddy/repobuddy/tree/main/packages/buddy/references ;
  https://github.com/cyberuni/cyber-asana/tree/main/packages/cyber-asana/references
- Type: code. Confidence: H.
- Status: supports. The issue's example of `.asana` is planned (repobuddy's decision 0003 says cyber-asana ships it), not shipped.

## E2 The interface fixes operations, a record shape, an unsupported rule, and a version rule
- Claim: `cardinality: many`, `version: 1`. Sections `Tracker`, `Detect` (required), then `Kinds`, `Search`, `Create`,
  `Link`, `Retype`, `Close`, `Url`, `Ownership`, `Board`, `Transfer`, `Depend`, `Sync body`. "Heading text is API."
  An Item ref record (`id`, `title`, `state`, `url`, `level`). A section the tracker cannot honor starts
  `**Unsupported.**` with one sentence why and an optional `Workaround:` line; an absent section counts as
  unsupported. Adding a section keeps the version; renaming or removing one, or changing the record, raises it.
- Source: https://github.com/repobuddy/repobuddy/blob/main/packages/buddy/references/project-tracker.capabilities.interface.md
- Type: code (reference text). Confidence: H.
- Status: supports. The reference system already provides most of this machinery (E9).

## E3 The implementations are runtime adapters: commands per operation
- Claim: each section's body is the shell command for that operation (`gh issue create --repo <owner>/<repo> ...`,
  `glab api ...`, a `jira()` curl function). The skills say "This skill owns the workflow; the reference owns the
  commands" and call operations by section name.
- Source: https://github.com/repobuddy/repobuddy/blob/main/packages/buddy/references/project-tracker.capabilities.github.md ;
  https://github.com/repobuddy/repobuddy/blob/main/packages/buddy/skills/issue/SKILL.md
- Type: code. Confidence: H.
- Status: mixed. The issue defines a capability reference as input for generating or customizing a skill; the shipped
  ones are read by an unchanged skill at run time. Two purposes, one name.

## E4 Why one shared name: a new tracker needs no change to the skills
- Claim: "Every provider ships its capabilities under one shared, unprefixed name... so the consumer never needs to know
  which package provides a tracker... a new tracker appears without any change to repobuddy."
- Source: https://github.com/repobuddy/repobuddy/blob/main/.agents/spec/design/decisions/0003-split-file-issue-by-level.md (point 4)
- Type: decision record with rationale. Confidence: H.
- Status: supports the value of the pattern over instructions inlined in a skill.

## E5 Versions and tiers live in prose; nothing records when a reference was verified
- Claim: GitHub's `Tracker` says "Needs `gh` 2.98.0 or later (`--type` arrived in 2.94.0; `--search-type` in 2.98.0)".
  GitLab: "Epics as work items need GitLab 18.1 or later", a tier-aware `Detect`, a `Tier` column in `Retype`. Jira:
  Cloud only, initiatives on Premium or Enterprise. No reference has a doc-link field or a verified date. GitLab and Jira
  say "Untested: no command in this reference has run against a GitLab instance" and tag commands `*(untested)*`.
- Source: the three implementations under https://github.com/repobuddy/repobuddy/tree/main/packages/buddy/references
- Type: code. Confidence: H.
- Status: supports. Authors already need since-version, tier, and verification status, and invent each form.

## E6 Facts that belong to a system are hardcoded in the skills
- Claim: the host-to-tracker mapping (`github.com` to GitHub, a host `glab auth status` accepts to GitLab) and the
  six-step resolution are copied into `issue`, `epic`, and `initiative`. The no-command fallback names only GitHub and
  GitLab, so Jira works only when the `reference` command runs. Visibility, levels, and categories are prose bullets
  under `Tracker` that skills read with no schema.
- Source: https://github.com/repobuddy/repobuddy/blob/main/packages/buddy/skills/issue/SKILL.md (Trackers) ;
  https://github.com/repobuddy/repobuddy/blob/main/packages/buddy/skills/epic/SKILL.md ;
  https://github.com/repobuddy/repobuddy/issues/935
- Type: code and issue. Confidence: H.
- Status: supports. Adding a tracker still edits skills, against E4's goal.

## E7 History of the tracker references
- Claim: built under epic #801 (file work at any level, on any tracker); the interface began as
  `project-tracker.contract` (#803) and still loads under that name with a rename warning; GitLab in #806, Jira in #991;
  bundled interface copies in #947.
- Source: https://github.com/repobuddy/repobuddy/issues/801 , https://github.com/repobuddy/repobuddy/issues/803 ,
  https://github.com/repobuddy/repobuddy/issues/806 , https://github.com/repobuddy/repobuddy/issues/991 ,
  https://github.com/repobuddy/repobuddy/issues/947
- Type: issue threads. Confidence: H.

## E8 The owner's second brain holds no prior design for this
- Claim: no note or research topic covers per-system capability descriptions. Starred prior art touches the
  neighbourhood only: Context7 (live docs for agents), OpenAPI and orval (generate from a description), oiap (write a
  plugin once, export per platform).
- Source: https://github.com/unional/second-brain (private; `stars/README.md`, `notes/`, `.research/`)
- Type: personal knowledge base. Confidence: H for the absence.

## E9 cyber-agentkit's reference system already has interfaces, keyed implementations, and the unsupported marker
- Claim: an interface (K8) lists sections in order, which are required, and what each holds; cardinality `many` keys
  implementations as `<id>.<key>`; `implementations` lists those that pass `check`, with their unsupported sections;
  `create --implements` stubs each section `**Unsupported.**`; the spec's own example of UC15 is
  `project-tracker.capabilities.asana`.
- Source: this repository, the reference spec (K8, UC6, UC15) and the `reference` skill's create and load procedures.
- Type: spec and code. Confidence: H.
- Status: supports. A capability reference needs no new resolution mechanism.

## E10 LSP: capability flags, no version handshake, "since" markers for readers
- Claim: `initialize` exchanges client and server capabilities; a missing property means absent; unknown properties are
  ignored. Features carry "Since version 3.x" markers and `@deprecated`, for readers, not for negotiation.
- Source: https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/
- Type: spec. Confidence: H.

## E11 MCP: negotiated capabilities and a self-description that announces change
- Claim: `initialize` negotiates `protocolVersion` and capabilities; only negotiated ones may be used. `tools/list` is
  the self-description (name, description, input schema); `listChanged` makes the server announce a change. Annotations
  are untrusted unless the server is trusted.
- Source: https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle ;
  https://modelcontextprotocol.io/specification/2025-06-18/server/tools
- Type: spec. Confidence: H.

## E12 OpenAPI separates the format's version from the described system's; Arazzo describes workflows over it
- Claim: `openapi` is the spec version, `info.version` the description's version. Arazzo describes sequences of API
  calls and points at operations by `operationId` through `sourceDescriptions`.
- Source: https://spec.openapis.org/oas/latest.html ; https://spec.openapis.org/arazzo/latest.html
- Type: spec. Confidence: H.
- Status: supports splitting "what the system can do" (OpenAPI, the capability reference) from "the workflow over it"
  (Arazzo, the skill), which is repobuddy's split (E3).

## E13 MDN browser-compat-data: per-feature support with since, partial, flags, notes, and links
- Claim: per feature per browser: `version_added` (a version, `false`, or `preview`), `version_removed`,
  `partial_implementation` (a note is then required), `flags`, `notes`, `impl_url`, `status`, `mdn_url`, `spec_url`.
- Source: https://github.com/mdn/browser-compat-data/blob/main/schemas/compat-data-schema.md
- Type: schema docs. Confidence: H.

## E14 BCD stays current through a collector that tests real browsers; manual mirroring went stale
- Claim: contributor PRs pass a schema linter; mdn-bcd-collector's test results feed updates; the docs say the original
  manual mirroring script let mirrored data go stale.
- Source: https://github.com/mdn/browser-compat-data/blob/main/docs/contributing.md
- Type: docs. Confidence: M (the collector's own page was not read).
- Status: the strongest practical evidence on staleness found: hand-maintained data rots, tested data does not.

## E15 Terraform provider schemas are emitted by the provider, with a format version
- Claim: `terraform providers schema -json` emits provider, resource, and data-source schemas with `format_version`;
  consumers ignore unknown properties and reject an unknown major version.
- Source: https://developer.hashicorp.com/terraform/cli/commands/providers/schema
- Type: docs. Confidence: H for the shape, M that it is derived from provider code.

## E16 llms.txt and Context7: a short curated map plus links, not a rewrite of the docs
- Claim: llms.txt is an H1, a summary blockquote, and H2 lists of `[name](url): note`, with an Optional section; the
  detail stays behind the links. Context7 fetches version-specific docs on demand.
- Source: https://llmstxt.org/ ; https://github.com/upstash/context7
- Type: proposal and docs. Confidence: H for llms.txt, M for Context7.
- Status: supports "summary plus links" over copying a system's docs, and over a bare link.

## E17 Adapter libraries declare partial support per system
- Claim: SQLAlchemy dialects override `supports_*` flags from a base; Libcloud publishes a provider-by-method yes/no
  matrix; Knex marks features supported, emulated, or unsupported per dialect.
- Source: https://docs.sqlalchemy.org/en/20/core/internals.html ;
  https://libcloud.readthedocs.io/en/stable/compute/supported_providers.html ;
  https://knexjs.org/guide/schema-builder.html
- Type: docs. Confidence: M, H, H.
- Status: supports a third level between supported and unsupported: emulated, which repobuddy writes as `Workaround:`.

## E18 Drift between a description and the live system is fixed by checking against the system
- Claim: contract-testing tools (Dredd, Schemathesis) check a description against the live API in CI, and cover only
  the paths their tests exercise.
- Source: https://dev.to/copyleftdev/title-when-swagger-lies-fixing-api-drift-before-it-breaks-you-ijo ;
  https://redocly.com/learn/ai-for-docs/ai-detect-drift-docs-live-api
- Type: blog and vendor. Confidence: M.
- Status: thin. No primary study of how hand-written capability prose rots was found, and no spec found records a
  "last verified" date.
