# Conclusion — Skill install counts (November 2026)

## Last updated

2026-11-13. Opened for [cyber-uni/cyber-agentkit#188](https://github.com/cyber-uni/cyber-agentkit/issues/188).

## Question

Where can a tool get a reliable, machine-readable install count for a third-party agent skill (an
Agent Skills `SKILL.md` folder, usually in a GitHub repository), given a source like `owner/repo` or
`owner/repo/path/to/skill`?

## Verdict

**One source is usable: skills.sh, the directory behind the `npx skills` CLI, through its
unauthenticated search endpoint.** No other source found gives an install count a tool can read
without credentials, and none can be derived from GitHub.

Use this endpoint:

```
GET https://skills.sh/api/search?q=<skill-name>&limit=<n>
```

It needs no credentials. It returns an `installs` integer per skill, with `id` in the form
`owner/repo/skill-name`. Match the entry whose `source` equals the requested `owner/repo` and whose
`skillId` equals the skill's name. Never take the first hit: search is fuzzy, so a query for
`find-skills` also returns unrelated skills with other owners.

Sample response shape (fetched 2026-11-13):

```json
{"query":"find-skills","searchType":"fuzzy","searchVersion":"algolia",
 "skills":[{"id":"vercel-labs/skills/find-skills","source":"vercel-labs/skills",
            "skillId":"find-skills","name":"find-skills","installs":4337932}],
 "count":1}
```

Confidence: **Medium**. The endpoint answered unauthenticated and the numbers match the skills.sh
site, but the vendor does not document it. The documented replacement, `/api/v1/skills/...`, returns
`401 authentication_required` without a Vercel OIDC token, so the legacy path may be retired. A tool
must treat any non-200 answer, a changed shape, or a missing match as "no count" and omit the line.

## What the number means

Per the skills.sh API reference, `installs` is the "total deduplicated install count". It counts
install events the `skills` CLI sends when a user has telemetry on, deduplicated hourly with a short
fingerprint. It excludes users who opted out (`DISABLE_TELEMETRY=1`, `DO_NOT_TRACK=1`) and CI runs.
It is not unique people and not downloads. Label it "installs via the skills CLI (skills.sh)", never
plain "installs" and never "users".

Limits a tool must respect:

- The key is the skill name under a repository, not a folder path. For `owner/repo/path/to/skill`,
  match on the skill's `name` from its `SKILL.md`, and omit the count when it is ambiguous.
- Skills never installed through the CLI, or in repositories skills.sh never saw, have no entry.
  Report that as "no count", not as zero.
- A fork or copy has its own count (the API marks some with `isDuplicate`), so a count does not
  transfer between repositories.
- Counts are all-time unless a view is requested (`trending` and `hot` exist only in v1).

## Signals not to label as installs

- **GitHub stars, forks, and watchers.** Public (`stargazers_count`, `forks_count`,
  `subscribers_count`), but they measure interest. Show them only under their own names.
- **GitHub clone counts.** `GET /repos/{owner}/{repo}/traffic/clones` returns 401 without push
  access, so a tool cannot read it for a third-party repository. It would count clones, not installs.
- **npm downloads** (`api.npmjs.org/downloads/point/last-week/<pkg>`). Public and unauthenticated,
  but they count tarball fetches, including mirrors and CI. Valid only for a skill shipped as its own
  npm package, and then labelled "npm downloads".
- **ClawHub counters.** Per-skill `installsAllTime` exists for the ClawHub registry only. It does not
  count skills.sh installs and covers a different catalog.
- **Claude Marketplace.** Anthropic's docs say claude.com/marketplace/plugins "shows install counts",
  but the fetched pages showed none and no API is documented. Not machine-readable.

## What to do in `/skill vet`

1. Query the skills.sh search endpoint for the skill name, with a short timeout.
2. Accept only an exact `source` plus `skillId` match with an integer `installs`.
3. Print it as "installs via skills.sh CLI: N (opt-in telemetry, deduplicated)".
4. On any failure, ambiguity, or no match, leave the line out. Do not substitute stars.
5. Do not send Vercel OIDC tokens or any user data. The query carries only the skill name.

If the skills.sh API later offers unauthenticated v1 access, switch to
`GET https://skills.sh/api/v1/skills/{owner}/{repo}/{skill}`, which returns `installs`, `hash`, and
the file tree for exactly one skill and removes the fuzzy-match risk. Re-run this research first.

## Open questions

- Whether `/api/search` is intended as public. The privacy page says "Anything visible on a skill
  page is also available through the public API", which supports it, but no page names the path.
- Rate limits for unauthenticated callers are undocumented.
- skillsmp.com (403 to our fetch) and Smithery were not verified.
