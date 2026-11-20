import { recognizeSandboxFault } from './sandbox-faults.js'
import type { TestPlan } from './test-plan.js'
import { recognizeUsageLimit } from './usage-limits.js'

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
	/** Set when every case that tests it is a regression guard (R160): a pass without the skill too is expected. */
	guard?: true
	failures?: Failure[]
}
/**
 * A case's status, with how many of its runs went right; results saved before the counts were recorded lack them.
 * `sandboxFailed` counts its runs with the skill that were sandbox failures (R154), left out when none was.
 */
export type CaseStatus = {
	case: string
	status: Status
	passed?: number
	ran?: number
	sandboxFailed?: number
	/**
	 * Set on a regression guard (R160), an outcome case expected to pass without the skill too. With the baseline run,
	 * `baseline` counts its baseline runs in which every criterion it tests passed.
	 */
	guard?: true
	baseline?: { passed: number; ran: number }
	/** Set when the case named its own model (R161): the model its runs used, instead of the result's `model`. */
	model?: string
}
/** One point of a case's pass rate: the result it comes from (its `at`), and how many runs went right of how many ran. */
export type RatePoint = { at: string; passed: number; ran: number }
/** One thing a run tried that its containment refused, with the run that tried it. */
export type Blocked = {
	case: string
	arm: 'skill' | 'baseline'
	run: number
	what: 'read' | 'write' | 'network'
	target: string
}
/** A path outside the run's folders that a shell command of a folder-only run named and changed (#302). */
export type WroteOutside = {
	case: string
	arm: 'skill' | 'baseline'
	run: number
	target: string
}
/** A run the test sandbox broke (R154): `fault` names the known error (`sandbox-faults.ts`), `text` is its text. */
export type SandboxFailure = {
	case: string
	arm: 'skill' | 'baseline'
	run: number
	fault: string
	text: string
}

/** One run of a case in one arm: what a result has left when it is incomplete (R162). */
export type RunSlot = { case: string; arm: 'skill' | 'baseline'; run: number }

/**
 * Set when the account's usage limit ended the test before every run finished (R162): the limit's message, when it
 * resets when the message says, and each run left, both those the limit ended and those it never started.
 */
export type Incomplete = {
	reason: 'limit reached'
	text: string
	resets?: string
	left: RunSlot[]
	/** Set by `skill test` on a result it can resume (R163): what the skill and plan were, so a change refuses it. */
	fingerprint?: string
	/** The options the run was made with, which a resume uses again. */
	options?: ResumeOptions
	/** The file beside this result holding the runs it finished, which a resume merges with its own. */
	runs?: string
}

/** The options of a test that a resume of it runs with again (R163). */
export type ResumeOptions = {
	harness: string
	backend: string
	cases?: string[]
	model?: string
	judge?: string
	baseline?: string
	trustScripts?: true
	/** The sandbox template given with `--sandbox` (#302); a resume runs with it again. */
	sandbox?: string
}

