import { describe, expect, it } from 'vitest'
import { evalReport, reportMarkdown } from './eval-report.js'
import {
	carryEntries,
	type EvalSet,
	type ExpectedFile,
	expectedView,
	finishedCases,
	fromLegacy,
	mergeEntries,
} from './expected-result.js'
import type { CaseStatus, TestResult } from './test-result.js'

const evalSet: EvalSet = {
	cases: [
		{ id: 'fire-1', kind: 'trigger', scope: 'trigger', criteria: [] },
		{ id: 'one-pr', kind: 'outcome', scope: 'root', criteria: ['C1', 'C2'] },
		{ id: 'two-prs', kind: 'outcome', scope: 'root', criteria: ['C1'] },
	],
}
const inputs = {
	scopes: { trigger: 'sha256:t', root: 'sha256:r' },
	cases: { 'fire-1': 'sha256:f', 'one-pr': 'sha256:o', 'two-prs': 'sha256:p' },
}
const outcome = (id: string, status: CaseStatus['status'], c1: number, c2?: number): CaseStatus => ({
	case: id,
	status,
	passed: Math.min(c1, c2 ?? c1),
	ran: 3,
	criteria: {
		C1: { status: c1 >= 2 ? 'pass' : 'fail', passed: c1, ran: 3, baseline: { passed: 0, ran: 3 } },
		...(c2 === undefined
			? {}
			: { C2: { status: c2 >= 2 ? 'pass' : 'fail', passed: c2, ran: 3, baseline: { passed: 1, ran: 3 } } }),
	},
})
/** A run of the given cases, at `at`. */
const run = (at: string, cases: CaseStatus[], extra: Partial<TestResult> = {}): TestResult => ({
	version: 1,
	skill: 'release-notes',
	at,
	verification: 'v',
	model: 'mid-model',
	runs: 3,
	threshold: 2,
	baseline: 'without the skill',
	trigger: cases.some((c) => c.case === 'fire-1')
		? [{ case: 'fire-1', prompt: 'write release notes', expect: 'fire', fired: 3, ran: 3, status: 'pass' }]
		: [],
	criteria: [
		{ id: 'C1', status: 'pass' },
		{ id: 'C2', status: 'pass' },
	],
	cases,
	notRun: [],
	inputs,
	...extra,
})

