import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ExpectedFile } from './expected-result.js'
import { checkLayout } from './layout-checks.js'
import type { CheckOutcome } from './skill-check-types.js'
import { recordExpected, scopedSkill } from './skill-design.fixtures.js'
import { readSkill, type SkillFiles } from './skill-files.js'
import { checkStaleCases } from './stale-checks.js'
import { checkVerification } from './verification-checks.js'

const byId = (outcomes: CheckOutcome[]) => Object.fromEntries(outcomes.map((outcome) => [outcome.id, outcome]))
const write = (skill: { folder: string }, path: string, text: string) => {
	mkdirSync(dirname(join(skill.folder, path)), { recursive: true })
	writeFileSync(join(skill.folder, path), text)
}
const reread = (skill: { folder: string }) => readSkill(skill.folder) as SkillFiles

const recordAll = (skill: SkillFiles, change?: Parameters<typeof recordExpected>[1]) => {
	recordExpected(skill, change)
}

describe('SHP-21: an eval folder is named for an instructions file (R186)', () => {
	it('passes when each eval folder has its instructions file', () => {
		expect(byId(checkLayout(scopedSkill()))['SHP-21']).toEqual({ id: 'SHP-21', status: 'pass' })
	})

	it('fails an eval folder named for no instructions file, naming the file it lacks', () => {
		const skill = scopedSkill({ 'evals/publish/evals.yaml': 'outcome: []\n' })
		expect(byId(checkLayout(skill))['SHP-21']).toMatchObject({
			status: 'fail',
			file: 'evals/publish/evals.yaml',
			message: expect.stringContaining(
				'evals/publish/ is named for no instructions file: there is no references/publish.md',
			),
		})
	})

	it('ignores a folder under evals/ that holds no evals.yaml, such as files/', () => {
		expect(byId(checkLayout(scopedSkill({ 'evals/files/x/a.txt': 'a' })))['SHP-21']).toMatchObject({ status: 'pass' })
	})
})

describe('Verification reads every eval folder (K11)', () => {
	it('counts the cases of eval folders for coverage and their files', () => {
		const outcomes = byId(checkVerification(scopedSkill()))
		expect(outcomes['VER-1']).toEqual({ id: 'VER-1', status: 'pass' })
		// C2 and C3 are tested only by cases in eval folders.
		expect(outcomes['VER-13']).toEqual({ id: 'VER-13', status: 'pass' })
		expect(outcomes['VER-4']).toEqual({ id: 'VER-4', status: 'pass' })
	})

	it('resolves a folder case’s files from its own folder', () => {
		const skill = scopedSkill({
			'evals/audit/evals.yaml':
				'outcome:\n  - { id: audit-one, prompt: audit, criteria: [C3], files: files/missing }\n',
		})
		expect(byId(checkVerification(skill))['VER-4']).toMatchObject({
			status: 'fail',
			message: 'case audit-one: evals/audit/files/missing does not exist',
		})
	})

	it('fails VER-1 on an eval folder file that holds more than its cases', () => {
		const skill = scopedSkill({
			'evals/audit/evals.yaml': 'runs: 2\noutcome:\n  - { id: audit-one, prompt: audit, criteria: [C3] }\n',
		})
		expect(byId(checkVerification(skill))['VER-1']).toMatchObject({
			status: 'fail',
			message: expect.stringContaining('evals/audit/evals.yaml: `runs` belongs in evals/evals.yaml'),
		})
	})

	it('fails VER-1 on an ID that names a case in two eval files', () => {
		const skill = scopedSkill({
			'evals/audit/evals.yaml': 'outcome:\n  - { id: write-two, prompt: audit, criteria: [C3] }\n',
		})
		expect(byId(checkVerification(skill))['VER-1']).toMatchObject({
			status: 'fail',
			message: expect.stringContaining("case ID write-two names more than one case across the skill's eval files"),
		})
	})

	it('lists a known failure marked in an eval folder', () => {
		const skill = scopedSkill({
			'evals/audit/evals.yaml':
				'outcome:\n  - { id: audit-one, prompt: audit, criteria: [C3], fails: { C3: flaky judge } }\n',
		})
		expect(byId(checkVerification(skill))['VER-16']).toMatchObject({
			status: 'fail',
			message: expect.stringContaining('audit-one C3 (flaky judge)'),
		})
	})

	it('leaves a folder named for no instructions file to SHP-21', () => {
		const skill = scopedSkill({ 'evals/publish/evals.yaml': 'not: [valid' })
		expect(byId(checkVerification(skill))['VER-1']).toEqual({ id: 'VER-1', status: 'pass' })
	})
})

describe('VER-18 and VER-19: stale and carried cases (R186)', () => {
	it('passes when every entry was recorded against the inputs as they are now', () => {
		const skill = scopedSkill()
		recordAll(skill)
		expect(checkStaleCases(reread(skill))).toEqual([
			{ id: 'VER-18', status: 'pass' },
			{ id: 'VER-19', status: 'pass' },
		])
	})

	it('warns on each stale case, naming its scope and the input that changed', () => {
		const skill = scopedSkill()
		recordAll(skill)
		write(skill, 'references/style.md', '# Style\n\nKeep each line under 80 characters.\n')
		const [stale] = checkStaleCases(reread(skill))
		expect(stale).toEqual({
			id: 'VER-18',
			status: 'fail',
			file: 'evals/expected.json',
			message:
				'2 cases are stale, and `skill test` runs them: scope root, 1 case (changed: references/style.md); scope write, 1 case (changed: references/style.md)',
		})
	})

	it('names a case with no entry', () => {
		const skill = scopedSkill()
		recordAll(skill, (file) => {
			const { 'audit-one': _gone, ...entries } = file.entries
			return { ...file, entries }
		})
		expect(checkStaleCases(reread(skill))[0]).toMatchObject({
			status: 'fail',
			message: expect.stringContaining('scope audit, 1 case (no entry: audit-one)'),
		})
	})

	it('warns on every case of a skill with no expected result', () => {
		expect(checkStaleCases(scopedSkill())[0]).toMatchObject({
			status: 'fail',
			message: expect.stringMatching(/^6 cases are stale/),
		})
	})

	it('shows a carried entry as carried, with its reason', () => {
		const skill = scopedSkill()
		recordAll(skill, (file) => ({
			...file,
			entries: {
				...file.entries,
				'audit-one': {
					...(file.entries['audit-one'] as ExpectedFile['entries'][string]),
					carried: { reason: 'typo fix', at: '2026-11-20T10:00:00.000Z' },
				},
			},
		}))
		expect(checkStaleCases(reread(skill))).toEqual([
			{ id: 'VER-18', status: 'pass' },
			{
				id: 'VER-19',
				status: 'fail',
				file: 'evals/expected.json',
				message: '1 expected entry was carried forward, not run: audit-one (typo fix, 2026-11-20)',
			},
		])
	})

	it('is not checked when the evals cannot be read', () => {
		const skill = scopedSkill({ 'evals/evals.yaml': 'not: [valid' })
		expect(checkStaleCases(skill).map((outcome) => outcome.status)).toEqual(['not-checked', 'not-checked'])
	})

	it('reads only files', () => {
		const skill = scopedSkill()
		recordAll(skill)
		const before = readFileSync(join(skill.folder, 'evals/expected.json'), 'utf8')
		checkStaleCases(reread(skill))
		expect(readFileSync(join(skill.folder, 'evals/expected.json'), 'utf8')).toBe(before)
	})
})
