import { join } from 'node:path'
import type { Attestation } from './attestation.js'
import { readEvalSuite, rootScope, suiteCases, triggerScope } from './eval-suite.js'
import type { CaseCost } from './run-cost.js'
import type {
	Carried,
	CaseCriterion,
	CaseStatus,
	CriterionResult,
	InputHashes,
	KnownFailure,
	Reported,
	SandboxFailure,
	Status,
	TestResult,
	TriggerResult,
} from './test-result.js'

/**
 * A skill's expected result as one entry per case, keyed by its ID (R181): what `evals/expected.json` holds from version
 * 2 on. An accept writes the entries of the cases a run finished and leaves every other entry as it was; a case with no
 * entry whose runs pass gets one without an accept (R80). Every reader takes it through `expectedView`, which lays it out
 * as a saved result, so the comparison, the trend, and `skill report` read it as they read a run.
 */

/** One case's expected entry (R181): its result, the model, when it was recorded, and the hashes it was recorded against. */
export type ExpectedEntry = {
	/** The scope the case belongs to (K11): `trigger`, `root`, or the name of an instructions file. */
	scope: string
	status: Status
	passed?: number
	ran?: number
	sandboxFailed?: number
	/** For a trigger case. */
	prompt?: string
	expect?: 'fire' | 'skip'
	fired?: number
	/** For an outcome case: each criterion it tests, as its runs decided it. */
	criteria?: Record<string, CaseCriterion>
	guard?: true
	baseline?: { passed: number; ran: number }
	/** The marks of known failures on the case that its runs judged (#329). */
	knownFailures?: KnownFailure[]
	/** Its runs the sandbox broke, which the author accepted after seeing them (R154). */
	sandboxFailures?: SandboxFailure[]
	/** The model its runs used; left out when the run did not record one. */
	model?: string
	/** What its runs cost per arm (#394), the next run's cap and estimate grow from; entries written before it lack it. */
	cost?: CaseCost
	/** When the run it comes from was made. */
	at: string
	/** The hashes of its own definition and of its scope's inputs when it was recorded (R178, R180); left out when unknown. */
	hashes?: { case: string; scope: string }
	/** Set when the author carried it forward to the current inputs without a run (R183). */
	carried?: Carried
}

export type ExpectedFile = {
	version: 2
	skill: string
	/** When the file was last written. */
	at: string
	verification: string
	runs: number
	threshold: number
	baseline: string
	model?: string
	judge?: string
	/** The cost, run count, and duration of the last whole run accepted; a run of some cases leaves them as they were. */
	cost?: number
	totalRuns?: number
	durationMs?: number
	/** Every criterion ID the skill listed at the last write, in order. */
	criteria: string[]
	/** Why a criterion was not tested, as the last whole run said, for a criterion no entry tests. */
	notTested?: Record<string, string>
	entries: Record<string, ExpectedEntry>
	/**
	 * The inputs of each scope an entry was recorded against, by that scope hash, each input by name to its hash, so a
	 * later run names the input that changed (R177). Only the hashes some entry records are kept.
	 */
	inputs?: Record<string, Record<string, string>>
	/** What the last write's run depended on that selects no case (R179), to report when it changes. */
	reported?: Reported
	attested?: Attestation[]
}

/** A skill's eval set as an expected result needs it: each case ID in order, its kind, its scope, and the criteria it tests. */
export type EvalSet = { cases: { id: string; kind: 'trigger' | 'outcome'; scope: string; criteria: string[] }[] }

/** Reads a skill's eval set from its evals, the root file and each eval folder's (K11), or undefined when it cannot be read. */
export function readEvalSet(skillFolder: string, criteria: string[]): EvalSet | undefined {
	const suite = readEvalSuite(skillFolder)
	if ('problem' in suite) return undefined
	return {
		cases: suiteCases(suite, join(skillFolder, 'evals')).map((item) => ({
			id: item.id,
			kind: item.kind,
			scope: item.scope,
			criteria: item.kind === 'outcome' ? (item.item.criteria ?? criteria) : [],
		})),
	}
}