/** The saved result of `skill test`, the shape every Verification implementation writes (`test.md`). */
export type TestResult = {
	version: 1
	skill: string
	/** The skill's absolute folder when the result was saved; older results lack it. */
	folder?: string
	at: string
	verification: string
	/**
	 * Which sandbox did not run (#302): `none` when shell commands, setup scripts, and `script` checks all ran without one,
	 * as the `folder-only` template has it; `shell-only` when only shell commands ran in one, `scripts-only` when only
	 * scripts did. Left out when both sandboxes ran.
	 */
	sandbox?: 'none' | 'shell-only' | 'scripts-only'
	/** In a result whose shell commands ran without a sandbox, each path outside a run's folders that one changed (#302). */
	wroteOutside?: WroteOutside[]
	/**
	 * The model the cases ran on unless one names its own (R161): the model passed to the harness, or `default` when
	 * the harness picked it. Results saved before it was recorded lack it, and their model is unknown.
	 */
	model?: string
	runs: number
	threshold: number
	baseline: string
	trigger: TriggerResult[]
	criteria: CriterionResult[]
	cases: CaseStatus[]
	/** Set when only the named cases ran (R102): the result covers them alone, is compared for them alone, and is never the expected result. */
	partial?: { cases: string[] }
	notRun: { case: string; reason: string }[]
	/** What the runs' containment refused (R107): a read or write outside the run's folder, or a host the case does not list. */
	blocked?: Blocked[]
	/** The runs, in either arm, that the test sandbox broke (R154); they count toward no pass rate. Left out when none was. */
	sandboxFailures?: SandboxFailure[]
	/** Set when the usage limit stopped the test before every run finished (R162); never the expected result. */
	incomplete?: Incomplete
	/** Set on a result a resume made (R163): the `at` of the incomplete result whose runs it holds. */
	resumedFrom?: string
	changed?: { case: string; from: Status; to: Status }[]
	/**
	 * The cases whose model differs from the one they ran on in the result `changed` compares with (R161), so a change
	 * is not read as the skill's alone. `unknown` names the model of a result saved before it was recorded.
	 */
	modelChanged?: { case: string; from: string; to: string }[]
	/** Which result `changed` compares with: the skill's expected result, else the previous saved one. */
	comparedWith?: 'expected' | 'previous'
	/** The cases whose pass rate moved across the kept accepted results and this run, each with its rate in each, oldest first. */
	moved?: { case: string; rates: RatePoint[] }[]
	/** Set when there is neither an expected nor a previous result to compare with. */
	noPrevious?: true
	/** In a `test` report only: this run passed with no expected result, and was saved as it (R80). */
	savedAsExpected?: true
	/**
	 * In a `test` report only (#322): there was no expected result and nothing failed, but not every trigger case and
	 * criterion passed (some are `not-run` or `not-tested`, or no run finished), so it was not saved as it; says why.
	 */
	notSavedAsExpected?: string
	/** In a `test` report only: the result would have been saved as the expected one, but it has sandbox failures (R154). */
	expectedHeld?: true
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
	/** `with-skill` or `baseline` for `skill test`; the wording's label (`A` or `B`) for `instruction compare`. */
	arm: string
	/** 1-based. */
	run: number
	outcome: 'pass' | 'fail' | 'fired' | 'not fired' | 'not run' | 'sandbox failure' | 'limit reached'
	/**
	 * For a run that did not run: its short reason, and the full error promptfoo gave. For a sandbox failure: the
	 * fault's text. For a run that reached the usage limit: the limit's message.
	 */
	reason?: string
	error?: string
	/** The model's whole reply. */
	reply: string
	/** Each criterion the run decided, with why it failed when it did. */
	criteria?: Record<string, { pass: boolean; detail?: string }>
}

