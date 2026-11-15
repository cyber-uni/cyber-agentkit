/**
 * The messages a harness ends a run with when the account's usage limit is reached (R161). A run that ends with one is
 * limit reached: it counts toward no pass rate, and no new run starts after it. Add an entry here for each new one,
 * with the research claim that names it.
 */
export type UsageLimit = {
	/** A short, stable name for the message. */
	id: string
	/**
	 * A regular expression source that matches the message's fixed text in a run's error. Its named group `resets`,
	 * when the message has one, is when the limit resets, as the message says it.
	 */
	pattern: string
}

export const usageLimits: readonly UsageLimit[] = [
	{
		// E-CC-D19: `You've hit your 5-hour limit · resets 4:40am (America/Los_Angeles)`.
		id: 'claude-code-usage-limit',
		pattern: String.raw`You['’]ve hit your [^\n·]*?limit(?:\s*·\s*resets (?<resets>[^\n]+?))?\s*$`,
	},
]

/** The usage limit a run hit: its message, cut at 160 characters, and when it resets when the message says. */
export type UsageLimitHit = { text: string; resets?: string }

/** The first known usage-limit message in a run's error, if any. */
export function recognizeUsageLimit(
	text: string,
	limits: readonly UsageLimit[] = usageLimits,
): UsageLimitHit | undefined {
	for (const limit of limits) {
		const match = new RegExp(limit.pattern, 'm').exec(text)
		if (!match) continue
		const resets = match.groups?.['resets']?.trim()
		return { text: match[0].trim().slice(0, 160), ...(resets ? { resets } : {}) }
	}
	return undefined
}
