import type { TestPlan } from './test-plan.js'

export type Status = 'pass' | 'fail' | 'not-tested' | 'not-run'

export type TriggerResult = {
	case: string
	prompt: string
	expect: 'fire' | 'skip'
	fired: number
	ran: number
	status: Status
}
export type Failure = { case: string; run: number; output: string }
export type CriterionResult = {
	id: string
	status: Status
	reason?: string
	passed?: number
	ran?: number
	baseline?: { passed: number; ran: number }
	failures?: Failure[]
}
export type CaseStatus = { case: string; status: Status }

/** The saved result of `skill test`, the shape every Verification implementation writes (`test.md`). */
export type TestResult = {
	version: 1
	skill: string
	/** The skill's absolute folder when the result was saved; older results lack it. */
	folder?: string
	at: string
	verification: string
	runs: number
	threshold: number
	baseline: string
	trigger: TriggerResult[]
	criteria: CriterionResult[]
	cases: CaseStatus[]
	/** Set when only the named cases ran (R102): the result covers them alone, is compared for them alone, and is never the expected result. */
	partial?: { cases: string[] }
	notRun: { case: string; reason: string }[]
	changed?: { case: string; from: Status; to: Status }[]
	/** Which result `changed` compares with: the skill's expected result, else the previous saved one. */
	comparedWith?: 'expected' | 'previous'
	/** Set when there is neither an expected nor a previous result to compare with. */
	noPrevious?: true
	/** In a `test` report only: this run passed with no expected result, and was saved as it (R80). */
	savedAsExpected?: true
	cost?: number
	/** How long the run took, in milliseconds; results saved before it was recorded lack it. */
	durationMs?: number
	/** How many runs it planned; results saved before it was recorded lack it, and their count is unknown. */
	totalRuns?: number
	/** The file beside this result, in the same folder, holding the reply of every run (R138); older results lack it. */
	replies?: string
	/** promptfoo's own ID for the run, for `promptfoo view` and `promptfoo show eval <id>`. */
	evalId?: string
}

/** One run's record in the replies file beside a saved result (R138). */
export type Reply = {
	case: string
	arm: 'with-skill' | 'baseline'
	/** 1-based. */
	run: number
	outcome: 'pass' | 'fail' | 'fired' | 'not fired' | 'not run'
	/** For a run that did not run: its short reason, and the full error promptfoo gave. */
	reason?: string
	error?: string
	/** The model's whole reply. */
	reply: string
	/** Each criterion the run decided, with why it failed when it did. */
	criteria?: Record<string, { pass: boolean; detail?: string }>
}

/** The fields of one promptfoo `results.results[]` entry that `skill test` reads. */
type Row = {
	provider?: { label?: string }
	testCase?: { description?: string; vars?: { kind?: string } }
	repeatIndex?: number
	success?: boolean
	error?: string | null
	cost?: number
	response?: {
		output?: unknown
		error?: string
		metadata?: { skipped?: boolean; fired?: boolean; checks?: Record<string, { pass: boolean; detail?: string }> }
	}
	gradingResult?: {
		componentResults?: { pass: boolean; reason?: string; assertion?: { metric?: string; type?: string } }[]
	}
}

/** Wrappers the Agent SDK provider puts around the reason a run failed. */
const errorWrappers = [
	/^Error calling Claude Agent SDK:\s*/i,
	/^Error:\s*/,
	/^Claude Code returned an error result:\s*/i,
]

/**
 * The reason a run errored, in one short line (R137): the first line, without the wrappers promptfoo's Agent SDK
 * provider adds, cut at 160 characters. `Error calling Claude Agent SDK: Error: Claude Code returned an error
 * result: Not logged in` becomes `Not logged in`.
 */
export function shortReason(error: string): string {
	let line = (error.split('\n').find((text) => text.trim() !== '') ?? '').trim()
	for (let again = true; again; ) {
		again = false
		for (const wrapper of errorWrappers)
			if (wrapper.test(line)) {
				line = line.replace(wrapper, '')
				again = true
			}
	}
	if (!line) return 'no reason given'
	return line.length > 160 ? `${line.slice(0, 159)}…` : line
}

