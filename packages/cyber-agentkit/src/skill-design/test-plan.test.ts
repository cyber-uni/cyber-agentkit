import { describe, expect, it } from 'vitest'
import { goodEvals, goodSkill, goodSkillMd, makeSkill } from './skill-design.fixtures.js'
import { planTest } from './test-plan.js'

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
			{ case: 'two-prs', reason: 'it has an outside effect the run cannot contain' },
		])
		expect(planned.plan.cases.some((item) => item.id === 'two-prs')).toBe(false)
	})
})
