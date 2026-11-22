import { type CaseCost, expectedRunCost } from './run-cost.js'
import type { TestPlan } from './test-plan.js'
import { plannedRuns } from './test-progress.js'
import type { TestResult } from './test-result.js'

/** The test budget `skill-design.autonomy` ships with: a test estimated at or under it runs without asking (#214). */
export const defaultTestBudget = { cost: 10, runs: 60 } as const

/** What a recent full run of a skill cost per run on Claude Code, in US dollars, for a skill with no saved result. */
export const defaultCostPerRun: Partial<Record<string, number>> = { 'claude-code': 0.18 }

export type TestBudget = { cost: number; runs: number }

/** Where the budget came from: `--budget-cost`/`--budget-runs`, the loaded `skill-design.autonomy`, or neither (#238). */
export type BudgetSource = 'flags' | 'reference' | 'default'

/**
 * The budget under a `## test budget` heading, written as `$<cost> or <runs> runs`. Either half alone keeps the
 * shipped default for the other; no heading, or neither half, is no budget.
 */
export function parseTestBudget(content: string | undefined): TestBudget | undefined {
	const section = /^##[ \t]+test budget[ \t]*$([\s\S]*?)(?=^#{1,2}[ \t]|(?![\s\S]))/im.exec(content ?? '')?.[1]
	if (section === undefined) return undefined
	const cost = /\$[ \t]*(\d+(?:\.\d+)?)/.exec(section)?.[1]
	const runs = /(\d+)[ \t]+runs?\b/i.exec(section)?.[1]
	if (cost === undefined && runs === undefined) return undefined
	return {
		cost: cost === undefined ? defaultTestBudget.cost : Number(cost),
		runs: runs === undefined ? defaultTestBudget.runs : Number(runs),
	}
}

export type TestEstimate = {
	skill: string
	/** How many runs the test plans. */
	runs: number
	/** The estimated cost in US dollars, or `null` when no cost is known and the run count stands in for it. */
	estimate: number | null
	/**
	 * `per-case` sums each planned case's recorded cost per arm (#394), pricing a run with no recorded cost at the last
	 * saved result's average, else the default; `last-result` scales the last saved result's cost; `per-run-default`
	 * multiplies the harness's default per-run cost.
	 */
	basis: 'per-case' | 'last-result' | 'per-run-default' | 'none'
	/** With the `per-case` basis: how many planned runs had no recorded cost and took the fallback price. */
	unrecordedRuns?: number
	/** The last saved result, when there is one: how many runs it made, what they cost, and how long they took. */
	last?: { runs?: number; cost?: number; durationMs?: number }
	budget: TestBudget & { from: BudgetSource }
	/** The estimate is at or under the budget's cost, when one is known, and the run count is at or under its runs. */
	within: boolean
	/** The line a skill reports as printed: `Test budget: <within|over> (<runs> runs, <estimate>; budget <cost> or <runs> runs)`. */
	line: string
}

/**
 * Estimates what `skill test` will cost before any run (#214). Each planned case's runs cost what its expected entry
 * recorded per arm (#394). A run with no recorded cost, and a plan whose cases record none, take the price of a saved
 * result that records its cost and run count, that cost over the runs it made; otherwise the harness's default per-run
 * cost. With none of these no cost is known. The test is within the budget only when both the estimate and the run
 * count are.
 */
export function estimateTest(
	skill: string,
	plan: TestPlan,
	last: Pick<TestResult, 'cost' | 'totalRuns' | 'durationMs'> | undefined,
	harness: string,
	budget: TestBudget = defaultTestBudget,
	from: BudgetSource = 'default',
	costs: Record<string, CaseCost> = {},
): TestEstimate {
	const runs = plannedRuns(plan)
	const perRun = defaultCostPerRun[harness]
	const fallback = last?.cost && last.totalRuns ? last.cost / last.totalRuns : perRun
	// Each planned run is one case, one arm; a trigger case runs with the skill only.
	let recordedSum = 0
	let recordedRuns = 0
	for (const item of plan.cases) {
		const recorded = costs[item.id]
		for (const arm of item.kind === 'trigger' ? (['skill'] as const) : (['skill', 'baseline'] as const)) {
			const each = expectedRunCost(recorded?.[arm])
			if (each === undefined) continue
			recordedSum += each * plan.runs
			recordedRuns += plan.runs
		}
	}
	const unrecorded = runs - recordedRuns
	const perCase = recordedRuns > 0 && (unrecorded === 0 || fallback !== undefined)
	const fromLast = last?.cost && last.totalRuns ? (last.cost * runs) / last.totalRuns : undefined
	const estimate = perCase
		? recordedSum + unrecorded * (fallback ?? 0)
		: (fromLast ?? (perRun === undefined ? null : perRun * runs))
	const basis = perCase
		? 'per-case'
		: fromLast !== undefined
			? 'last-result'
			: estimate === null
				? 'none'
				: 'per-run-default'
	const rounded = estimate === null ? null : Math.round(estimate * 100) / 100
	const lastSeen = last
		? {
				...(last.totalRuns ? { runs: last.totalRuns } : {}),
				...(last.cost ? { cost: last.cost } : {}),
				...(last.durationMs ? { durationMs: last.durationMs } : {}),
			}
		: undefined
	const within = runs <= budget.runs && (rounded === null || rounded <= budget.cost)
	const cost = rounded === null ? 'no cost known' : `$${rounded.toFixed(2)}`
	const unset = from === 'default' ? '; no budget configured, default used' : ''
	return {
		skill,
		runs,
		estimate: rounded,
		basis,
		...(basis === 'per-case' && unrecorded ? { unrecordedRuns: unrecorded } : {}),
		...(lastSeen && Object.keys(lastSeen).length ? { last: lastSeen } : {}),
		budget: { ...budget, from },
		within,
		line: `Test budget: ${within ? 'within' : 'over'} (${runs} runs, ${cost}; budget $${budget.cost} or ${budget.runs} runs${unset})`,
	}
}

/** One line for the text format: the runs, the estimate and its basis, the budget, and how long the last run took. */
export function estimateText(estimate: TestEstimate): string {
	const cost =
		estimate.estimate === null
			? 'no cost known'
			: `about $${estimate.estimate.toFixed(2)} (${
					estimate.basis === 'per-case'
						? `from each case's recorded cost${estimate.unrecordedRuns ? `, ${estimate.unrecordedRuns} runs at the average price` : ''}`
						: estimate.basis === 'last-result'
							? 'from the last result'
							: 'at the default per-run cost'
				})`
	let line = `skill test: ${estimate.runs} runs, ${cost}; budget $${estimate.budget.cost} or ${estimate.budget.runs} runs: ${estimate.within ? 'within' : 'over'}`
	const took = estimate.last?.durationMs
	if (took)
		line += `; last time ${estimate.last?.runs ?? 'an unknown number of'} runs took about ${Math.max(1, Math.round(took / 60_000))} min`
	return `${line}\n${estimate.line}\n`
}