describe('the per-case expected result (R181)', () => {
	it('keeps one entry per case: its result per criterion, the model, when, and the hashes it was recorded against', () => {
		const { file, written } = mergeEntries(
			undefined,
			run('2026-11-20T00:00:00.000Z', [
				{ case: 'fire-1', status: 'pass', passed: 3, ran: 3 },
				outcome('one-pr', 'pass', 3, 3),
			]),
			['fire-1', 'one-pr'],
			evalSet,
		)
		expect(written).toEqual(['fire-1', 'one-pr'])
		expect(file.entries['one-pr']).toEqual({
			scope: 'root',
			status: 'pass',
			passed: 3,
			ran: 3,
			criteria: {
				C1: { status: 'pass', passed: 3, ran: 3, baseline: { passed: 0, ran: 3 } },
				C2: { status: 'pass', passed: 3, ran: 3, baseline: { passed: 1, ran: 3 } },
			},
			model: 'mid-model',
			at: '2026-11-20T00:00:00.000Z',
			hashes: { case: 'sha256:o', scope: 'sha256:r' },
		})
		expect(file.entries['fire-1']).toMatchObject({
			scope: 'trigger',
			prompt: 'write release notes',
			hashes: { case: 'sha256:f', scope: 'sha256:t' },
		})
	})

	it('writes only the cases named and leaves every other entry as it was, and drops a case no longer in the evals', () => {
		const first = mergeEntries(
			undefined,
			run('2026-11-20T00:00:00.000Z', [outcome('one-pr', 'pass', 3, 3), outcome('two-prs', 'pass', 3)]),
			['one-pr', 'two-prs'],
			evalSet,
		).file
		const second = mergeEntries(
			first,
			run('2026-11-21T00:00:00.000Z', [outcome('two-prs', 'fail', 0)], { partial: { cases: ['two-prs'] } }),
			['two-prs'],
			evalSet,
		)
		expect(second.replaced).toBe(true)
		expect(second.file.entries['one-pr']).toEqual(first.entries['one-pr'])
		expect(second.file.entries['two-prs']).toMatchObject({ status: 'fail', at: '2026-11-21T00:00:00.000Z' })
		const gone = mergeEntries(second.file, run('2026-11-22T00:00:00.000Z', []), [], {
			cases: evalSet.cases.filter((c) => c.id !== 'one-pr'),
		})
		expect(gone.dropped).toEqual(['one-pr'])
		expect(Object.keys(gone.file.entries)).toEqual(['two-prs'])
	})

	it('keeps the cost and run count of the last whole run when a partial one writes', () => {
		const whole = mergeEntries(
			undefined,
			run('2026-11-20T00:00:00.000Z', [outcome('one-pr', 'pass', 3, 3)], { cost: 1.5, totalRuns: 18 }),
			['one-pr'],
			evalSet,
		).file
		const partial = mergeEntries(
			whole,
			run('2026-11-21T00:00:00.000Z', [outcome('two-prs', 'pass', 3)], {
				cost: 0.2,
				totalRuns: 6,
				partial: { cases: ['two-prs'] },
			}),
			['two-prs'],
			evalSet,
		).file
		expect(partial).toMatchObject({ cost: 1.5, totalRuns: 18, at: '2026-11-21T00:00:00.000Z' })
	})

	it('finishes no case with a run at the usage limit, nor one not run or not tested (R162)', () => {
		const result = run('2026-11-20T00:00:00.000Z', [
			outcome('one-pr', 'pass', 3, 3),
			outcome('two-prs', 'pass', 2),
			{ case: 'fire-1', status: 'not-run' },
		])
		result.incomplete = { reason: 'limit reached', text: 'x', left: [{ case: 'two-prs', arm: 'baseline', run: 3 }] }
		expect(finishedCases(result)).toEqual(['one-pr'])
	})
})

describe('a criterion computed from the entries (R182)', () => {
	const file = (): ExpectedFile => {
		const first = mergeEntries(
			undefined,
			run('2026-11-20T00:00:00.000Z', [outcome('one-pr', 'pass', 3, 3)]),
			['one-pr'],
			evalSet,
		).file
		return mergeEntries(first, run('2026-11-21T00:00:00.000Z', [outcome('two-prs', 'fail', 1)]), ['two-prs'], evalSet)
			.file
	}

	it('sums the runs of the cases that test it, fails when one fails, and gives the oldest date when they differ', () => {
		const view = expectedView(file()) as TestResult
		expect(view.criteria).toEqual([
			{
				id: 'C1',
				status: 'fail',
				passed: 4,
				ran: 6,
				baseline: { passed: 0, ran: 6 },
				recorded: '2026-11-20T00:00:00.000Z',
			},
			{ id: 'C2', status: 'pass', passed: 3, ran: 3, baseline: { passed: 1, ran: 3 } },
		])
		expect(view.at).toBe('2026-11-21T00:00:00.000Z')
		expect(view.cases.map((c) => [c.case, c.at])).toEqual([
			['one-pr', '2026-11-20T00:00:00.000Z'],
			['two-prs', '2026-11-21T00:00:00.000Z'],
		])
	})

	it('reports a criterion no entry tests as not tested, with the reason the last whole run gave', () => {
		const only = mergeEntries(
			undefined,
			run('2026-11-20T00:00:00.000Z', [outcome('two-prs', 'pass', 3)], {
				criteria: [
					{ id: 'C1', status: 'pass' },
					{ id: 'C2', status: 'not-tested', reason: 'it has no rubric' },
				],
			}),
			['two-prs'],
			evalSet,
		).file
		expect((expectedView(only) as TestResult).criteria[1]).toEqual({
			id: 'C2',
			status: 'not-tested',
			reason: 'it has no rubric',
		})
	})

	it('dates the report from its oldest entry to its newest', () => {
		const out = reportMarkdown(evalReport('release-notes', expectedView(file())))
		expect(out).toContain('Tested 2026-11-20 to 2026-11-21:')
		expect(out).toContain('oldest entry 2026-11-20T00:00:00.000Z')
	})
})

