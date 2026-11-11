import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { readSkill, type SkillFiles } from './skill-files.js'

export const goodSkillMd = `---
name: release-notes
description: Use this skill when writing release notes for a release. Not for summarizing one pull request.
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

/** Writes a skill folder named after the `name` it holds, with the given files, and reads it. */
export function makeSkill(files: Record<string, string>, folderName = 'release-notes'): SkillFiles {
	const folder = join(mkdtempSync(join(tmpdir(), 'skill-design-')), folderName)
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

export const byId = <T extends { id: string }>(outcomes: T[]): Record<string, T> =>
	Object.fromEntries(outcomes.map((outcome) => [outcome.id, outcome]))