/** Whether a parsed `evals/expected.json` is the per-case form. */
export function isExpectedFile(value: unknown): value is ExpectedFile {
	const file = value as Partial<ExpectedFile> | undefined
	return file?.version === 2 && typeof file.entries === 'object' && file.entries !== null
}

/**
 * The cases of a run whose entries it can write (R181, R162): each that finished, meaning it ran and was decided, and
 * had no run at the usage limit.
 */
export function finishedCases(result: TestResult): string[] {
	const limited = new Set((result.incomplete?.left ?? []).map((item) => item.case))
	return result.cases
		.filter((item) => item.status !== 'not-run' && item.status !== 'not-tested' && !limited.has(item.case))
		.map((item) => item.case)
}

/** The cases of a run that had a run the sandbox broke, in either arm (R154). */
export function sandboxFailedCases(result: TestResult): Set<string> {
	return new Set((result.sandboxFailures ?? []).map((item) => item.case))
}

/** One case's entry, from a run's result. */
function entryOf(result: TestResult, id: string): ExpectedEntry | undefined {
	const item = result.cases.find((c) => c.case === id)
	if (!item) return undefined
	const trigger = result.trigger.find((t) => t.case === id)
	const scope = result.inputs?.scopeOf?.[id] ?? (trigger ? triggerScope : rootScope)
	const model = item.model ?? result.model
	const caseHash = result.inputs?.cases[id]
	const scopeHash = result.inputs?.scopes[scope]
	const knownFailures = result.knownFailures?.filter((k) => k.case === id) ?? []
	const sandboxFailures = result.sandboxFailures?.filter((s) => s.case === id) ?? []
	return {
		scope,
		status: item.status,
		...(item.passed !== undefined ? { passed: item.passed } : {}),
		...(item.ran !== undefined ? { ran: item.ran } : {}),
		...(item.sandboxFailed ? { sandboxFailed: item.sandboxFailed } : {}),
		...(trigger ? { prompt: trigger.prompt, expect: trigger.expect, fired: trigger.fired } : {}),
		...(item.criteria ? { criteria: item.criteria } : {}),
		...(item.guard ? { guard: true as const } : {}),
		...(item.baseline ? { baseline: item.baseline } : {}),
		...(knownFailures.length ? { knownFailures } : {}),
		...(sandboxFailures.length ? { sandboxFailures } : {}),
		...(model ? { model } : {}),
		...(item.cost ? { cost: item.cost } : {}),
		at: result.at,
		...(caseHash && scopeHash ? { hashes: { case: caseHash, scope: scopeHash } } : {}),
	}
}

/**
 * The entries a version 1 expected result, one saved run, holds for each case it decided. Their hashes are unknown, so
 * they read as behind their inputs until a run or a carry records them. `evalSet` tells which criteria an outcome case
 * tests; a criterion's counts are kept only when one case tests it, since the old form summed them over its cases.
 */
export function legacyEntries(old: TestResult, evalSet: EvalSet | undefined): Record<string, ExpectedEntry> {
	const entries: Record<string, ExpectedEntry> = {}
	const testedBy = (criterion: string) =>
		(evalSet?.cases ?? []).filter((c) => c.kind === 'outcome' && c.criteria.includes(criterion)).map((c) => c.id)
	for (const item of old.cases ?? []) {
		if (item.status === 'not-run' || item.status === 'not-tested') continue
		const trigger = (old.trigger ?? []).find((t) => t.case === item.case)
		const outcome = evalSet?.cases.find((c) => c.id === item.case && c.kind === 'outcome')
		let criteria: Record<string, CaseCriterion> | undefined
		if (outcome) {
			criteria = {}
			for (const criterion of old.criteria ?? []) {
				if (!outcome.criteria.includes(criterion.id) || criterion.status === 'not-tested') continue
				const failedHere = (criterion.failures ?? []).some((f) => f.case === item.case)
				const status: Status =
					item.status === 'pass' || !failedHere
						? 'pass'
						: criterion.status === 'known-failure'
							? 'known-failure'
							: 'fail'
				const only = testedBy(criterion.id).length === 1
				criteria[criterion.id] = {
					status,
					...(only && criterion.passed !== undefined ? { passed: criterion.passed, ran: criterion.ran ?? 0 } : {}),
					...(only && criterion.baseline ? { baseline: criterion.baseline } : {}),
				}
			}
		}
		const knownFailures = (old.knownFailures ?? []).filter((k) => k.case === item.case)
		const sandboxFailures = (old.sandboxFailures ?? []).filter((s) => s.case === item.case)
		const model = item.model ?? old.model
		entries[item.case] = {
			scope: evalSet?.cases.find((c) => c.id === item.case)?.scope ?? (trigger ? triggerScope : rootScope),
			status: item.status,
			...(item.passed !== undefined ? { passed: item.passed } : {}),
			...(item.ran !== undefined ? { ran: item.ran } : {}),
			...(item.sandboxFailed ? { sandboxFailed: item.sandboxFailed } : {}),
			...(trigger ? { prompt: trigger.prompt, expect: trigger.expect, fired: trigger.fired } : {}),
			...(criteria ? { criteria } : {}),
			...(item.guard ? { guard: true as const } : {}),
			...(item.baseline ? { baseline: item.baseline } : {}),
			...(knownFailures.length ? { knownFailures } : {}),
			...(sandboxFailures.length ? { sandboxFailures } : {}),
			...(model ? { model } : {}),
			at: old.at,
		}
	}
	return entries
}

