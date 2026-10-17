/**
 * Shapes copied from repobuddy's `project-tracker.contract` and `scaffold.contract`, written as the
 * interface documents issue #97 maps them onto.
 */
export const capabilitiesInterface = `---
description: What a project-tracker.capabilities.<tracker> reference must contain.
tags: [project-tracker, interface]
interface:
  cardinality: many
  version: 1
  sections:
    - Tracker: required
    - Detect: required
    - Kinds
    - Search
    - Create
    - Link
    - Retype
    - Close
    - Url
---

## Item ref

Every operation that returns an item gives the skill this record.
`

export const routingInterface = `---
description: What project-tracker.routing holds.
interface:
  cardinality: one
  version: 1
  tiers: [project]
  sections:
    - Routes: required
    - Moves
---

## Rows

The first row that matches the level and category wins.
`

export const recipeInterface = `---
description: What a scaffold.recipe.<name> reference must contain.
tags: [scaffold, interface]
interface:
  cardinality: many
  version: 1
  versions: [1]
  tiers: [managed, project, user, plugin]
  sections:
    - Recipe: required
    - Inputs
    - Files
    - Config
    - Verify
    - Post
---

## Ownership

repobuddy owns this contract and the scaffold skill that reads it.

## Order of work

Recipe, Inputs, the host setup, Files, Config, Verify, Post.
`

export const githubCapabilities = `---
description: What the GitHub tracker can do for issue, epic, and initiative skills.
tags: [project-tracker, github, issue]
implements: project-tracker.capabilities@1
---

## Tracker

- Name: \`github\`

## Detect

- The \`origin\` remote host is \`github.com\`.

## Kinds

Read the issue types of the repository.

## Search

\`\`\`bash
gh issue list --state all --search "<keywords> in:title,body"
\`\`\`

## Create

\`\`\`bash
gh issue create --title "<title>" --body-file <file>
\`\`\`

## Link

- Child of: \`--parent <number|url>\`.

## Retype

**Unsupported.** Retyping is done by hand.

## Close

\`\`\`bash
gh issue close <n> --reason completed
\`\`\`

## Url

- \`gh issue view <n> --json url --jq .url\`
`

export const typescriptRecipe = `---
description: A TypeScript library.
implements: scaffold.recipe@1
---

## Recipe

- Name: typescript-lib

## Files

- \`package.json\`
`
