import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { readSkill, type SkillFiles } from './skill-files.js'
import { parseSandbox, type SandboxSettings } from './test-sandbox.js'

export const goodSkillMd = `---
name: release-notes
description: Write release notes for a release. Not for summarizing one pull request.
---

# Release notes

Writes release notes from the merged pull requests. Not for reviewing a pull request.

## Steps

1. Read the merged pull requests.

## Done when

Before reporting done, check each of these against the result. Report any that fails.

- **C1.** The notes start with a \`## Release notes\` heading.
- **C2.** No merge commit appears.
`

/**
 * A router skill (#337): `SKILL.md`'s \`## Done when\` points to the per-command lists at the end of each command file it
 * links, which together hold C1 to C3.
 */
export const routerSkillFiles = {
	'SKILL.md': `---
name: release-notes
description: Write or review release notes for a release. Not for summarizing one pull request.
---

# Release notes

| Command | File |
| --- | --- |
| \`write\` | [write.md](references/write.md) |
| \`review\` | [review.md](references/review.md) |

## Done when

Each command lists its own criteria at the end of its file.

- See [write](references/write.md#done-when) and [review](references/review.md#done-when).
`,
	'references/write.md': `# Write

1. Read the merged pull requests.

## Done when

- **C1.** The notes start with a \`## Release notes\` heading.
- **C2.** No merge commit appears.
`,
	'references/review.md': `# Review

1. Read the notes.

## Done when

- **C3.** Each problem names the line it is on.
`,
	'evals/evals.yaml': `trigger:
  - { prompt: write release notes, expect: fire }
  - { prompt: review the release notes, expect: fire }
  - { prompt: what shipped this release, expect: fire }
  - { prompt: summarize this pull request, expect: skip }
  - { prompt: review my diff, expect: skip }
  - { prompt: write a commit message, expect: skip }
outcome:
  - { id: write, prompt: write the notes, criteria: [C1, C2] }
  - { id: review, prompt: review the notes, criteria: [C3] }
rubrics:
  C1:
    - contains: "## Release notes"
  C2:
    - not-regex: "Merge (pull request|branch)"
  C3:
    - judge: Each problem names its line.
`,
}

export const goodEvals = `trigger:
  - { prompt: write release notes, expect: fire }
  - { prompt: draft the changelog for 2.0, expect: fire }
  - { prompt: what shipped this release, expect: fire }
  - { prompt: summarize this pull request, expect: skip }
  - { prompt: review my diff, expect: skip }
  - { prompt: write a commit message, expect: skip }
outcome:
  - { id: two-prs, prompt: write the notes, files: files/two-prs }
rubrics:
  C1:
    - contains: "## Release notes"
  C2:
    - not-regex: "Merge (pull request|branch)"
`

/**
 * `goodEvals` with an `id` on each trigger case (`fire-1`, ..., `skip-1`, ...), so a skill that holds it passes every
 * script check, VER-17 included. `goodEvals` keeps the positional form, which still works and only warns (R185).
 */
export const namedEvals = (() => {
	const count = { fire: 0, skip: 0 }
	return goodEvals.replace(
		/- \{ prompt: (.*), expect: (fire|skip) \}/g,
		(_, prompt: string, expect: 'fire' | 'skip') =>
			`- { id: ${expect}-${++count[expect]}, prompt: ${prompt}, expect: ${expect} }`,
	)
})()

/** Writes a skill folder named after the `name` it holds, in a `skills` root, with the given files, and reads it. */
export function makeSkill(files: Record<string, string>, folderName = 'release-notes'): SkillFiles {
	const folder = join(mkdtempSync(join(tmpdir(), 'skill-design-')), 'skills', folderName)
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(folder, path)), { recursive: true })
		writeFileSync(join(folder, path), text)
	}
	return readSkill(folder) as SkillFiles
}

/** A skill that passes every script check of the built-in and default aspects. */
export function goodSkill(extra: Record<string, string> = {}): SkillFiles {
	return makeSkill({
		'SKILL.md': goodSkillMd,
		'evals/evals.yaml': goodEvals,
		'evals/files/two-prs/prs.json': '[]',
		...extra,
	})
}

/** `goodSkill` holding `namedEvals`: a skill that meets every script check. */
export const namedSkill = (extra: Record<string, string> = {}): SkillFiles =>
	goodSkill({ 'evals/evals.yaml': namedEvals, ...extra })

export const byId = <T extends { id: string }>(outcomes: T[]): Record<string, T> =>
	Object.fromEntries(outcomes.map((outcome) => [outcome.id, outcome]))

/** The settings of a sandbox template the plugin ships (`references/skill-design.test.sandbox.<template>.yaml`). */
export function shippedSandbox(template: 'claude-code' | 'folder-only'): SandboxSettings {
	const read = parseSandbox(
		readFileSync(new URL(`../../references/skill-design.test.sandbox.${template}.yaml`, import.meta.url), 'utf8'),
	)
	if ('problem' in read) throw new Error(read.problem)
	return read.settings as SandboxSettings
}
