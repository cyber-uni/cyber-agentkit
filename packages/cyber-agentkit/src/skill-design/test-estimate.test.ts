import { describe, expect, it } from 'vitest'
import { estimateTest, estimateText, parseTestBudget } from './test-estimate.js'
import type { TestPlan } from './test-plan.js'

/** A plan of `outcomes` outcome cases and `triggers` trigger cases, 3 runs each. */
function plan(outcomes: number, triggers: number): TestPlan {
	const cases = [
		...Array.from({ length: outcomes }, (_, i) => ({ kind: 'outcome', id: `o${i}` })),
		...Array.from({ length: triggers }, (_, i) => ({ kind: 'trigger', id: `t${i}` })),
	]
	return { runs: 3, cases, concurrency: 1 } as unknown as TestPlan
}

describe('estimateTest (#214)', () => {
	it('scales the last saved result: its cost times the planned runs over the runs it made', () => {
		// 10 outcome cases × 2 arms × 3 = 60 runs, last time 30 runs cost $6
		const estimate = estimateTest('s', plan(10, 0), { cost: 6, totalRuns: 30, durationMs: 600_000 }, 'claude-code')
		expect(estimate).toMatchObject({ runs: 60, estimate: 12, basis: 'last-result', within: false })
		expect(estimate.last).toEqual({ runs: 30, cost: 6, durationMs: 600_000 })
		expect(estimateText(estimate)).toBe(
			'skill test: 60 runs, about $12.00 (from the last result); budget $5 or 60 runs: over; last time 30 runs took about 10 min\n' +
				'Test budget: over (60 runs, $12.00; budget $5 or 60 runs; no budget configured, default used)\n',
		)
	})

	it('uses the default per-run cost with no saved result, and runs within the default budget', () => {
		// 3 outcome cases × 2 × 3 + 2 triggers × 3 = 24 runs at $0.18
		const estimate = estimateTest('s', plan(3, 2), undefined, 'claude-code')
		expect(estimate).toMatchObject({ runs: 24, estimate: 4.32, basis: 'per-run-default', within: true })
		expect(estimate).not.toHaveProperty('last')
		expect(estimate.budget).toEqual({ cost: 5, runs: 60, from: 'default' })
	})

	it('uses the default per-run cost when the saved result lacks its cost or run count', () => {
		expect(estimateTest('s', plan(1, 0), { durationMs: 1000 }, 'claude-code')).toMatchObject({
			basis: 'per-run-default',
			estimate: 1.08,
		})
		expect(estimateTest('s', plan(1, 0), { cost: 3 }, 'claude-code').basis).toBe('per-run-default')
	})

	it('holds the run count to the budget when no cost is known', () => {
		const within = estimateTest('s', plan(10, 0), undefined, 'codex')
		expect(within).toMatchObject({ runs: 60, estimate: null, basis: 'none', within: true })
		expect(estimateText(within)).toBe(
			'skill test: 60 runs, no cost known; budget $5 or 60 runs: within\n' +
				'Test budget: within (60 runs, no cost known; budget $5 or 60 runs; no budget configured, default used)\n',
		)
		expect(estimateTest('s', plan(10, 1), undefined, 'codex').within).toBe(false)
	})

	it('takes a budget a customization sets', () => {
		expect(estimateTest('s', plan(1, 0), undefined, 'claude-code', { cost: 1, runs: 6 }).within).toBe(false)
		expect(estimateTest('s', plan(1, 0), undefined, 'claude-code', { cost: 2, runs: 6 }).within).toBe(true)
	})

	it('writes the Test budget line a skill reports as printed, saying only when no budget was configured (#238)', () => {
		const over = estimateTest('s', plan(5, 4), undefined, 'claude-code', { cost: 0.01, runs: 1 }, 'reference')
		expect(over.line).toBe('Test budget: over (42 runs, $7.56; budget $0.01 or 1 runs)')
		expect(over.budget).toEqual({ cost: 0.01, runs: 1, from: 'reference' })
		expect(estimateTest('s', plan(3, 2), undefined, 'claude-code').line).toBe(
			'Test budget: within (24 runs, $4.32; budget $5 or 60 runs; no budget configured, default used)',
		)
	})
})