/** A version 1 expected result in the per-case form, for a write to merge into. */
export function fromLegacy(old: TestResult, evalSet: EvalSet | undefined): ExpectedFile {
	const notTested = Object.fromEntries(
		(old.criteria ?? []).flatMap((c) => (c.status === 'not-tested' && c.reason ? [[c.id, c.reason]] : [])),
	)
	return {
		version: 2,
		skill: old.skill,
		at: old.at,
		verification: old.verification,
		runs: old.runs,
		threshold: old.threshold,
		baseline: old.baseline,
		...(old.model ? { model: old.model } : {}),
		...(old.judge ? { judge: old.judge } : {}),
		...(typeof old.cost === 'number' ? { cost: old.cost } : {}),
		...(typeof old.totalRuns === 'number' ? { totalRuns: old.totalRuns } : {}),
		...(typeof old.durationMs === 'number' ? { durationMs: old.durationMs } : {}),
		criteria: (old.criteria ?? []).map((c) => c.id),
		...(Object.keys(notTested).length ? { notTested } : {}),
		entries: legacyEntries(old, evalSet),
	}
}

/** What a write of entries did: the cases it wrote, the entries it dropped, and whether it replaced one. */
export type MergeOutcome = { file: ExpectedFile; written: string[]; dropped: string[]; replaced: boolean }

/**
 * Merges the entries of `cases` from a run into an expected result (R181): those cases' entries are replaced or added,
 * every other entry stays as it was, and an entry of a case `evalSet` no longer holds is dropped. Entries follow the eval
 * set's order. The file's settings become the run's; its cost, run count, and duration only when the run was whole.
 */
export function mergeEntries(
	previous: ExpectedFile | undefined,
	result: TestResult,
	cases: string[],
	evalSet: EvalSet | undefined,
): MergeOutcome {
	const entries: Record<string, ExpectedEntry> = { ...(previous?.entries ?? {}) }
	const written: string[] = []
	let replaced = false
	for (const id of cases) {
		const entry = entryOf(result, id)
		if (!entry) continue
		if (id in entries) replaced = true
		entries[id] = entry
		written.push(id)
	}
	const dropped: string[] = []
	let ordered = entries
	if (evalSet) {
		const known = new Set(evalSet.cases.map((c) => c.id))
		for (const id of Object.keys(entries)) if (!known.has(id)) dropped.push(id)
		ordered = Object.fromEntries(
			evalSet.cases.flatMap((c) => (entries[c.id] ? [[c.id, entries[c.id] as ExpectedEntry]] : [])),
		)
	}
	const whole = !result.partial && !result.incomplete
	const notTested = whole
		? Object.fromEntries(
				result.criteria.flatMap((c) => (c.status === 'not-tested' && c.reason ? [[c.id, c.reason]] : [])),
			)
		: (previous?.notTested ?? {})
	const kept = whole ? result : previous
	const file: ExpectedFile = {
		version: 2,
		skill: result.skill,
		at: result.at,
		verification: result.verification,
		runs: result.runs,
		threshold: result.threshold,
		baseline: result.baseline,
		...(result.model ? { model: result.model } : {}),
		...(result.judge ? { judge: result.judge } : previous?.judge ? { judge: previous.judge } : {}),
		...(typeof kept?.cost === 'number' ? { cost: kept.cost } : {}),
		...(typeof kept?.totalRuns === 'number' ? { totalRuns: kept.totalRuns } : {}),
		...(typeof kept?.durationMs === 'number' ? { durationMs: kept.durationMs } : {}),
		criteria: result.criteria.map((c) => c.id),
		...(Object.keys(notTested).length ? { notTested } : {}),
		entries: ordered,
		...keptInputs(ordered, previous?.inputs, result.inputs),
		...(result.inputs?.reported
			? { reported: result.inputs.reported }
			: previous?.reported
				? { reported: previous.reported }
				: {}),
		...(previous?.attested?.length ? { attested: previous.attested } : {}),
	}
	return { file, written, dropped, replaced }
}

