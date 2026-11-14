import { describe, expect, it } from 'vitest'
import { estimateTest, estimateText } from './test-estimate.js'
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
			'skill test: 60 runs, about $12.00 (from the last result); budget $10 or 60 runs: over; last time 30 runs took about 10 min\n',
		)
	})

	it('uses the default per-run cost with no saved result, and runs within the default budget', () => {
		// 5 outcome cases × 2 × 3 + 4 triggers × 3 = 42 runs at $0.18
		const estimate = estimateTest('s', plan(5, 4), undefined, 'claude-code')
		expect(estimate).toMatchObject({ runs: 42, estimate: 7.56, basis: 'per-run-default', within: true })
		expect(estimate).not.toHaveProperty('last')
		expect(estimate.budget).toEqual({ cost: 10, runs: 60 })
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
		expect(estimateText(within)).toBe('skill test: 60 runs, no cost known; budget $10 or 60 runs: within\n')
		expect(estimateTest('s', plan(10, 1), undefined, 'codex').within).toBe(false)
	})

	it('takes a budget a customization sets', () => {
		expect(estimateTest('s', plan(1, 0), undefined, 'claude-code', { cost: 1, runs: 6 }).within).toBe(false)
		expect(estimateTest('s', plan(1, 0), undefined, 'claude-code', { cost: 2, runs: 6 }).within).toBe(true)
	})
})