describe('estimateTest per case (#394)', () => {
	const costs = {
		o0: { skill: { runs: 3, total: 0.9, max: 0.4 }, baseline: { runs: 3, total: 0.3, max: 0.2 } },
		t0: { skill: { runs: 3, total: 0.06, max: 0.03 } },
	}

	it("sums each case's recorded cost per arm", () => {
		// o0: 3 × 0.30 + 3 × 0.10; t0: 3 × 0.02
		const estimate = estimateTest('s', plan(1, 1), undefined, 'claude-code', undefined, undefined, costs)
		expect(estimate).toMatchObject({ runs: 9, estimate: 1.26, basis: 'per-case' })
		expect(estimate).not.toHaveProperty('unrecordedRuns')
		expect(estimateText(estimate)).toContain("about $1.26 (from each case's recorded cost)")
	})

	it("prices a run with no recorded cost at the last result's average", () => {
		// o1 has no cost: 6 runs at 6 / 30 = 0.2
		const estimate = estimateTest(
			's',
			plan(2, 0),
			{ cost: 6, totalRuns: 30 },
			'claude-code',
			undefined,
			undefined,
			costs,
		)
		expect(estimate).toMatchObject({ runs: 12, estimate: 2.4, basis: 'per-case', unrecordedRuns: 6 })
		expect(estimateText(estimate)).toContain('6 runs at the average price')
	})

	it('falls back to the last result when no planned case records a cost', () => {
		expect(
			estimateTest('s', plan(1, 0), { cost: 6, totalRuns: 30 }, 'claude-code', undefined, undefined, {}),
		).toMatchObject({
			basis: 'last-result',
			estimate: 1.2,
		})
	})
})

describe('estimateTest within both halves of the budget (#394)', () => {
	it('is over when the runs exceed the budget, however cheap they are', () => {
		// 15 outcome cases × 2 × 3 = 90 runs, under a cost budget that is large enough.
		const estimate = estimateTest('s', plan(15, 0), undefined, 'claude-code', { cost: 100, runs: 60 })
		expect(estimate).toMatchObject({ runs: 90, within: false })
		expect(estimate.line).toContain('Test budget: over')
		expect(estimateTest('s', plan(39, 0), undefined, 'claude-code', { cost: 1000, runs: 60 }).within).toBe(false)
	})

	it('is over when the cost exceeds the budget with few runs', () => {
		expect(estimateTest('s', plan(1, 0), undefined, 'claude-code', { cost: 0.5, runs: 60 }).within).toBe(false)
	})

	it('is within only when both halves fit', () => {
		expect(estimateTest('s', plan(10, 0), undefined, 'claude-code', { cost: 100, runs: 60 }).within).toBe(true)
	})
})

describe('parseTestBudget (#238)', () => {
	it('reads the cost and run count under the test budget heading', () => {
		expect(parseTestBudget('## create\n\napply\n\n## test budget\n\n$0.01 or 1 runs\n')).toEqual({
			cost: 0.01,
			runs: 1,
		})
		expect(parseTestBudget('## Test budget\n\n$1000 or 1000 runs')).toEqual({ cost: 1000, runs: 1000 })
	})

	it('keeps the shipped default for a half it does not set', () => {
		expect(parseTestBudget('## test budget\n\n$2\n')).toEqual({ cost: 2, runs: 60 })
		expect(parseTestBudget('## test budget\n\n5 runs\n')).toEqual({ cost: 5, runs: 5 })
	})

	it('is no budget without the heading, or with nothing under it, and reads no other section', () => {
		expect(parseTestBudget(undefined)).toBeUndefined()
		expect(parseTestBudget('## create\n\napply\n')).toBeUndefined()
		expect(parseTestBudget('## test budget\n\nnone\n\n## other\n\n$5 or 3 runs\n')).toBeUndefined()
	})
})