/**
 * The inputs of each scope hash the entries record (R177): those `known` kept, with the ones `now` gives for its
 * scopes, and none an entry no longer records.
 */
function keptInputs(
	entries: Record<string, ExpectedEntry>,
	known: ExpectedFile['inputs'],
	now: InputHashes | undefined,
): Pick<ExpectedFile, 'inputs'> {
	const byHash: Record<string, Record<string, string>> = { ...(known ?? {}) }
	for (const [scope, hash] of Object.entries(now?.scopes ?? {})) {
		const list = now?.inputs?.[scope]
		if (list) byHash[hash] = list
	}
	const used = [...new Set(Object.values(entries).flatMap((entry) => (entry.hashes ? [entry.hashes.scope] : [])))]
	const inputs = Object.fromEntries(used.flatMap((hash) => (byHash[hash] ? [[hash, byHash[hash]]] : [])))
	return Object.keys(inputs).length ? { inputs } : {}
}

/**
 * Marks entries carried forward to the current inputs, without a run (R183): each takes the hashes `inputs` gives now
 * and the reason, and keeps its result and the date it was recorded. Answers the IDs carried and those with no entry.
 */
export function carryEntries(
	file: ExpectedFile,
	ids: string[],
	inputs: InputHashes,
	carried: Carried,
): { file: ExpectedFile; carried: string[]; missing: string[] } {
	const entries = { ...file.entries }
	const done: string[] = []
	const missing: string[] = []
	for (const id of ids) {
		const entry = entries[id]
		const caseHash = inputs.cases[id]
		const scope = entry ? (inputs.scopeOf?.[id] ?? entry.scope) : undefined
		const scopeHash = scope ? inputs.scopes[scope] : undefined
		if (!entry || !scope || !caseHash || !scopeHash) {
			missing.push(id)
			continue
		}
		entries[id] = { ...entry, scope, hashes: { case: caseHash, scope: scopeHash }, carried }
		done.push(id)
	}
	const { inputs: _inputs, ...rest } = file
	return { file: { ...rest, entries, ...keptInputs(entries, file.inputs, inputs) }, carried: done, missing }
}

const sum = (values: (number | undefined)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0)

/** A criterion's result beside the expected one, from the entries of the cases that test it (R182). */
function criterionOf(id: string, file: ExpectedFile): CriterionResult {
	const covering = Object.values(file.entries).filter((entry) => entry.criteria?.[id])
	if (!covering.length)
		return {
			id,
			status: 'not-tested',
			reason: file.notTested?.[id] ?? 'no case that tests it has an expected entry',
		}
	const results = covering.map((entry) => entry.criteria?.[id] as CaseCriterion)
	const statuses = results.map((r) => r.status)
	const status: Status = statuses.includes('fail')
		? 'fail'
		: statuses.includes('known-failure')
			? 'known-failure'
			: statuses.every((s) => s === 'not-run')
				? 'not-run'
				: 'pass'
	const criterion: CriterionResult = { id, status }
	if (results.some((r) => r.passed !== undefined)) {
		criterion.passed = sum(results.map((r) => r.passed))
		criterion.ran = sum(results.map((r) => r.ran))
	}
	if (results.every((r) => r.baseline))
		criterion.baseline = {
			passed: sum(results.map((r) => r.baseline?.passed)),
			ran: sum(results.map((r) => r.baseline?.ran)),
		}
	if (covering.every((entry) => entry.guard)) criterion.guard = true
	const dates = [...new Set(covering.map((entry) => entry.at))].sort()
	if (dates.length > 1) criterion.recorded = dates[0] as string
	if (covering.some((entry) => entry.carried)) criterion.carried = true
	return criterion
}

