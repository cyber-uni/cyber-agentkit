import { describe, expect, it } from 'vitest'
import { goodEvals, goodSkill, goodSkillMd, makeSkill } from './skill-design.fixtures.js'
import { planScripts, planTest, withoutScripts } from './test-plan.js'

describe('planTest', () => {
	it('plans each trigger and outcome case, with the default runs and threshold', () => {
		const planned = planTest(goodSkill())
		if (!('plan' in planned)) throw new Error(planned.problem)
		expect(planned.plan).toMatchObject({ runs: 3, threshold: 2, criteria: ['C1', 'C2'], notTested: [], notRun: [] })
		expect(planned.plan.cases.map((item) => `${item.kind} ${item.id}`)).toEqual([
			...[1, 2, 3, 4, 5, 6].map((n) => `trigger trigger-${n}`),
			'outcome two-prs',
		])
		expect(planned.plan.cases.at(-1)?.files).toMatch(/evals\/files\/two-prs$/)
	})

	it('lets a case reach only the hosts it lists (R107)', () => {
		const evals = goodEvals.replace(
			'  - { id: two-prs, prompt: write the notes, files: files/two-prs }',
			'  - { id: two-prs, prompt: write the notes, files: files/two-prs, network: [registry.npmjs.org] }',
		)
		const planned = planTest(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': evals }))
		if (!('plan' in planned)) throw new Error(planned.problem)
		expect(planned.plan.cases.at(-1)?.network).toEqual(['registry.npmjs.org'])
		const none = planTest(goodSkill())
		if (!('plan' in none)) throw new Error(none.problem)
		expect(none.plan.cases.at(-1)?.network).toBeUndefined()
	})

	it('carries a case marked as a guard into the plan (R160)', () => {
		const evals = goodEvals.replace(
			'  - { id: two-prs, prompt: write the notes, files: files/two-prs }',
			'  - { id: two-prs, prompt: write the notes, files: files/two-prs, guard: true }',
		)
		const planned = planTest(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': evals }))
		if (!('plan' in planned)) throw new Error(planned.problem)
		expect(planned.plan.cases.at(-1)?.guard).toBe(true)
		const none = planTest(goodSkill())
		if (!('plan' in none)) throw new Error(none.problem)
		expect(none.plan.cases.at(-1)?.guard).toBeUndefined()
	})

	it('plans a five-minute time limit, or the evals timeout (F8)', () => {
		const planned = (evals: string) => {
			const result = planTest(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': evals }))
			if (!('plan' in result)) throw new Error(result.problem)
			return result.plan
		}
		expect(planned(goodEvals).timeout).toBe(300)
		expect(planned(`timeout: 90\n${goodEvals}`).timeout).toBe(90)
	})

	it("uses a case's checks in place of the rubric for that criterion (F6)", () => {
		const evals = goodEvals.replace(
			'  - { id: two-prs, prompt: write the notes, files: files/two-prs }',
			'  - id: two-prs\n    prompt: write the notes\n    files: files/two-prs\n    criteria: [C1, C2]\n    checks:\n      C2:\n        - contains: only-here',
		)
		const planned = planTest(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': evals }))
		if (!('plan' in planned)) throw new Error(planned.problem)
		expect(planned.plan.cases.at(-1)?.rubrics['C2']).toEqual([{ contains: 'only-here' }])
		expect(planned.plan.cases.at(-1)?.rubrics['C1']).toEqual([{ contains: '## Release notes' }])
	})

	it('refuses a skill with no cases, naming why, so the cases are drafted first (R31)', () => {
		expect(planTest(makeSkill({ 'SKILL.md': goodSkillMd }))).toMatchObject({ code: 'no-cases' })
		expect(planTest(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': 'runs: 3\n' }))).toMatchObject({
			code: 'no-cases',
		})
		expect(
			planTest(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': 'runs: 0\ntrigger: []\n' })),
		).toMatchObject({
			code: 'evals-invalid',
		})
	})

	it('reports criteria with no rubric, a judge rubric with no judge, and no Done when as not tested (R30, R33, R78)', () => {
		const evals = goodEvals.replace(
			'  C2:\n    - not-regex: "Merge (pull request|branch)"\n',
			'  C2:\n    - judge: Pass when tidy.\n',
		)
		const md = goodSkillMd.replace('- **C2.** No merge commit appears.', '- **C2.** Tidy.\n- **C3.** Short.')
		const planned = planTest(makeSkill({ 'SKILL.md': md, 'evals/evals.yaml': evals }))
		if (!('plan' in planned)) throw new Error(planned.problem)
		expect(planned.plan.notTested).toEqual([
			{ id: 'C2', reason: 'its rubric needs a judge, and none was named' },
			{ id: 'C3', reason: 'it has no rubric; run `/skill fix`' },
		])
		const judged = planTest(makeSkill({ 'SKILL.md': md, 'evals/evals.yaml': evals }), { judge: 'some-model' })
		if (!('plan' in judged)) throw new Error(judged.problem)
		expect(judged.plan.cases.at(-1)?.judged).toEqual({ C2: 'Pass when tidy.' })
		const noDone = planTest(
			makeSkill({ 'SKILL.md': goodSkillMd.replace(/## Done when[\s\S]*/, ''), 'evals/evals.yaml': goodEvals }),
		)
		if (!('plan' in noDone)) throw new Error(noDone.problem)
		expect(noDone.plan.notTested[0]?.id).toBe('*')
		expect(noDone.plan.cases.filter((item) => item.kind === 'trigger')).toHaveLength(6)
	})

	it('does not run a case with an outside effect (R34)', () => {
		const evals = goodEvals.replace('files: files/two-prs }', 'files: files/two-prs, effects: outside }')
		const planned = planTest(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': evals }))
		if (!('plan' in planned)) throw new Error(planned.problem)
		expect(planned.plan.notRun).toEqual([
			{ case: 'two-prs', reason: 'it has an outside effect the run cannot contain', kind: 'skipped' },
		])
		expect(planned.plan.cases.some((item) => item.id === 'two-prs')).toBe(false)
	})
})

describe('planTest --case and concurrency (R176, R103)', () => {
	const planned = (options: Parameters<typeof planTest>[1], evals = goodEvals) => {
		const result = planTest(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': evals }), options)
		if (!('plan' in result)) throw new Error(result.problem)
		return result
	}

	it('keeps only the named cases, and marks the plan', () => {
		const { plan } = planned({ cases: ['trigger-3', 'two-prs'] })
		expect(plan.cases.map((item) => item.id)).toEqual(['trigger-3', 'two-prs'])
		expect(plan.only).toEqual(['trigger-3', 'two-prs'])
		expect(planned({}).plan.only).toBeUndefined()
	})

	it('answers unknown-case for an ID the eval set does not hold', () => {
		const result = planTest(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': goodEvals }), {
			cases: ['two-prs', 'trigger-7'],
		})
		expect(result).toMatchObject({ code: 'unknown-case' })
	})

	it('bounds concurrency below half the threads, at least 1', () => {
		const at = (threads: number, evals?: string) => planned({ threads }, evals).plan.concurrency
		expect([1, 2, 3, 4, 5, 8, 16].map((n) => at(n))).toEqual([1, 1, 1, 1, 2, 3, 7])
		expect(at(16, `concurrency: 3\n${goodEvals}`)).toBe(3)
		expect(at(16, `concurrency: 9\n${goodEvals}`)).toBe(7)
		expect(planned({ threads: 16 }, `concurrency: 9\n${goodEvals}`).warnings).toHaveLength(1)
		expect(planned({ threads: 16 }, `concurrency: 3\n${goodEvals}`).warnings).toEqual([])
	})

	it('rejects a concurrency that is not a positive whole number', () => {
		for (const bad of ['0', '1.5', 'many'])
			expect(
				planTest(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': `concurrency: ${bad}\n${goodEvals}` })),
			).toMatchObject({ code: 'evals-invalid' })
	})
})

describe('setup scripts in the plan (R155, R158)', () => {
	const skill = () =>
		goodSkill({
			'evals/evals.yaml':
				'outcome:\n  - { id: two-prs, prompt: write the notes, setup: setup/two-prs.sh }\n  - { id: plain, prompt: write them again }\nrubrics:\n  C1:\n    - contains: x\n  C2:\n    - script: test -f NOTES.md\n',
		})

	it("resolves a case's setup script against evals/, and lists every script the plan runs", () => {
		const planned = planTest(skill(), { threads: 8 })
		if ('problem' in planned) throw new Error(planned.problem)
		expect(planned.plan.cases.find((item) => item.id === 'two-prs')?.setup).toMatch(/evals[\\/]setup[\\/]two-prs\.sh$/)
		expect(
			planScripts(planned.plan).map(({ case: id, kind, script }) => [id, kind, kind === 'check' ? script : '']),
		).toEqual([
			['two-prs', 'setup', ''],
			['two-prs', 'check', 'test -f NOTES.md'],
			['plain', 'check', 'test -f NOTES.md'],
		])
	})

	it('moves each case that runs a script to the cases not run, with the reason', () => {
		const planned = planTest(skill(), { threads: 8 })
		if ('problem' in planned) throw new Error(planned.problem)
		const kept = withoutScripts(planned.plan, 'untrusted')
		expect(kept.cases.filter((item) => item.kind === 'outcome')).toEqual([])
		expect(kept.notRun).toEqual([
			{ case: 'two-prs', reason: 'untrusted', kind: 'skipped' },
			{ case: 'plain', reason: 'untrusted', kind: 'skipped' },
		])
	})

	it('refuses a setup that is not a path', () => {
		const planned = planTest(
			goodSkill({ 'evals/evals.yaml': 'outcome:\n  - { id: two-prs, prompt: write the notes, setup: 3 }\n' }),
		)
		expect(planned).toMatchObject({ code: 'evals-invalid', problem: expect.stringContaining('`setup` is not a path') })
	})
})

describe('trigger case IDs in the plan (R175)', () => {
	const named = `trigger:
  - { id: notes, prompt: write release notes, expect: fire }
  - { prompt: review my diff, expect: skip }
  - { id: commit, prompt: write a commit message, expect: skip }
outcome:
  - { id: two-prs, prompt: write the notes, files: files/two-prs }
rubrics:
  C1:
    - contains: "## Release notes"
  C2:
    - not-regex: "Merge (pull request|branch)"
`
	const ids = (evals: string, options: Parameters<typeof planTest>[1] = {}) => {
		const result = planTest(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': evals }), options)
		if (!('plan' in result)) throw new Error(result.problem)
		return result.plan.cases.map((item) => item.id)
	}

	it('names a trigger case by its own `id`, and one with none by its place', () => {
		expect(ids(named)).toEqual(['notes', 'trigger-2', 'commit', 'two-prs'])
	})

	it('keeps every named case its ID when a case is inserted before it', () => {
		const inserted = named.replace(
			'  - { id: notes,',
			'  - { id: changelog, prompt: draft the changelog, expect: fire }\n  - { id: notes,',
		)
		expect(ids(inserted)).toEqual(['changelog', 'notes', 'trigger-3', 'commit', 'two-prs'])
	})

	it('runs a trigger case named by its own `id`, and refuses the place it holds', () => {
		expect(ids(named, { cases: ['commit'] })).toEqual(['commit'])
		const result = planTest(makeSkill({ 'SKILL.md': goodSkillMd, 'evals/evals.yaml': named }), {
			cases: ['trigger-3'],
		})
		expect(result).toMatchObject({ code: 'unknown-case' })
	})
})
