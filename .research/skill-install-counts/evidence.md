# Evidence — Skill install counts

Every claim carries its source and the date it was checked. "Direct fetch" rows were run with `curl`
without credentials from Linux (WSL).

Confidence: **High** means a vendor page states it or a direct fetch shows it. **Medium** means it is
implied or undocumented but observed. **Low** means indirect or third-party only.

## skills.sh

| ID | Claim | Source | Date | Status | Confidence |
|---|---|---|---|---|---|
| E-IC-1 | The leaderboard shows an Installs column and an all-time total | https://skills.sh | 2026-11-13 | verified | High, fetched |
| E-IC-2 | Rankings come from anonymous, deduplicated install counts collected by the skills CLI when users opt in; deduplication runs hourly | https://skills.sh/about | 2026-11-13 | verified | High, vendor doc |
| E-IC-3 | The CLI sends an install event (skill ID, agent, coarse timestamp, dedup fingerprint); opting out excludes a user's installs; "Anything visible on a skill page is also available through the public API" | https://skills.sh/privacy | 2026-11-13 | verified | High, vendor doc |
| E-IC-4 | API v1 documents `installs` as "Total deduplicated install count", with endpoints under `/api/v1/skills`, auth by Vercel OIDC token, 600 requests a minute authenticated | https://skills.sh/docs/api | 2026-11-13 | verified | High, vendor doc |
| E-IC-5 | Unauthenticated `GET /api/v1/skills/vercel-labs/skills/find-skills`, the leaderboard, search, and an unknown skill all return 401 `authentication_required` | https://skills.sh/api/v1/skills/vercel-labs/skills/find-skills | 2026-11-13 | verified | High, direct fetch |
| E-IC-6 | Unauthenticated `GET /api/search?q=find-skills&limit=3` returns 200 JSON with `skills[]` entries `{id, source, skillId, name, installs}`; `vercel-labs/skills/find-skills` had 4337932 | https://skills.sh/api/search?q=find-skills&limit=3 | 2026-11-13 | verified | High that it responds; Medium as a stable contract (undocumented path) |
| E-IC-7 | `/api/search` is fuzzy (`searchType: fuzzy`, Algolia); a query returns other owners' skills with similar names; a one-character query returns 400; no match returns an empty array | https://skills.sh/api/search?q=zzqqxx-nothing | 2026-11-13 | verified | High, direct fetch |
| E-IC-8 | Counts depend on opt-in telemetry, so they undercount; Vercel's report says they do not represent unique people | https://skills.sh/about ; https://vercel.com/blog/state-of-agent-skills | 2026-11-13 | verified (about page); report seen in search only | High (about); Low (report) |
| E-IC-9 | Telemetry opt-out is `DISABLE_TELEMETRY=1`; `DO_NOT_TRACK=1` and CI auto-disable are reported by a third-party mirror | https://skills.sh/docs/cli ; https://www.mintlify.com/vercel-labs/skills/advanced/telemetry | 2026-11-13 | search snippet only | Low |
| E-IC-10 | `/api/skills` returns the site's 404 page | https://skills.sh/api/skills | 2026-11-13 | verified | High, direct fetch |

## Claude Code plugin marketplaces

| ID | Claim | Source | Date | Status | Confidence |
|---|---|---|---|---|---|
| E-IC-11 | Anthropic's docs say claude.com/marketplace/plugins "shows install counts" | https://code.claude.com/docs/en/plugins/anthropic-marketplaces.md | 2026-11-13 | verified (doc text) | High that the doc says it |
| E-IC-12 | The fetched marketplace landing and plugins pages showed no per-plugin install count and no API link | https://claude.com/marketplace/plugins | 2026-11-13 | verified, may be client-rendered | Medium |
| E-IC-13 | The `/plugin` details pane lists will-install components, last updated, and context cost, not install counts | https://code.claude.com/docs/en/discover-plugins | 2026-11-13 | verified | High, vendor doc |

## Other registries

| ID | Claim | Source | Date | Status | Confidence |
|---|---|---|---|---|---|
| E-IC-14 | npm `downloads/point/last-week/skills` returned 5162211 for 2026-11-05 to 2026-11-11 with no auth; unknown package returns an error object | https://api.npmjs.org/downloads/point/last-week/skills | 2026-11-13 | verified | High, direct fetch; measures downloads |
| E-IC-15 | ClawHub counts `installsAllTime` as unique logged-in CLI users and does not decrement on uninstall; skills.sh events do not feed it | https://docs.clawhub.ai/telemetry | 2026-11-13 | docs URL returned 404 on fetch; claim from search snippets | Low |
| E-IC-16 | ClawHub endpoints such as `/api/top-downloads` and `/api/skill?slug=` | third-party skill pages | 2026-11-13 | not verified | Low |
| E-IC-17 | skillsmp.com returned 403 to fetch; Smithery gave no install-count results | https://skillsmp.com | 2026-11-13 | not verified | Low |

## GitHub

| ID | Claim | Source | Date | Status | Confidence |
|---|---|---|---|---|---|
| E-IC-18 | Unauthenticated repo endpoint returns `stargazers_count`, `forks_count`, `subscribers_count` (39195, 3435, 129 for vercel-labs/skills) | https://api.github.com/repos/vercel-labs/skills | 2026-11-13 | verified | High, direct fetch |
| E-IC-19 | `GET /repos/{owner}/{repo}/traffic/clones` returns 401 "Requires authentication" | https://api.github.com/repos/vercel-labs/skills/traffic/clones | 2026-11-13 | verified | High, direct fetch |
| E-IC-20 | Unauthenticated GitHub REST limit is 60 requests an hour | https://api.github.com/rate_limit | 2026-11-13 | verified | High, direct fetch |
