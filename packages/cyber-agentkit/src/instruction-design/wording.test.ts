import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { comparisonName, readWording, sectionOf, slug } from './wording.js'

const agents = [
	'# AGENTS.md',
	'',
	'## Commit Discipline',
	'',
	'Commit each unit.',
	'',
	'### Staging',
	'',
	'Stage only your files.',
	'',
	'```md',
	'## Not a heading',
	'```',
	'',
	'## Project overview',
	'',
	'A toolkit.',
	'',
].join('\n')

function folder(): string {
	const dir = mkdtempSync(join(tmpdir(), 'wording-'))
	writeFileSync(join(dir, 'AGENTS.md'), agents)
	writeFileSync(join(dir, 'draft.md'), 'Commit when done.\n')
	return dir
}

describe('sectionOf', () => {
	it('takes the section from its heading to the next heading at its level or above, keeping its subsections', () => {
		expect(sectionOf(agents, 'Commit Discipline')).toEqual({
			section: 'Commit Discipline',
			text: '## Commit Discipline\n\nCommit each unit.\n\n### Staging\n\nStage only your files.\n\n```md\n## Not a heading\n```\n',
		})
	})

	it('matches a heading by its anchor or in another case', () => {
		expect(sectionOf(agents, 'commit-discipline')).toMatchObject({ section: 'Commit Discipline' })
		expect(sectionOf(agents, 'PROJECT OVERVIEW')).toMatchObject({ text: '## Project overview\n\nA toolkit.\n' })
	})

	it('ignores a heading inside a fenced code block', () => {
		expect(sectionOf(agents, 'Not a heading')).toMatchObject({ problem: 'missing' })
	})

	it('reports a heading that appears twice as ambiguous', () => {
		expect(sectionOf('## A\n\nx\n\n## A\n\ny\n', 'A')).toMatchObject({ problem: 'ambiguous' })
	})
})

describe('readWording', () => {
	it('reads a whole file', () => {
		const dir = folder()
		expect(readWording('draft.md', dir)).toMatchObject({ source: 'draft.md', text: 'Commit when done.\n' })
		expect(readWording('draft.md', dir)).not.toHaveProperty('section')
	})

	it('reads one section of a file', () => {
		const dir = folder()
		expect(readWording('AGENTS.md#Project overview', dir)).toMatchObject({
			path: join(dir, 'AGENTS.md'),
			section: 'Project overview',
			text: '## Project overview\n\nA toolkit.\n',
		})
	})

	it('names a missing file, and a missing section with the headings the file has', () => {
		const dir = folder()
		expect(readWording('NOPE.md', dir)).toEqual({ code: 'wording-missing', problem: 'no file NOPE.md' })
		expect(readWording('AGENTS.md#Delegation', dir)).toEqual({
			code: 'section-missing',
			problem:
				'AGENTS.md has no heading Delegation; its headings are AGENTS.md, Commit Discipline, Staging, Project overview',
		})
	})
})

describe('comparisonName', () => {
	it('is the section anchor, else the file name', () => {
		const dir = folder()
		const section = readWording('AGENTS.md#Commit Discipline', dir)
		const whole = readWording('draft.md', dir)
		if ('problem' in section || 'problem' in whole) throw new Error('unread')
		expect(comparisonName(section)).toBe('commit-discipline')
		expect(comparisonName(whole)).toBe('draft')
		expect(slug('Hello, World!')).toBe('hello-world')
	})
})
