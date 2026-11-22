import { describe, expect, it } from 'vitest'
import { armCaps, armCost, costCapOf, expectedRunCost, runCostCap } from './run-cost.js'

describe('run cost cap (#394)', () => {
	it('records the runs, their total, and the dearest one, skipping a run with no cost', () => {
		expect(armCost([0.1, undefined, 0.3])).toEqual({ runs: 2, total: 0.4, max: 0.3 })
		expect(armCost([undefined, 0])).toBeUndefined()
	})

	it('holds a case with no recorded cost to the default', () => {
		expect(costCapOf(undefined, undefined)).toBe(runCostCap)
	})

	it('doubles the dearest recorded run, never below the default', () => {
		expect(costCapOf(undefined, { runs: 3, total: 0.3, max: 0.12 })).toBe(0.5)
		expect(costCapOf(undefined, { runs: 3, total: 1.5, max: 0.6 })).toBe(1.2)
	})

	it("lets a case's own cap win over both, even below the default", () => {
		expect(costCapOf(2, { runs: 3, total: 1.5, max: 0.6 })).toBe(2)
		expect(costCapOf(0.2, undefined)).toBe(0.2)
	})

	it('caps each arm from its own recorded cost', () => {
		expect(armCaps(undefined, { skill: { runs: 1, total: 0.9, max: 0.9 } })).toEqual({ skill: 1.8, baseline: 0.5 })
	})

	it('prices a run at the recorded average', () => {
		expect(expectedRunCost({ runs: 4, total: 1, max: 0.5 })).toBe(0.25)
		expect(expectedRunCost(undefined)).toBeUndefined()
	})
})
