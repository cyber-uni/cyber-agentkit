import { describe, expect, it } from 'vitest'
import { byId, goodEvals, goodSkill, goodSkillMd, makeSkill } from './skill-design.fixtures.js'
import { checkVerification, evalsProblems } from './verification-checks.js'

describe('checkVerification', () => {
	it('passes a complete evals file', () => {
		expect(checkVerification(goodSkill()).map((outcome) => outcome.status)).toEqual([
			'pass',
			'pass',
			'pass',
			'pass',
			'pass',
		])
	})

	it('fails VER-1 and leaves the rest not checked when the file is missing or not YAML', () => {
		const missing = checkVerification(makeSkill({ 'SKILL.md': goodSkillMd }))
		expect(missing[0]).toMatchObject({ id: 'VER-1', status: 'fail' })
		expect(missing.slice(1).every((outcome) => outcome.status === 'not-checked')).toBe(true)
		const bad = checkVerification(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': 'trigger: [' }))
		expect(bad[0]).toMatchObject({ id: 'VER-1', status: 'fail', message: expect.stringContaining('not valid YAML') })
	})

	it('names each format problem', () => {
		expect(
			evalsProblems({
				runs: 0,
				trigger: [{ prompt: 'x', expect: 'maybe' }],
				outcome: [{ id: 'a', prompt: 'p', effects: 'inside', criteria: [1] }],
				rubrics: { C1: [{ smells: 'good' }], C2: [] },
			}),
		).toEqual([
			'`runs` is not a positive whole number',
			'trigger case 1 needs a `prompt` and `expect: fire` or `skip`',
			'outcome case 1: `criteria` is not a list of IDs',
			'outcome case 1: `effects` is not `outside`',
			'rubric C1 has a check that is not one of contains, not-contains, regex, not-regex, file-exists, file-contains, script, judge',
			'rubric C2 is not a list of checks',
		])
	})

	it('fails too few trigger cases, uncovered or unknown rubrics, missing files, and a threshold over runs', () => {
		const evals = goodEvals
			.replace(/ {2}- \{ prompt: review my diff, expect: skip \}\n/, '')
			.replace('  C2:\n', '  C9:\n')
			.replace('files/two-prs', 'files/none')
			.replace('trigger:', 'runs: 2\nthreshold: 3\ntrigger:')
		const outcomes = byId(checkVerification(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': evals })))
		expect(outcomes['VER-2']).toMatchObject({ status: 'fail', message: '3 `fire` and 2 `skip` trigger cases' })
		expect(outcomes['VER-3']).toMatchObject({
			status: 'fail',
			message: 'no rubric for C2; rubric C9 names no criterion',
		})
		expect(outcomes['VER-4']).toMatchObject({ status: 'fail', message: expect.stringContaining('evals/files/none') })
		expect(outcomes['VER-5']).toMatchObject({ status: 'fail' })
	})
})
