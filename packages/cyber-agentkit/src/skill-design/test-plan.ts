import { existsSync, readFileSync } from 'node:fs'
import { availableParallelism } from 'node:os'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'
import { criteriaItems, type SkillFiles } from './skill-files.js'
import { type EvalsFile, evalsProblems, failsProblems } from './verification-checks.js'

export const defaultRuns = 3
export const defaultThreshold = 2
/** Seconds one run may take before it is stopped. */
export const defaultTimeout = 300

/** One case `skill test` hands to promptfoo. */
export type PlannedCase = {
	id: string
	kind: 'trigger' | 'outcome'
	prompt: string
	expect?: 'fire' | 'skip'
	/**
	 * The model its runs use, over the test's (R161): the tier or model ID `evals.yaml` names, until `resolvePlanModels`
	 * turns a tier into the harness's model.
	 */
	model?: string
	/** The folder whose copy each run starts in. */
	files?: string
	/** For an outcome case: the setup script each run runs in its folder before the model starts (R155). */
	setup?: string
	/** For an outcome case: the hosts its runs may reach; none by default (R107). */
	network?: string[]
	/** For an outcome case: set when it is a regression guard, expected to pass without the skill too (R160). */
	guard?: true
	/** For an outcome case: the criteria it tests that have a rubric, with the checks a run decides. */
	rubrics: Record<string, Record<string, unknown>[]>
	/** For an outcome case: the criteria whose rubric needs a judge. */
	judged: Record<string, string>
	/**
	 * Marked known to fail (#329): for a trigger case, the reason; for an outcome case, each criterion marked, with its
	 * reason. A mark is judged at the same threshold: below it is a known failure, at or above it the mark is out of date.
	 */
	fails?: string | Record<string, string>
}

export type TestPlan = {
	/**
	 * The model every case runs on unless it names its own (R161), set by `resolvePlanModels`: the model passed to the
	 * harness, or `default` when the harness picks it. A plan not resolved leaves it out.
	 */
	model?: string
	runs: number
	threshold: number
	/** Seconds one run may take. */
	timeout: number
	/** Runs at once (R103). */
	concurrency: number
	/** Set when only the named cases run (R102): their IDs, in plan order. */
	only?: string[]
	cases: PlannedCase[]
	/** Every criterion ID the skill lists, in order. */
	criteria: string[]
	/** Criteria reported as not tested before anything runs, with the reason. */
	notTested: { id: string; reason: string }[]
	/** Cases the plan leaves out before running, with the reason: every one a planned skip (#327). */
	notRun: { case: string; reason: string; kind: 'skipped' }[]
}

export type PlanResult =
	| { plan: TestPlan; warnings: string[] }
	| { problem: string; code: 'no-cases' | 'evals-invalid' | 'unknown-case' }

/** The most runs that go at once (R103): the largest whole number strictly below half the hardware threads, and at least 1. */
export function concurrencyBound(threads: number): number {
	return Math.max(1, Math.ceil(threads / 2) - 1)
}

/** Reads `evals/evals.yaml` and decides what runs: which cases, which checks, and what is reported without a run. */
export function planTest(
	skill: SkillFiles,
	{
		judge,
		cases: only,
		threads = availableParallelism(),
	}: {
		judge?: string | undefined
		/** Run only the cases with these IDs (R102). */
		cases?: string[] | undefined
		/** The machine's hardware threads; tests set it. */
		threads?: number | undefined
	} = {},
): PlanResult {
	const path = join(skill.folder, 'evals', 'evals.yaml')
	if (!existsSync(path)) return { code: 'no-cases', problem: 'the skill has no evals/evals.yaml' }
	let value: unknown
	try {
		value = parse(readFileSync(path, 'utf8'))
	} catch (error) {
		return {
			code: 'evals-invalid',
			problem: `evals/evals.yaml is not valid YAML: ${(error as Error).message.split('\n')[0]}`,
		}
	}
	const problems = evalsProblems(value)
	if (problems.length) return { code: 'evals-invalid', problem: `evals/evals.yaml: ${problems.join('; ')}` }
	const evals = value as EvalsFile
	if (!evals.trigger?.length && !evals.outcome?.length)
		return { code: 'no-cases', problem: 'evals/evals.yaml lists no case' }

	const items = criteriaItems(skill)
	// A mark on a case with no `criteria` names one of the skill's criteria (#329).
	const marks = items
		? failsProblems(
				value,
				items.ids.filter((id): id is string => id !== undefined),
			)
		: []
	if (marks.length) return { code: 'evals-invalid', problem: `evals/evals.yaml: ${marks.join('; ')}` }
	return planEvals(evals, {
		criteria: items ? items.ids.filter((id): id is string => id !== undefined) : [],
		...(items ? {} : { noCriteria: 'the skill has no `## Done when`; run `/skill check` and `/skill fix`' }),
		folder: join(skill.folder, 'evals'),
		file: 'evals/evals.yaml',
		judge,
		cases: only,
		threads,
	})
}

/**
 * Decides what runs from cases already read and checked: which cases, which checks, and what is reported without a
 * run. `skill test` reads them from a skill's `evals/evals.yaml`; `instruction compare` from its cases file.
 */
