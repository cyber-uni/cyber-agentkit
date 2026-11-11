import { describe, expect, it } from 'vitest'
import { goodSkill } from './skill-design.fixtures.js'
import { planTest, type TestPlan } from './test-plan.js'
import { compareWithPrevious, readPromptfooOutput, type TestResult } from './test-result.js'

const plan = (() => {
	const planned = planTest(goodSkill())
	if (!('plan' in planned)) throw new Error(planned.problem)
	return planned.plan
})()

type RowSpec = {
	case: string
	label?: string
	run: number
	fired?: boolean
	checks?: Record<string, boolean>
	error?: string
}

function row({ case: id, label = 'with-skill', run, fired = false, checks = {}, error }: RowSpec) {
	const skipped = id.startsWith('trigger') && label === 'baseline'
	return {
		provider: { label },
		testCase: { description: id },
		repeatIndex: run,
		cost: 0.001,
		response: {
			output: 'out',
			...(error ? { error } : {}),
			metadata: {
				...(skipped ? { skipped: true } : {}),
				fired,
				checks: Object.fromEntries(
					Object.entries(checks).map(([k, pass]) => [k, { pass, detail: pass ? '' : `${k} broke` }]),
				),
			},
		},
		gradingResult: {
			componentResults: Object.entries(checks).map(([metric, pass]) => ({ pass, assertion: { metric } })),
		},
	}
}

function output(rows: RowSpec[]) {
	return { results: { results: rows.map(row) } }
}

const meta = {
	skill: 'release-notes',
	at: '2026-11-10T00:00:00Z',
	verification: 'v',
	baseline: 'without the skill',
	baselineRan: true,
}
const triggerRows = (fires: boolean[]): RowSpec[] =>
	plan.cases
		.filter((item) => item.kind === 'trigger')
		.flatMap((item, index) => [0, 1, 2].map((run) => ({ case: item.id, run, fired: fires[index] as boolean })))

describe('readPromptfooOutput', () => {
	it('reports each trigger case and each criterion against the threshold and the baseline', () => {
		const rows: RowSpec[] = [
			...triggerRows([true, true, true, false, false, false]),
			{ case: 'two-prs', run: 0, checks: { C1: true, C2: true } },
			{ case: 'two-prs', run: 1, checks: { C1: true, C2: false } },
			{ case: 'two-prs', run: 2, checks: { C1: true, C2: false } },
			...[0, 1, 2].map((run) => ({ case: 'two-prs', label: 'baseline', run, checks: { C1: false, C2: true } })),
		]
		const result = readPromptfooOutput(output(rows), plan, meta)
		expect(result.trigger.map((item) => item.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass', 'pass'])
		expect(result.criteria).toEqual([
			{ id: 'C1', status: 'pass', passed: 3, ran: 3, baseline: { passed: 0, ran: 3 } },
			{
				id: 'C2',
				status: 'fail',
				passed: 1,
				ran: 3,
				baseline: { passed: 3, ran: 3 },
				failures: [
					{ case: 'two-prs', run: 2, output: 'C2 broke' },
					{ case: 'two-prs', run: 3, output: 'C2 broke' },
				],
			},
		])
		expect(result.cases.at(-1)).toEqual({ case: 'two-prs', status: 'fail' })
		expect(result.cost).toBe(0.024)
	})

	it('saves the reply as the failure output when the failed check gives no detail', () => {
		const silent = row({ case: 'two-prs', run: 0, checks: { C1: true, C2: false } })
		silent.response.metadata.checks.C2 = { pass: false, detail: '' }
		const result = readPromptfooOutput({ results: { results: [silent] } }, plan, meta)
		expect(result.criteria.find((item) => item.id === 'C2')?.failures).toEqual([
			{ case: 'two-prs', run: 1, output: 'out' },
		])
	})

	it('fails a trigger case that fires on a near miss or misses its request', () => {
		const result = readPromptfooOutput(output(triggerRows([false, true, true, true, false, false])), plan, meta)
		expect(result.trigger.map((item) => item.status)).toEqual(['fail', 'pass', 'pass', 'fail', 'pass', 'pass'])
	})

	it('counts a run that errored as not run, never as a pass (R32)', () => {
		const rows: RowSpec[] = [
			{ case: 'two-prs', run: 0, error: 'max turns reached', checks: { C1: true, C2: true } },
			{ case: 'two-prs', run: 1, error: 'max turns reached' },
			{ case: 'two-prs', run: 2, checks: { C1: true, C2: true } },
		]
		const result = readPromptfooOutput(output(rows), plan, meta)
		expect(result.criteria[0]).toMatchObject({ id: 'C1', status: 'fail', passed: 1, ran: 1 })
		expect(result.notRun).toContainEqual({ case: 'two-prs (with-skill, run 1)', reason: 'max turns reached' })
		expect(result.trigger[0]).toMatchObject({ status: 'not-run', ran: 0 })
	})

	it('leaves the baseline out when it did not run (R35)', () => {
		const result = readPromptfooOutput(output([{ case: 'two-prs', run: 0, checks: { C1: true, C2: true } }]), plan, {
			...meta,
			baselineRan: false,
		})
		expect(result.criteria[0]).not.toHaveProperty('baseline')
	})
})

describe('compareWithPrevious', () => {
	const result = (cases: TestResult['cases']): TestResult => ({
		...readPromptfooOutput(output([]), plan as TestPlan, meta),
		cases,
	})

	it('lists the cases that changed between pass and fail (R26)', () => {
		const now = compareWithPrevious(
			result([
				{ case: 'a', status: 'pass' },
				{ case: 'b', status: 'fail' },
				{ case: 'c', status: 'not-run' },
			]),
			result([
				{ case: 'a', status: 'fail' },
				{ case: 'b', status: 'fail' },
				{ case: 'c', status: 'pass' },
			]),
		)
		expect(now.changed).toEqual([{ case: 'a', from: 'fail', to: 'pass' }])
	})

	it('says which result it compared with', () => {
		const a = result([{ case: 'a', status: 'pass' }])
		expect(compareWithPrevious(a, a)).toMatchObject({ comparedWith: 'previous', changed: [] })
		expect(compareWithPrevious(a, a, 'expected')).toMatchObject({ comparedWith: 'expected' })
	})

	it('says when there is no previous result', () => {
		expect(compareWithPrevious(result([]), undefined)).toMatchObject({ noPrevious: true })
	})
})