/**
 * An expected result laid out as a saved run's result, so every reader reads it as one: a version 1 file as it is, and a
 * per-case one with each case from its entry and each criterion computed from the entries that test it (R182). Its `at`
 * is when the file was last written. Undefined for anything else, such as a file that holds only attested passes.
 */
export function expectedView(value: unknown): TestResult | undefined {
	if (isExpectedFile(value)) {
		const file = value
		const entries = Object.entries(file.entries)
		const trigger: TriggerResult[] = entries.flatMap(([id, entry]) =>
			entry.prompt !== undefined && entry.expect
				? [
						{
							case: id,
							prompt: entry.prompt,
							expect: entry.expect,
							fired: entry.fired ?? 0,
							ran: entry.ran ?? 0,
							status: entry.status,
						},
					]
				: [],
		)
		const cases: CaseStatus[] = entries.map(([id, entry]) => ({
			case: id,
			status: entry.status,
			...(entry.passed !== undefined ? { passed: entry.passed } : {}),
			...(entry.ran !== undefined ? { ran: entry.ran } : {}),
			...(entry.sandboxFailed ? { sandboxFailed: entry.sandboxFailed } : {}),
			...(entry.guard ? { guard: true as const } : {}),
			...(entry.baseline ? { baseline: entry.baseline } : {}),
			...(entry.model && entry.model !== file.model ? { model: entry.model } : {}),
			...(entry.criteria ? { criteria: entry.criteria } : {}),
			...(entry.cost ? { cost: entry.cost } : {}),
			at: entry.at,
			...(entry.carried ? { carried: entry.carried } : {}),
		}))
		const known = entries.flatMap(([, entry]) => entry.knownFailures ?? [])
		const broken = entries.flatMap(([, entry]) => entry.sandboxFailures ?? [])
		const ids = [
			...file.criteria,
			...new Set(entries.flatMap(([, entry]) => Object.keys(entry.criteria ?? {}))),
		].filter((id, index, all) => all.indexOf(id) === index)
		return {
			version: 1,
			skill: file.skill,
			at: file.at,
			verification: file.verification,
			...(file.model ? { model: file.model } : {}),
			...(file.judge ? { judge: file.judge } : {}),
			runs: file.runs,
			threshold: file.threshold,
			baseline: file.baseline,
			trigger,
			criteria: ids.map((id) => criterionOf(id, file)),
			cases,
			...(known.length ? { knownFailures: known } : {}),
			notRun: [],
			...(broken.length ? { sandboxFailures: broken } : {}),
			...(typeof file.cost === 'number' ? { cost: file.cost } : {}),
			...(typeof file.totalRuns === 'number' ? { totalRuns: file.totalRuns } : {}),
			...(typeof file.durationMs === 'number' ? { durationMs: file.durationMs } : {}),
		}
	}
	const old = value as TestResult | undefined
	return typeof old?.at === 'string' ? old : undefined
}

/** The cases whose entries were carried forward, each with why (R183), in an expected result's view. */
export function carriedCases(view: TestResult): { case: string; carried: Carried }[] {
	return view.cases.flatMap((item) => (item.carried ? [{ case: item.case, carried: item.carried }] : []))
}

/** What each case's runs last cost, per arm, by case ID, from the entries that record it (#394). */
export function recordedCosts(file: ExpectedFile | undefined): Record<string, CaseCost> {
	return Object.fromEntries(
		Object.entries(file?.entries ?? {}).flatMap(([id, entry]) => (entry.cost ? [[id, entry.cost]] : [])),
	)
}