/** A run that errored or hit a limit: never a pass (R32). Assertion failures are not errors. */
function runError(row: Row): string | undefined {
	if (row.response?.error) return row.response.error
	if (row.response === undefined) return row.error ?? 'no response'
	return undefined
}

function criterionPassed(row: Row, id: string): { pass: boolean; output: string } {
	const parts = row.gradingResult?.componentResults?.filter((part) => part.assertion?.metric === id) ?? []
	const check = row.response?.metadata?.checks?.[id]
	const pass = parts.length > 0 && parts.every((part) => part.pass) && (check === undefined || check.pass)
	// A check with no detail, such as a script that only exits 1, falls back to the model's reply.
	const reply = String(row.response?.output ?? '').slice(0, 2000)
	const output = check && !check.pass ? check.detail || reply : (parts.find((part) => !part.pass)?.reason ?? reply)
	return { pass, output }
}

/** Turns promptfoo's output JSON into the saved result, against the plan that produced it. */
export function readPromptfooOutput(
	output: unknown,
	plan: TestPlan,
	meta: { skill: string; at: string; verification: string; baseline: string; baselineRan: boolean },
): TestResult {
	const rows: Row[] = ((output as { results?: { results?: Row[] } })?.results?.results ?? []) as Row[]
	const byCase = (id: string, label: string) =>
		rows.filter((row) => row.testCase?.description === id && row.provider?.label === label)
	const notRun = [...plan.notRun]
	for (const row of rows) {
		const error = runError(row)
		if (error && !(row.response?.metadata?.skipped ?? false))
			notRun.push({
				case: `${row.testCase?.description ?? '?'} (${row.provider?.label ?? '?'}, run ${(row.repeatIndex ?? 0) + 1})`,
				reason: shortReason(error),
			})
	}
	const ok = (row: Row) => runError(row) === undefined
	const statusOf = (count: number, ran: number): Status =>
		ran === 0 ? 'not-run' : count >= Math.min(plan.threshold, plan.runs) ? 'pass' : 'fail'

	const trigger: TriggerResult[] = plan.cases
		.filter((item) => item.kind === 'trigger')
		.map((item) => {
			const runs = byCase(item.id, 'with-skill').filter(ok)
			const fired = runs.filter((row) => row.response?.metadata?.fired).length
			const right = item.expect === 'fire' ? fired : runs.length - fired
			return {
				case: item.id,
				prompt: item.prompt,
				expect: item.expect as 'fire' | 'skip',
				fired,
				ran: runs.length,
				status: statusOf(right, runs.length),
			}
		})

	const outcomes = plan.cases.filter((item) => item.kind === 'outcome')
	const criteria: CriterionResult[] = plan.criteria.map((id) => {
		const skipped = plan.notTested.find((entry) => entry.id === id || entry.id === '*')
		if (skipped) return { id, status: 'not-tested', reason: skipped.reason }
		const covering = outcomes.filter((item) => id in item.rubrics || id in item.judged)
		if (!covering.length)
			return {
				id,
				status: 'not-tested',
				reason: plan.only ? 'none of the cases named tests it' : 'no outcome case that runs tests it',
			}
		let passed = 0
		let ran = 0
		const failures: Failure[] = []
		const statuses: Status[] = []
		for (const item of covering) {
			const runs = byCase(item.id, 'with-skill').filter(ok)
			let casePassed = 0
			for (const row of runs) {
				const decided = criterionPassed(row, id)
				if (decided.pass) casePassed++
				else failures.push({ case: item.id, run: (row.repeatIndex ?? 0) + 1, output: decided.output })
			}
			passed += casePassed
			ran += runs.length
			statuses.push(statusOf(casePassed, runs.length))
		}
		const status: Status = statuses.includes('fail')
			? 'fail'
			: statuses.every((s) => s === 'not-run')
				? 'not-run'
				: 'pass'
		const result: CriterionResult = { id, status, passed, ran }
		if (meta.baselineRan) {
			const base = covering.flatMap((item) => byCase(item.id, 'baseline').filter(ok))
			result.baseline = { passed: base.filter((row) => criterionPassed(row, id).pass).length, ran: base.length }
		}
		if (failures.length) result.failures = failures
		return result
	})
	/** An outcome case passes when every criterion it tests meets the threshold in its runs. */
	const outcomeStatus = (item: (typeof outcomes)[number]): Status => {
		const ids = [...new Set([...Object.keys(item.rubrics), ...Object.keys(item.judged)])]
		if (!ids.length) return 'not-tested'
		const runs = byCase(item.id, 'with-skill').filter(ok)
		if (!runs.length) return 'not-run'
		const each = ids.map((id) => statusOf(runs.filter((row) => criterionPassed(row, id).pass).length, runs.length))
		return each.includes('fail') ? 'fail' : 'pass'
	}
	const cases: CaseStatus[] = [
		...trigger.map((item) => ({ case: item.case, status: item.status })),
		...outcomes.map((item) => ({ case: item.id, status: outcomeStatus(item) })),
		...plan.notRun.map((item) => ({ case: item.case, status: 'not-run' as Status })),
	]
	const cost = rows.reduce((sum, row) => sum + (row.cost ?? 0), 0)
	return {
		version: 1,
		skill: meta.skill,
		at: meta.at,
		verification: meta.verification,
		runs: plan.runs,
		threshold: plan.threshold,
		baseline: meta.baseline,
		trigger,
		criteria,
		cases,
		...(plan.only ? { partial: { cases: plan.only } } : {}),
		notRun,
		...(cost ? { cost: Math.round(cost * 10000) / 10000 } : {}),
	}
}

