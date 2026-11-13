import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parse } from 'yaml'
import { type PlanResult, planEvals } from '../skill-design/test-plan.js'
import { type EvalsFile, evalsProblems } from '../skill-design/verification-checks.js'

/**
 * The cases file `instruction compare` runs: the format of a skill's `evals/evals.yaml` without `trigger` (an
 * instruction does not fire), plus `criteria`, the outcomes the wordings are measured on, by ID, since an instruction
 * has no `## Done when` to list them.
 */
export type InstructionCasesFile = Omit<EvalsFile, 'trigger'> & { criteria: Record<string, string> }

/** Where `instruction compare` looks for cases when none are named: `.agents/instruction-design/cases/<name>.yaml`. */
export function defaultCasesPath(base: string, name: string): string {
	return join(base, '.agents', 'instruction-design', 'cases', `${name}.yaml`)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value)

/** The problems with a cases file's value. */
export function casesProblems(value: unknown): string[] {
	if (!isRecord(value)) return ['it is not a mapping']
	const problems = evalsProblems(value)
	if (value['trigger'] !== undefined) problems.push('`trigger` has no place here: an instruction does not fire')
	const criteria = value['criteria']
	if (!isRecord(criteria) || !Object.keys(criteria).length)
		problems.push('`criteria` is not a mapping of criterion IDs to the outcome each one states')
	else
		for (const [id, statement] of Object.entries(criteria))
			if (typeof statement !== 'string' || !statement.trim()) problems.push(`criterion ${id} states no outcome`)
	const outcome = value['outcome']
	if (!Array.isArray(outcome) || !outcome.length) problems.push('`outcome` lists no case')
	if (isRecord(criteria) && Array.isArray(outcome)) {
		const known = new Set(Object.keys(criteria))
		for (const item of outcome) {
			if (!isRecord(item)) continue
			const named = [
				...(Array.isArray(item['criteria']) ? item['criteria'] : []),
				...(isRecord(item['checks']) ? Object.keys(item['checks']) : []),
			]
			for (const id of new Set(named))
				if (typeof id === 'string' && !known.has(id))
					problems.push(`outcome case ${String(item['id'])} names criterion ${id}, which \`criteria\` does not list`)
		}
		if (isRecord(value['rubrics']))
			for (const id of Object.keys(value['rubrics']))
				if (!known.has(id)) problems.push(`rubric ${id} is for a criterion \`criteria\` does not list`)
	}
	return problems
}

export type CasesRead =
	| { cases: InstructionCasesFile; path: string }
	| { code: 'no-cases' | 'cases-invalid'; problem: string }

/** Reads and checks a cases file. */
export function readCases(path: string, display: string = path): CasesRead {
	if (!existsSync(path)) return { code: 'no-cases', problem: `no cases file at ${display}` }
	let value: unknown
	try {
		value = parse(readFileSync(path, 'utf8'))
	} catch (error) {
		return {
			code: 'cases-invalid',
			problem: `${display} is not valid YAML: ${(error as Error).message.split('\n')[0]}`,
		}
	}
	const problems = casesProblems(value)
	if (problems.length) return { code: 'cases-invalid', problem: `${display}: ${problems.join('; ')}` }
	return { cases: value as InstructionCasesFile, path }
}

/** The plan for a cases file: its outcome cases, each criterion it lists, `runs` overridden when the author named one. */
export function planCases(
	read: { cases: InstructionCasesFile; path: string },
	options: { judge?: string | undefined; runs?: number | undefined; threads?: number | undefined; display: string },
): PlanResult {
	const { criteria, ...evals } = read.cases
	const planned = planEvals(evals, {
		criteria: Object.keys(criteria),
		noRubric: 'no case gives it a rubric; add one to the cases file',
		folder: dirname(read.path),
		file: options.display,
		judge: options.judge,
		threads: options.threads,
	})
	if ('problem' in planned || options.runs === undefined) return planned
	return { ...planned, plan: { ...planned.plan, runs: options.runs } }
}
