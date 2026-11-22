/**
 * What a case's runs cost and the cap a run is held to (#394). A cost cap is the provider's, in US dollars, never the
 * Agent SDK's `max_budget_usd`: Claude Code shows that budget to the model, and a run that sees it stops for that
 * reason instead of the skill's own (#238).
 */

/** What one run may spend when its case has recorded no cost and names no cap of its own. Also the least a cap is. */
export const runCostCap = 0.5

/** How far above its case's recorded cost a run may go before it is stopped. */
export const costHeadroom = 2

/** What one arm's runs of a case cost: how many ran, what they cost together, and what the dearest one cost. */
export type ArmCost = { runs: number; total: number; max: number }

/** What a case's runs cost, per arm, as an expected entry records it. */
export type CaseCost = { skill?: ArmCost; baseline?: ArmCost }

/** A run's cost in US dollars, rounded to the 4 places a result keeps. */
const round = (value: number) => Math.round(value * 10000) / 10000

/** The cost of one arm's runs, from each run's cost; undefined when no run reports one. */
export function armCost(costs: (number | undefined)[]): ArmCost | undefined {
	const known = costs.filter((cost): cost is number => typeof cost === 'number' && cost > 0)
	if (!known.length) return undefined
	return {
		runs: known.length,
		total: round(known.reduce((sum, cost) => sum + cost, 0)),
		max: round(Math.max(...known)),
	}
}

/**
 * The most one run may cost (#394): the case's own cap when it names one; otherwise twice what its dearest run last
 * cost, and never below the default. A case with no recorded cost gets the default.
 */
export function costCapOf(own: number | undefined, recorded: ArmCost | undefined): number {
	if (own !== undefined) return own
	return recorded ? Math.max(runCostCap, round(recorded.max * costHeadroom)) : runCostCap
}

/** The caps of one case's two arms, as a run reads them from its case's variables. */
export type ArmCaps = { skill: number; baseline: number }

/** Both arms' caps for a case, from its own cap and its recorded cost. */
export function armCaps(own: number | undefined, recorded: CaseCost | undefined): ArmCaps {
	return { skill: costCapOf(own, recorded?.skill), baseline: costCapOf(own, recorded?.baseline) }
}

/** What a run of a case is expected to cost in one arm, its recorded average, or undefined when none is recorded. */
export function expectedRunCost(recorded: ArmCost | undefined): number | undefined {
	return recorded?.runs ? recorded.total / recorded.runs : undefined
}
