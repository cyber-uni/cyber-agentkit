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

	it('accepts a positive timeout and rejects others (F8)', () => {
		expect(evalsProblems({ timeout: 30.5 })).toEqual([])
		for (const timeout of [0, -1, '60', null])
			expect(evalsProblems({ timeout })).toEqual(['`timeout` is not a positive number of seconds'])
	})

	it('accepts a list of host names as a case network, and rejects others (R107)', () => {
		const one = (network: unknown) => evalsProblems({ outcome: [{ id: 'a', prompt: 'p', network }] })
		expect(one(['registry.npmjs.org', '*.github.com'])).toEqual([])
		for (const network of ['example.com', [1], ['https://example.com'], ['a b']])
			expect(one(network)).toEqual(['outcome case 1: `network` is not a list of host names'])
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

	it('names a malformed per-case checks (F6)', () => {
		expect(
			evalsProblems({
				outcome: [
					{ id: 'a', prompt: 'p', checks: [] },
					{ id: 'b', prompt: 'p', checks: { C1: [], C2: [{ smells: 'x' }] } },
				],
			}),
		).toEqual([
			'outcome case 1: `checks` is not a mapping of criterion IDs',
			'outcome case 2: checks C1 is not a list of checks',
			'outcome case 2: checks C2 has a check that is not one of contains, not-contains, regex, not-regex, file-exists, file-contains, script, judge',
		])
	})

	it('counts a criterion as having a rubric when every case testing it has checks, and rejects unknown IDs in checks (F6)', () => {
		const run = (evals: string) =>
			byId(checkVerification(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': evals })))['VER-3']
		const noC2 = goodEvals.replace(/ {2}C2:\n.*\n/, '')
		expect(run(noC2)).toMatchObject({ status: 'fail', message: 'no rubric for C2' })
		const withChecks = noC2.replace(
			'  - { id: two-prs, prompt: write the notes, files: files/two-prs }',
			'  - id: two-prs\n    prompt: write the notes\n    files: files/two-prs\n    criteria: [C1, C2]\n    checks:\n      C2:\n        - contains: ok',
		)
		expect(withChecks).not.toBe(noC2)
		expect(run(withChecks)).toMatchObject({ status: 'pass' })
		const unknownId = withChecks.replace(
			'        - contains: ok',
			'        - contains: ok\n      C9:\n        - contains: ok',
		)
		expect(run(unknownId)).toMatchObject({ status: 'fail', message: 'checks C9 name no criterion' })
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
