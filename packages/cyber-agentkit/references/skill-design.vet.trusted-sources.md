---
description: The skill sources /skill vet trusts - GitHub repositories or owners, git URLs, and local folders. A team adds its own with merge combine.
tags: [skill-design, vet, trust]
---

## Trusted sources

The plugin trusts no source. A tier adds entries with `merge: combine`, one list item each, in the shapes of Claude
Code's `strictKnownMarketplaces`: `acme/skills` or `acme/*` for GitHub, an `https://` git URL, an absolute folder, or
a mapping such as `{ source: github, repo: acme/skills, ref: v1.2.0, path: release-notes }`. An entry matches only a
source with the same ref and path. Text after the entry is a note: `acme/*: our own organization`.
