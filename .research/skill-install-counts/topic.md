# Topic — Skill install counts

## Why this topic exists

`/skill vet <source>` in the `cyber-agentkit` CLI reports supply-chain signals before a skill is
installed. Issue [cyber-uni/cyber-agentkit#188](https://github.com/cyber-uni/cyber-agentkit/issues/188)
sets one rule: show an install count only from a source we verified; if none is reliable, leave the
count out; never label a stand-in such as GitHub stars as installs. This topic finds out which
sources exist.

The answer is in [conclusion.md](./conclusion.md). This file records how it was reached.

## Method

One session on 2026-11-13. Vendor documentation first (WebFetch), then direct unauthenticated
requests with `curl` from Linux (WSL) with a plain research user agent and no credentials. Fetched
page content was treated as data. Sources: A skills.sh, B Claude Code plugin marketplaces, C other
registries (ClawHub, skillsmp, Smithery, npm), D GitHub.

## A. skills.sh

The leaderboard at skills.sh has an "Installs" column (find-skills showed 4.3M, header "All Time
(1,389,065)"). The About page says rankings "come from anonymous, deduplicated install counts
collected by the skills CLI when users opt in", with deduplication hourly. The privacy page says the
CLI sends an install event (skill ID, agent name, coarse timestamp, short fingerprint) and that
"Anything visible on a skill page is also available through the public API". Opting out is
`DISABLE_TELEMETRY=1`; the CLI source repo is vercel-labs/skills.

The documented API is v1 (`https://skills.sh/docs/api`, which redirects to www.skills.sh). Endpoints:
`/api/v1/skills` (leaderboard, `source=owner/repo` filter), `/api/v1/skills/search`,
`/api/v1/skills/curated`, `/api/v1/skills/{source}/{skill}` (installs, hash, files), and
`/api/v1/skills/audit/{source}/{skill}` (partner audits). Authentication is a Vercel OIDC token,
rate limit 600 requests a minute per (team, project). The docs leave per-endpoint auth unstated. Live
test: every v1 path, including an unknown skill, answered 401 `authentication_required` asking for
the OIDC token. So v1 is not usable by a plain CLI user.

The older `GET https://skills.sh/api/search?q=<q>&limit=<n>` answered 200 unauthenticated with
JSON. A query shorter than two characters returns 400 `Query must be at least 2 characters`. An
unmatched query returns an empty `skills` array. The response carries `x-search-version: algolia`
and a `rate_limit` timing, so it is rate limited, but no limit is published. Search is fuzzy, so
exact matching on `source` and `skillId` is required. `/api/skills` returns the site's 404 page.

## B. Claude Code plugin marketplaces

Anthropic's docs (anthropic-marketplaces page) say the web catalog at claude.com/marketplace/plugins
"shows install counts". The fetched landing and plugins pages showed no per-plugin count, only
rank order and "530 plugins"; they may render counts client-side. The marketplaces themselves are
GitHub repositories whose `marketplace.json` has no count field, and `/plugin` Discover shows
description, last updated, and context cost, not installs. No API is documented. Not usable.

## C. Other registries

ClawHub (docs.clawhub.ai/telemetry, OpenClaw's registry) keeps per-skill counters such as
`installsAllTime`, counted as unique logged-in CLI users, fed by its own CLI, not by skills.sh
installs. Its endpoints came only from third-party pages and were not verified. skillsmp.com
returned 403 to fetch. Smithery returned nothing relevant in search. agentskills.io is the format
specification and publishes no counts. npm: `https://api.npmjs.org/downloads/point/last-week/skills`
returned `{"downloads":5162211,"start":"2026-11-05","end":"2026-11-11","package":"skills"}` with no
auth; an unknown package returns `{"error":"package ... not found"}`. That is downloads, and only
for skills shipped as npm packages.

## D. GitHub

Unauthenticated `GET /repos/vercel-labs/skills` returned `stargazers_count`, `forks_count`,
`subscribers_count`. `GET /repos/vercel-labs/skills/traffic/clones` returned 401 "Requires
authentication"; the docs require push access. No GitHub API reports skill installs. The
unauthenticated limit is 60 requests an hour.

## Findings

skills.sh is the only registry with a large install population (the `npx skills` CLI) and a
machine-readable count a tool can fetch without credentials, through an undocumented path. Treat it
as optional enrichment that must fail silent.