/** The reply of every run, passed or failed, with the skill and without it, for the file beside a saved result (R138). */
export function readReplies(output: unknown): Reply[] {
	const rows: Row[] = ((output as { results?: { results?: Row[] } })?.results?.results ?? []) as Row[]
	const replies: Reply[] = []
	for (const row of rows) {
		const meta = row.response?.metadata
		if (meta?.skipped) continue
		const arm = row.provider?.label === 'baseline' ? 'baseline' : 'with-skill'
		const entry: Reply = {
			case: row.testCase?.description ?? '?',
			arm,
			run: (row.repeatIndex ?? 0) + 1,
			outcome: 'pass',
			reply: String(row.response?.output ?? ''),
		}
		const error = runError(row)
		const ids = [
			...new Set(
				(row.gradingResult?.componentResults ?? [])
					.map((part) => part.assertion?.metric)
					.filter((id): id is string => !!id && id !== 'fired'),
			),
		]
		if (error) {
			entry.outcome = 'not run'
			entry.reason = shortReason(error)
			entry.error = error
		} else if (row.testCase?.vars?.kind === 'trigger') {
			entry.outcome = meta?.fired ? 'fired' : 'not fired'
		} else if (ids.length) {
			entry.criteria = Object.fromEntries(
				ids.map((id) => {
					const decided = criterionPassed(row, id)
					return [id, decided.pass ? { pass: true } : { pass: false, detail: decided.output }]
				}),
			)
			entry.outcome = Object.values(entry.criteria).every((item) => item.pass) ? 'pass' : 'fail'
		} else if (row.success === false) entry.outcome = 'fail'
		replies.push(entry)
	}
	return replies
}

/** Adds the cases that changed between pass and fail since `compared` (the expected result, else the previous one), or marks that there is none (R26). */
export function compareWithPrevious(
	result: TestResult,
	compared: TestResult | undefined,
	comparedWith: 'expected' | 'previous' = 'previous',
): TestResult {
	if (!compared) return { ...result, noPrevious: true }
	const before = new Map(compared.cases.map((item) => [item.case, item.status]))
	const changed = result.cases.flatMap((item) => {
		if (result.partial && !result.partial.cases.includes(item.case)) return []
		const from = before.get(item.case)
		const flipped = (from === 'pass' && item.status === 'fail') || (from === 'fail' && item.status === 'pass')
		return flipped && from ? [{ case: item.case, from, to: item.status }] : []
	})
	return { ...result, comparedWith, changed }
}