describe('carrying entries forward (R183)', () => {
	const file = () =>
		mergeEntries(
			undefined,
			run('2026-11-20T00:00:00.000Z', [outcome('one-pr', 'pass', 3, 3), outcome('two-prs', 'pass', 3)]),
			['one-pr', 'two-prs'],
			evalSet,
		).file
	const now = { ...inputs, scopes: { ...inputs.scopes, root: 'sha256:r2' } }
	const carried = { reason: 'fixed a typo', at: '2026-11-22T00:00:00.000Z' }

	it('takes the current hashes, keeps the result and the date, and marks it carried with the reason', () => {
		const out = carryEntries(file(), ['two-prs'], now, carried)
		expect(out.carried).toEqual(['two-prs'])
		expect(out.file.entries['two-prs']).toMatchObject({
			status: 'pass',
			at: '2026-11-20T00:00:00.000Z',
			hashes: { case: 'sha256:p', scope: 'sha256:r2' },
			carried,
		})
		expect(out.file.entries['one-pr']).toEqual(file().entries['one-pr'])
	})

	it('names a case with no entry instead of carrying it', () => {
		expect(carryEntries(file(), ['fire-1'], now, carried).missing).toEqual(['fire-1'])
	})

	it('shows a carried entry as carried in the report, never as a pass from a run', () => {
		const view = expectedView(carryEntries(file(), ['two-prs'], now, carried).file)
		expect(view?.criteria.find((c) => c.id === 'C1')).toMatchObject({ carried: true })
		const report = evalReport('release-notes', view)
		expect(report.cases?.find((c) => c.case === 'two-prs')?.result).toBe('pass; carried, not run (fixed a typo)')
		expect(report.cases?.find((c) => c.case === 'one-pr')?.result).toBe('pass')
		expect(report.criteria?.find((c) => c.id === 'C1')?.result).toContain('carried, not run')
	})
})

describe('a version 1 expected result (R185)', () => {
	const old: TestResult = {
		...run('2026-11-01T00:00:00.000Z', [
			{ case: 'fire-1', status: 'pass', passed: 3, ran: 3 },
			{ case: 'one-pr', status: 'fail', passed: 1, ran: 3 },
			{ case: 'two-prs', status: 'pass', passed: 3, ran: 3 },
		]),
		criteria: [
			{
				id: 'C1',
				status: 'fail',
				passed: 4,
				ran: 6,
				failures: [{ case: 'one-pr', run: 1, output: 'x' }],
			},
			{ id: 'C2', status: 'pass', passed: 3, ran: 3, baseline: { passed: 0, ran: 3 } },
		],
	}
	delete old.inputs

	it('is read as it is', () => {
		expect(expectedView(old)).toBe(old)
	})

	it('becomes entries with no hashes, keeping the counts of a criterion only one case tests', () => {
		const file = fromLegacy(old, evalSet)
		expect(Object.keys(file.entries)).toEqual(['fire-1', 'one-pr', 'two-prs'])
		expect(file.entries['one-pr']).toMatchObject({
			status: 'fail',
			at: old.at,
			criteria: { C1: { status: 'fail' }, C2: { status: 'pass', passed: 3, ran: 3 } },
		})
		expect(file.entries['one-pr']?.criteria?.['C1']).not.toHaveProperty('passed')
		expect(file.entries['two-prs']).toMatchObject({ criteria: { C1: { status: 'pass' } } })
		expect(file.entries['two-prs']).not.toHaveProperty('hashes')
	})
})
