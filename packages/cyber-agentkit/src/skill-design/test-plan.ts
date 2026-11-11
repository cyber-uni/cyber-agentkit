import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'
import { criteriaItems, type SkillFiles } from './skill-files.js'
import { type EvalsFile, evalsProblems } from './verification-checks.js'

export const defaultRuns = 3
export const defaultThreshold = 2

/** One case `skill test` hands to promptfoo. */
export type PlannedCase = {
	id: string
	kind: 'trigger' | 'outcome'
	prompt: string
	expect?: 'fire' | 'skip'
	/** The folder whose copy each run starts in. */
	files?: string
	/** For an outcome case: the criteria it tests that have a rubric, with the checks a run decides. */
	rubrics: Record<string, Record<string, unknown>[]>
	/** For an outcome case: the criteria whose rubric needs a judge. */
	judged: Record<string, string>
}

export type TestPlan = {
	runs: number
	threshold: number
	cases: PlannedCase[]
	/** Every criterion ID the skill lists, in order. */
	criteria: string[]
	/** Criteria reported as not tested before anything runs, with the reason. */
	notTested: { id: string; reason: string }[]
	/** Cases not run, with the reason. */
	notRun: { case: string; reason: string }[]
}

export type PlanResult = { plan: TestPlan } | { problem: string; code: 'no-cases' | 'evals-invalid' }

/** Reads `evals/evals.yaml` and decides what runs: which cases, which checks, and what is reported without a run. */
export function planTest(skill: SkillFiles, { judge }: { judge?: string | undefined } = {}): PlanResult {
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
	const criteria = items ? items.ids.filter((id): id is string => id !== undefined) : []
	const rubrics = evals.rubrics ?? {}
	const notTested: TestPlan['notTested'] = []
	if (!items)
		notTested.push({ id: '*', reason: 'the skill has no `## Done when`; run `/skill check` and `/skill fix`' })
	const outcomeCases = evals.outcome ?? []
	for (const id of criteria) {
		const testing = outcomeCases.filter((item) => (item.criteria ?? criteria).includes(id))
		const lists = [
			...(rubrics[id] ? [rubrics[id]] : []),
			...testing.flatMap((item) => (item.checks?.[id] ? [item.checks[id]] : [])),
		]
		const covered = !!rubrics[id] || (testing.length > 0 && testing.every((item) => item.checks?.[id]))
		if (!covered) notTested.push({ id, reason: 'it has no rubric; run `/skill fix`' })
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
			rubrics: {},
			judged: {},
		})
	})
	for (const item of evals.outcome ?? []) {
		if (item.effects === 'outside') {
			notRun.push({ case: item.id, reason: 'it has an outside effect the run cannot contain' })
			continue
		}
		const ids = (item.criteria ?? criteria).filter((id) => criteria.includes(id) && !untested.has(id))
		const planned: PlannedCase = { id: item.id, kind: 'outcome', prompt: item.prompt, rubrics: {}, judged: {} }
		if (item.files !== undefined) planned.files = resolve(skill.folder, 'evals', item.files)
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
	return {
		plan: {
			runs: evals.runs ?? defaultRuns,
			threshold: evals.threshold ?? defaultThreshold,
			cases,
			criteria,
			notTested,
			notRun,
		},
	}
}