/** The fields of one promptfoo `results.results[]` entry that `skill test` reads. */
export type Row = {
	provider?: { label?: string }
	testCase?: { description?: string; vars?: { kind?: string; __run?: string } }
	repeatIndex?: number
	success?: boolean
	error?: string | null
	cost?: number
	response?: {
		output?: unknown
		error?: string
		metadata?: {
			skipped?: boolean
			fired?: boolean
			checks?: Record<string, { pass: boolean; detail?: string }>
			blocked?: { what: Blocked['what']; target: string }[]
			wroteOutside?: string[]
			sandboxFault?: { fault: string; text: string }
			/** The usage limit ended the run, or it found the limit reached and never started (R162). */
			limitReached?: { text: string; resets?: string; started?: boolean }
			/** The case's setup script failed before the model started (R156): its output. */
			setupFailed?: { text: string }
		}
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

/** The known sandbox fault a run hit (R154): recorded from its tool output by the provider, or found in its error. */
function sandboxFaultOf(row: Row): { fault: string; text: string } | undefined {
	const recorded = row.response?.metadata?.sandboxFault
	if (recorded) return recorded
	const error = runError(row)
	return error ? recognizeSandboxFault(error) : undefined
}

/** The usage limit a run reached (R162): recorded by the provider, or found in its error. */
function limitOf(row: Row): { text: string; resets?: string } | undefined {
	const recorded = row.response?.metadata?.limitReached
	if (recorded) return { text: recorded.text, ...(recorded.resets ? { resets: recorded.resets } : {}) }
	const error = runError(row)
	return error ? recognizeUsageLimit(error) : undefined
}

/**
 * The rows of promptfoo's output JSON, cut to the fields `skill test` reads, so a resume can merge the runs an
 * incomplete result finished with its own (R163).
 */
export function readRows(output: unknown): Row[] {
	const rows = ((output as { results?: { results?: Row[] } })?.results?.results ?? []) as Row[]
	return rows.map((row) => {
		const kept: Row = {}
		if (row.provider?.label !== undefined) kept.provider = { label: row.provider.label }
		if (row.testCase) kept.testCase = { description: row.testCase.description, vars: row.testCase.vars }
		if (row.repeatIndex !== undefined) kept.repeatIndex = row.repeatIndex
		if (row.success !== undefined) kept.success = row.success
		if (row.error !== undefined) kept.error = row.error
		if (row.cost !== undefined) kept.cost = row.cost
		if (row.response) kept.response = row.response
		if (row.gradingResult?.componentResults)
			kept.gradingResult = {
				componentResults: row.gradingResult.componentResults.map((part) => ({
					pass: part.pass,
					...(part.reason !== undefined ? { reason: part.reason } : {}),
					...(part.assertion ? { assertion: { metric: part.assertion.metric, type: part.assertion.type } } : {}),
				})),
			}
		return kept
	})
}

/** Whether a row is a run the usage limit ended or never started (R162). */
export function limitReached(row: Row): boolean {
	return !row.response?.metadata?.skipped && limitOf(row) !== undefined
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
	meta: {
		skill: string
		at: string
		verification: string
		baseline: string
		baselineRan: boolean
		/**
		 * The provider labels of the arm the result is about and of the arm it is set against; `with-skill` and
		 * `baseline` when absent. `instruction compare` reads each wording's arm this way.
		 */
		arms?: { main: string; other: string } | undefined
	},
): TestResult {
	const rows: Row[] = ((output as { results?: { results?: Row[] } })?.results?.results ?? []) as Row[]
	const main = meta.arms?.main ?? 'with-skill'
	const other = meta.arms?.other ?? 'baseline'
	const byCase = (id: string, label: string) =>
		rows.filter((row) => row.testCase?.description === id && row.provider?.label === label)
	const notRun = [...plan.notRun]
	const sandboxFailures: SandboxFailure[] = []
	const left: RunSlot[] = []
	let limit: { text: string; resets?: string } | undefined
	for (const row of rows) {
		if (row.response?.metadata?.skipped) continue
		const reached = limitOf(row)
		const fault = sandboxFaultOf(row)
		const error = runError(row)
		if (reached) {
			// The message of a run the limit ended says more than that of one it never started.
			if (!limit || (!limit.resets && reached.resets)) limit = reached
			left.push({
				case: row.testCase?.description ?? '?',
				arm: row.provider?.label === main ? 'skill' : 'baseline',
				run: (row.repeatIndex ?? 0) + 1,
			})
		} else if (fault)
			sandboxFailures.push({
				case: row.testCase?.description ?? '?',
				arm: row.provider?.label === main ? 'skill' : 'baseline',
				run: (row.repeatIndex ?? 0) + 1,
				...fault,
			})
		else if (error)
			notRun.push({
				case: `${row.testCase?.description ?? '?'} (${row.provider?.label ?? '?'}, run ${(row.repeatIndex ?? 0) + 1})`,
				reason: shortReason(error),
			})
	}
	// A run that errored, that the sandbox broke, or that the usage limit ended, never counts toward a pass rate (R32,
	// R154, R162).
	const ok = (row: Row) => runError(row) === undefined && sandboxFaultOf(row) === undefined
	const limited = (id: string) => left.filter((item) => item.case === id && item.arm === 'skill').length
	const broken = (id: string) =>
		sandboxFailures.filter((item) => item.case === id && item.arm === 'skill').length + limited(id)
	const sandboxFailed = (id: string) => {
		const count = broken(id) - limited(id)
		return count ? { sandboxFailed: count } : {}
	}
	const setupFailed = (id: string) =>
		byCase(id, main).filter((row) => row.response?.metadata?.setupFailed && !sandboxFaultOf(row) && !limitOf(row))
			.length
	// The threshold holds over the runs the sandbox did not break and whose setup script did not fail, so neither fails
	// a case (R154, R156); a run that errored otherwise still counts against it (R32).
	const statusOf = (count: number, ran: number, id: string): Status =>
		ran === 0
			? 'not-run'
			: count >= Math.min(plan.threshold, plan.runs - broken(id) - setupFailed(id))
				? 'pass'
				: 'fail'

	const trigger: TriggerResult[] = plan.cases
		.filter((item) => item.kind === 'trigger')
		.map((item) => {
			const runs = byCase(item.id, main).filter(ok)
			const fired = runs.filter((row) => row.response?.metadata?.fired).length
			const right = item.expect === 'fire' ? fired : runs.length - fired
			return {
				case: item.id,
				prompt: item.prompt,
				expect: item.expect as 'fire' | 'skip',
				fired,
				ran: runs.length,
				status: statusOf(right, runs.length, item.id),
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
			const runs = byCase(item.id, main).filter(ok)
			let casePassed = 0
			for (const row of runs) {
				const decided = criterionPassed(row, id)
				if (decided.pass) casePassed++
				else failures.push({ case: item.id, run: (row.repeatIndex ?? 0) + 1, output: decided.output })
			}
			passed += casePassed
			ran += runs.length
			statuses.push(statusOf(casePassed, runs.length, item.id))
		}
		const status: Status = statuses.includes('fail')
			? 'fail'
			: statuses.every((s) => s === 'not-run')
				? 'not-run'
				: 'pass'
		const result: CriterionResult = { id, status, passed, ran }
		if (covering.every((item) => item.guard)) result.guard = true
		if (meta.baselineRan) {
			const base = covering.flatMap((item) => byCase(item.id, other).filter(ok))
			result.baseline = { passed: base.filter((row) => criterionPassed(row, id).pass).length, ran: base.length }
		}
		if (failures.length) result.failures = failures
		return result
	})
	/**
	 * An outcome case passes when every criterion it tests meets the threshold in its runs. Its count is the runs in
	 * which every criterion it tests passed.
	 */
	const outcomeStatus = (item: (typeof outcomes)[number]): CaseStatus => {
		const ids = [...new Set([...Object.keys(item.rubrics), ...Object.keys(item.judged)])]
		const guard = item.guard ? { guard: true as const } : {}
		if (!ids.length) return { case: item.id, status: 'not-tested', ...guard }
		const runs = byCase(item.id, main).filter(ok)
		if (!runs.length) return { case: item.id, status: 'not-run', ...sandboxFailed(item.id), ...guard }
		const each = ids.map((id) =>
			statusOf(runs.filter((row) => criterionPassed(row, id).pass).length, runs.length, item.id),
		)
		const allPassed = (row: Row) => ids.every((id) => criterionPassed(row, id).pass)
		const base = item.guard && meta.baselineRan ? byCase(item.id, other).filter(ok) : undefined
		return {
			case: item.id,
			status: each.includes('fail') ? 'fail' : 'pass',
			passed: runs.filter(allPassed).length,
			ran: runs.length,
			...sandboxFailed(item.id),
			...guard,
			...(base ? { baseline: { passed: base.filter(allPassed).length, ran: base.length } } : {}),
		}
	}
	const ownModel = new Map(plan.cases.flatMap((item) => (item.model ? [[item.id, item.model] as const] : [])))
	const withModel = (item: CaseStatus): CaseStatus =>
		ownModel.has(item.case) ? { ...item, model: ownModel.get(item.case) as string } : item
	const cases: CaseStatus[] = [
		...trigger.map((item) =>
			item.ran
				? {
						case: item.case,
						status: item.status,
						passed: triggerRight(item),
						ran: item.ran,
						...sandboxFailed(item.case),
					}
				: { case: item.case, status: item.status, ...sandboxFailed(item.case) },
		),
		...outcomes.map(outcomeStatus),
		...plan.notRun.map((item) => ({ case: item.case, status: 'not-run' as Status })),
	].map(withModel)
	const cost = rows.reduce((sum, row) => sum + (row.cost ?? 0), 0)
	const blocked: Blocked[] = rows.flatMap((row) =>
		(row.response?.metadata?.blocked ?? []).map((item) => ({
			case: row.testCase?.description ?? '?',
			arm: row.provider?.label === main ? ('skill' as const) : ('baseline' as const),
			run: (row.repeatIndex ?? 0) + 1,
			what: item.what,
			target: item.target,
		})),
	)
	const wroteOutside: WroteOutside[] = rows.flatMap((row) =>
		(row.response?.metadata?.wroteOutside ?? []).map((target) => ({
			case: row.testCase?.description ?? '?',
			arm: row.provider?.label === main ? ('skill' as const) : ('baseline' as const),
			run: (row.repeatIndex ?? 0) + 1,
			target,
		})),
	)
	return {
		version: 1,
		skill: meta.skill,
		at: meta.at,
		verification: meta.verification,
		...(plan.model ? { model: plan.model } : {}),
		runs: plan.runs,
		threshold: plan.threshold,
		baseline: meta.baseline,
		trigger,
		criteria,
		cases,
		...(plan.only ? { partial: { cases: plan.only } } : {}),
		notRun,
		...(blocked.length ? { blocked } : {}),
		...(wroteOutside.length ? { wroteOutside } : {}),
		...(sandboxFailures.length ? { sandboxFailures } : {}),
		...(limit && left.length
			? {
					incomplete: {
						reason: 'limit reached' as const,
						text: limit.text,
						...(limit.resets ? { resets: limit.resets } : {}),
						left,
					},
				}
			: {}),
		...(cost ? { cost: Math.round(cost * 10000) / 10000 } : {}),
	}
}

/** The reply of every run, passed or failed, with the skill and without it, for the file beside a saved result (R138). */
export function readReplies(
	output: unknown,
	armOf: (label: string | undefined) => string = (label) => (label === 'baseline' ? 'baseline' : 'with-skill'),
): Reply[] {
	const rows: Row[] = ((output as { results?: { results?: Row[] } })?.results?.results ?? []) as Row[]
	const replies: Reply[] = []
	for (const row of rows) {
		const meta = row.response?.metadata
		if (meta?.skipped) continue
		const arm = armOf(row.provider?.label)
		const entry: Reply = {
			case: row.testCase?.description ?? '?',
			arm,
			run: (row.repeatIndex ?? 0) + 1,
			outcome: 'pass',
			reply: String(row.response?.output ?? ''),
		}
		const error = runError(row)
		const fault = sandboxFaultOf(row)
		const reached = limitOf(row)
		const ids = [
			...new Set(
				(row.gradingResult?.componentResults ?? [])
					.map((part) => part.assertion?.metric)
					.filter((id): id is string => !!id && id !== 'fired'),
			),
		]
		if (reached) {
			entry.outcome = 'limit reached'
			entry.reason = reached.text
			if (error) entry.error = error
		} else if (fault) {
			entry.outcome = 'sandbox failure'
			entry.reason = fault.text
			if (error) entry.error = error
		} else if (error) {
			entry.outcome = 'not run'
			entry.reason = shortReason(error)
			// A failed setup script's whole output, not only its last line (R156).
			entry.error = meta?.setupFailed?.text ?? error
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

/** How many of a trigger case's runs went the way it expects. */
function triggerRight(item: TriggerResult): number {
	return item.expect === 'fire' ? item.fired : item.ran - item.fired
}

/**
 * Each case's pass rate in one result: the case's own count, else, for a result saved before cases carried one, its
 * trigger entry's. A case that did not run, or whose count the result does not hold, has none.
 */
export function caseRates(result: TestResult): Map<string, { passed: number; ran: number }> {
	const rates = new Map<string, { passed: number; ran: number }>()
	for (const item of result.trigger ?? [])
		if (item.ran) rates.set(item.case, { passed: triggerRight(item), ran: item.ran })
	for (const item of result.cases ?? [])
		if (item.ran && item.passed !== undefined) rates.set(item.case, { passed: item.passed, ran: item.ran })
	return rates
}

/**
 * Adds the cases whose pass rate moved across `history` (the kept accepted results, oldest first, the expected one
 * last) and this run. A case is named when its rate differs between any two results that hold one for it; each point
 * is a result's `at` and count. A partial run is compared for its cases alone. With no such case, `moved` is left out.
 */
export function compareWithHistory(result: TestResult, history: TestResult[]): TestResult {
	const { moved: _moved, ...rest } = result
	const points = [...history, result].map((item) => ({ at: item.at, rates: caseRates(item) }))
	const moved = result.cases.flatMap((item) => {
		if (result.partial && !result.partial.cases.includes(item.case)) return []
		const rates = points.flatMap((point) => {
			const rate = point.rates.get(item.case)
			return rate ? [{ at: point.at, ...rate }] : []
		})
		const differs = rates.some((rate) => rate.passed * rates[0]!.ran !== rates[0]!.passed * rate.ran)
		return rates.length > 1 && differs ? [{ case: item.case, rates }] : []
	})
	return moved.length ? { ...rest, moved } : rest
}

/** Adds the cases that changed between pass and fail since `compared` (the expected result, else the previous one), or marks that there is none (R26). */
export function compareWithPrevious(
	result: TestResult,
	compared: TestResult | undefined,
	comparedWith: 'expected' | 'previous' = 'previous',
): TestResult {
	if (!compared) return { ...result, noPrevious: true }
	const { modelChanged: _modelChanged, ...rest } = result
	const before = new Map(compared.cases.map((item) => [item.case, item.status]))
	const changed = result.cases.flatMap((item) => {
		if (result.partial && !result.partial.cases.includes(item.case)) return []
		const from = before.get(item.case)
		const flipped = (from === 'pass' && item.status === 'fail') || (from === 'fail' && item.status === 'pass')
		return flipped && from ? [{ case: item.case, from, to: item.status }] : []
	})
	const modelChanged = modelChanges(result, compared)
	return { ...rest, comparedWith, changed, ...(modelChanged.length ? { modelChanged } : {}) }
}

/** The model one case ran on in a result: its own, else the result's, else `unknown` for a result that lacks it. */
export function caseModel(result: TestResult, id: string): string {
	return result.cases.find((item) => item.case === id)?.model ?? result.model ?? 'unknown'
}

/**
 * The cases that ran and are in both results whose model differs between them (R161). A result saved before models
 * were recorded has the model `unknown`, so every case differs from one that names its model.
 */
export function modelChanges(result: TestResult, compared: TestResult): { case: string; from: string; to: string }[] {
	const known = new Set(compared.cases.map((item) => item.case))
	return result.cases.flatMap((item) => {
		if (!known.has(item.case) || item.status === 'not-run') return []
		if (result.partial && !result.partial.cases.includes(item.case)) return []
		const from = caseModel(compared, item.case)
		const to = caseModel(result, item.case)
		return from === to ? [] : [{ case: item.case, from, to }]
	})
}