export function planEvals(
	evals: EvalsFile,
	{
		criteria,
		noCriteria,
		noRubric = 'it has no rubric; run `/skill fix`',
		folder,
		file,
		judge,
		cases: only,
		threads = availableParallelism(),
	}: {
		/** Every criterion ID, in order. */
		criteria: string[]
		/** Set when there are no criteria to test: why, reported against every criterion. */
		noCriteria?: string | undefined
		/** Why a criterion with no rubric is not tested. */
		noRubric?: string | undefined
		/** The folder a case's `files` is relative to. */
		folder: string
		/** The cases file, as messages name it. */
		file: string
		judge?: string | undefined
		cases?: string[] | undefined
		threads?: number | undefined
	},
): PlanResult {
	const rubrics = evals.rubrics ?? {}
	const notTested: TestPlan['notTested'] = []
	if (noCriteria !== undefined) notTested.push({ id: '*', reason: noCriteria })
	const outcomeCases = evals.outcome ?? []
	for (const id of criteria) {
		const testing = outcomeCases.filter((item) => (item.criteria ?? criteria).includes(id))
		const lists = [
			...(rubrics[id] ? [rubrics[id]] : []),
			...testing.flatMap((item) => (item.checks?.[id] ? [item.checks[id]] : [])),
		]
		const covered = !!rubrics[id] || (testing.length > 0 && testing.every((item) => item.checks?.[id]))
		if (!covered) notTested.push({ id, reason: noRubric })
		else if (!judge && lists.some((list) => list.some((check) => 'judge' in check)))
			notTested.push({ id, reason: 'its rubric needs a judge, and none was named' })
	}
	const untested = new Set(notTested.map(({ id }) => id))

	const cases: PlannedCase[] = []
	const notRun: TestPlan['notRun'] = []
	;(evals.trigger ?? []).forEach((item, index) => {
		cases.push({
			id: `trigger-${index + 1}`,
			kind: 'trigger',
			prompt: item.prompt,
			expect: item.expect,
			...(item.model ? { model: item.model } : {}),
			...(item.fails !== undefined ? { fails: item.fails } : {}),
			rubrics: {},
			judged: {},
		})
	})
	for (const item of evals.outcome ?? []) {
		if (item.effects === 'outside') {
			notRun.push({ case: item.id, reason: 'it has an outside effect the run cannot contain', kind: 'skipped' })
			continue
		}
		const ids = (item.criteria ?? criteria).filter((id) => criteria.includes(id) && !untested.has(id))
		const planned: PlannedCase = { id: item.id, kind: 'outcome', prompt: item.prompt, rubrics: {}, judged: {} }
		if (item.model) planned.model = item.model
		if (item.files !== undefined) planned.files = resolve(folder, item.files)
		if (item.setup !== undefined) planned.setup = resolve(folder, item.setup)
		if (item.network?.length) planned.network = item.network
		if (item.guard) planned.guard = true
		if (item.fails && Object.keys(item.fails).length) planned.fails = item.fails
		for (const id of ids) {
			const list = item.checks?.[id] ?? rubrics[id]
			if (!list) continue
			const decided = list.filter((check) => !('judge' in check))
			const judged = list.find((check) => 'judge' in check)
			if (decided.length) planned.rubrics[id] = decided
			if (judged) planned.judged[id] = String(judged['judge'])
		}
		cases.push(planned)
	}
	const warnings: string[] = []
	const bound = concurrencyBound(threads)
	let concurrency = bound
	if (evals.concurrency !== undefined) {
		if (evals.concurrency > bound)
			warnings.push(
				`${file.split('/').pop()} asks for ${evals.concurrency} runs at once; running ${bound}, fewer than half of the ${threads} hardware threads`,
			)
		else concurrency = evals.concurrency
	}
	let chosen = cases
	let skipped = notRun
	if (only?.length) {
		const known = new Set([...cases.map((item) => item.id), ...notRun.map((item) => item.case)])
		const unknown = [...new Set(only)].filter((id) => !known.has(id))
		if (unknown.length)
			return {
				code: 'unknown-case',
				problem: `no case ${unknown.join(', ')} in ${file}; the cases are ${[...known].join(', ')}`,
			}
		chosen = cases.filter((item) => only.includes(item.id))
		skipped = notRun.filter((item) => only.includes(item.case))
	}
	return {
		plan: {
			runs: evals.runs ?? defaultRuns,
			threshold: evals.threshold ?? defaultThreshold,
			timeout: evals.timeout ?? defaultTimeout,
			concurrency,
			...(only?.length ? { only: [...chosen.map((item) => item.id), ...skipped.map((item) => item.case)] } : {}),
			cases: chosen,
			criteria,
			notTested,
			notRun: skipped,
		},
		warnings,
	}
}

/** A script a case runs: its setup script (`setup`, a path) or a `script` check (`check`, a command). */
export type CaseScript = { case: string; kind: 'setup' | 'check'; script: string }

/** Every setup script and `script` check the plan's cases run, in plan order (R158). */
export function planScripts(plan: TestPlan): CaseScript[] {
	return plan.cases.flatMap((item) => [
		...(item.setup ? [{ case: item.id, kind: 'setup' as const, script: item.setup }] : []),
		...[
			...new Set(
				Object.values(item.rubrics).flatMap((list) =>
					list.flatMap((check) => ('script' in check ? [String(check['script'])] : [])),
				),
			),
		].map((script) => ({ case: item.id, kind: 'check' as const, script })),
	])
}

/** The plan with every case that runs a script moved to the cases not run, with the reason (R158). */
export function withoutScripts(plan: TestPlan, reason: string): TestPlan {
	const scripted = new Set(planScripts(plan).map((item) => item.case))
	if (!scripted.size) return plan
	return {
		...plan,
		cases: plan.cases.filter((item) => !scripted.has(item.id)),
		notRun: [...plan.notRun, ...[...scripted].map((id) => ({ case: id, reason, kind: 'skipped' as const }))],
	}
}
