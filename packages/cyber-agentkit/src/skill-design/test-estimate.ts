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
	/** `last-result` scales the last saved result's cost; `per-run-default` multiplies the harness's default per-run cost. */
	basis: 'last-result' | 'per-run-default' | 'none'
	/** The last saved result, when there is one: how many runs it made, what they cost, and how long they took. */
	last?: { runs?: number; cost?: number; durationMs?: number }
	budget: TestBudget & { from: BudgetSource }
	/** The estimate is at or under the budget's cost, or, with no cost known, the run count at or under its runs. */
	within: boolean
	/** The line a skill reports as printed: `Test budget: <within|over> (<runs> runs, <estimate>; budget <cost> or <runs> runs)`. */
	line: string
}

/**
 * Estimates what `skill test` will cost before any run (#214). With a saved result that records its cost and run
 * count, the estimate is that cost times the planned runs over the runs it made; otherwise it is the planned runs
 * times the harness's default per-run cost. With neither, no cost is known and the run count is held to the budget.
 */
export function estimateTest(
	skill: string,
	plan: TestPlan,
	last: Pick<TestResult, 'cost' | 'totalRuns' | 'durationMs'> | undefined,
	harness: string,
	budget: TestBudget = defaultTestBudget,
	from: BudgetSource = 'default',
): TestEstimate {
	const runs = plannedRuns(plan)
	const perRun = defaultCostPerRun[harness]
	const fromLast = last?.cost && last.totalRuns ? (last.cost * runs) / last.totalRuns : undefined
	const estimate = fromLast ?? (perRun === undefined ? null : perRun * runs)
	const basis = fromLast !== undefined ? 'last-result' : estimate === null ? 'none' : 'per-run-default'
	const rounded = estimate === null ? null : Math.round(estimate * 100) / 100
	const lastSeen = last
		? {
				...(last.totalRuns ? { runs: last.totalRuns } : {}),
				...(last.cost ? { cost: last.cost } : {}),
				...(last.durationMs ? { durationMs: last.durationMs } : {}),
			}
		: undefined
	const within = rounded === null ? runs <= budget.runs : rounded <= budget.cost
	const cost = rounded === null ? 'no cost known' : `$${rounded.toFixed(2)}`
	const unset = from === 'default' ? '; no budget configured, default used' : ''
	return {
		skill,
		runs,
		estimate: rounded,
		basis,
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
			: `about $${estimate.estimate.toFixed(2)} (${estimate.basis === 'last-result' ? 'from the last result' : 'at the default per-run cost'})`
	let line = `skill test: ${estimate.runs} runs, ${cost}; budget $${estimate.budget.cost} or ${estimate.budget.runs} runs: ${estimate.within ? 'within' : 'over'}`
	const took = estimate.last?.durationMs
	if (took)
		line += `; last time ${estimate.last?.runs ?? 'an unknown number of'} runs took about ${Math.max(1, Math.round(took / 60_000))} min`
	return `${line}\n${estimate.line}\n`
}
