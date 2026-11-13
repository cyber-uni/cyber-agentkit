import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { promptfooConfig } from '../skill-design/promptfoo-config.js'
import { promptfooHookSource, promptfooProviderSource } from '../skill-design/promptfoo-provider-source.js'
import { type PromptfooRun, pruneHistory, setupProblem, stem } from '../skill-design/skill-test.js'
import { type SkillTestHarness, skillTestHarness } from '../skill-design/skill-test-harness.js'
import type { TestPlan } from '../skill-design/test-plan.js'
import { type ProgressWatch, plannedRuns, watchProgress } from '../skill-design/test-progress.js'
import {
	type Failure,
	type Reply,
	readPromptfooOutput,
	readReplies,
	type Status,
	type TestResult,
} from '../skill-design/test-result.js'
import { textHash, type Wording } from './wording.js'

/** The two arms of a comparison, in the order the author named the wordings. */
export const armLabels = ['A', 'B'] as const
export type ArmLabel = (typeof armLabels)[number]

/** One arm's count for a criterion: its runs that met it, of those that ran, against the threshold. */
export type ArmCount = { passed: number; ran: number; status: Status }

export type CompareCriterion = {
	id: string
	/** The outcome the criterion states, from the cases file. */
	statement: string
	/** `not-tested` (with a `reason`) when no run could decide it; else `tested`. */
	status: 'tested' | 'not-tested'
	reason?: string
	A?: ArmCount
	B?: ArmCount
	/** The arm whose pass rate is higher, or `tie`; absent when not tested or when an arm made no run. */
	winner?: ArmLabel | 'tie'
	failures?: { A?: Failure[]; B?: Failure[] }
}

/** What a run tried that its containment refused, with the arm that tried it. */
export type CompareBlocked = { case: string; arm: ArmLabel; run: number; what: string; target: string }

/** The saved result of `instruction compare`, kept as a `skill test` result is (`compare.md`). */
export type CompareResult = {
	version: 1
	/** The name its cases and results go under. */
	instruction: string
	at: string
	verification: string
	runs: number
	threshold: number
	/** The cases file, as the author named it or as found by default. */
	cases: string
	/** Each wording as named, with the hash of the text its runs loaded. */
	wordings: Record<ArmLabel, { source: string; sha256: string }>
	criteria: CompareCriterion[]
	/** Each case's status in each arm: it passes when every criterion it tests meets the threshold there. */
	caseStatus: { case: string; A: Status; B: Status }[]
	/** The arm that won more criteria, or `tie`; `none` when no criterion was decided in both arms. */
	winner: ArmLabel | 'tie' | 'none'
	/** Criteria won by each arm, and tied. */
	score: { A: number; B: number; tie: number }
	notRun: { case: string; reason: string }[]
	blocked?: CompareBlocked[]
	cost?: number
	durationMs?: number
	totalRuns?: number
	/** The file beside this result holding the reply of every run, in both arms. */
	replies?: string
	evalId?: string
}

const rate = (count: ArmCount) => count.passed / count.ran

/** The arm with the higher pass rate, or `tie`; none when either arm made no run. */
function criterionWinner(a: ArmCount, b: ArmCount): ArmLabel | 'tie' | undefined {
	if (!a.ran || !b.ran) return undefined
	if (rate(a) === rate(b)) return 'tie'
	return rate(a) > rate(b) ? 'A' : 'B'
}

/**
 * Turns promptfoo's output into the comparison, reading each arm as `skill test` reads its arm with the skill, so a
 * criterion counts, passes, and fails the same way in both.
 */
export function readCompareOutput(
	output: unknown,
	plan: TestPlan,
	meta: {
		instruction: string
		at: string
		verification: string
		cases: string
		statements: Record<string, string>
		wordings: Record<ArmLabel, Wording>
	},
): CompareResult {
	const read = (main: ArmLabel, other: ArmLabel): TestResult =>
		readPromptfooOutput(output, plan, {
			skill: meta.instruction,
			at: meta.at,
			verification: meta.verification,
			baseline: other,
			baselineRan: false,
			arms: { main, other },
		})
	const a = read('A', 'B')
	const b = read('B', 'A')
	const score = { A: 0, B: 0, tie: 0 }
	const criteria: CompareCriterion[] = a.criteria.map((itemA) => {
		const itemB = b.criteria.find((item) => item.id === itemA.id)
		const statement = meta.statements[itemA.id] ?? ''
		if (itemA.status === 'not-tested')
			return { id: itemA.id, statement, status: 'not-tested', reason: itemA.reason ?? 'not tested' }
		const countA: ArmCount = { passed: itemA.passed ?? 0, ran: itemA.ran ?? 0, status: itemA.status }
		const countB: ArmCount = { passed: itemB?.passed ?? 0, ran: itemB?.ran ?? 0, status: itemB?.status ?? 'not-run' }
		const winner = criterionWinner(countA, countB)
		if (winner) score[winner === 'tie' ? 'tie' : winner]++
		const failures = {
			...(itemA.failures?.length ? { A: itemA.failures } : {}),
			...(itemB?.failures?.length ? { B: itemB.failures } : {}),
		}
		return {
			id: itemA.id,
			statement,
			status: 'tested',
			A: countA,
			B: countB,
			...(winner ? { winner } : {}),
			...(Object.keys(failures).length ? { failures } : {}),
		}
	})
	const decided = score.A + score.B + score.tie
	const winner: CompareResult['winner'] = !decided
		? 'none'
		: score.A === score.B
			? 'tie'
			: score.A > score.B
				? 'A'
				: 'B'
	const statusIn = (result: TestResult, id: string): Status =>
		result.cases.find((item) => item.case === id)?.status ?? 'not-run'
	const caseStatus = a.cases.map((item) => ({ case: item.case, A: item.status, B: statusIn(b, item.case) }))
	const rows = ((output as { results?: { results?: unknown[] } })?.results?.results ?? []) as {
		provider?: { label?: string }
		testCase?: { description?: string }
		repeatIndex?: number
		response?: { metadata?: { blocked?: { what: string; target: string }[] } }
	}[]
	const blocked: CompareBlocked[] = rows.flatMap((row) =>
		(row.response?.metadata?.blocked ?? []).map((item) => ({
			case: row.testCase?.description ?? '?',
			arm: (row.provider?.label === 'B' ? 'B' : 'A') as ArmLabel,
			run: (row.repeatIndex ?? 0) + 1,
			what: item.what,
			target: item.target,
		})),
	)
	return {
		version: 1,
		instruction: meta.instruction,
		at: meta.at,
		verification: meta.verification,
		runs: plan.runs,
		threshold: plan.threshold,
		cases: meta.cases,
		wordings: {
			A: { source: meta.wordings.A.source, sha256: textHash(meta.wordings.A.text) },
			B: { source: meta.wordings.B.source, sha256: textHash(meta.wordings.B.text) },
		},
		criteria,
		caseStatus,
		winner,
		score,
		notRun: a.notRun,
		...(blocked.length ? { blocked } : {}),
		...(a.cost ? { cost: a.cost } : {}),
	}
}

export type CompareOptions = {
	plan: TestPlan
	instruction: string
	cases: string
	statements: Record<string, string>
	wordings: Record<ArmLabel, Wording>
	model?: string | undefined
	judge?: string | undefined
	verification: string
	at: string
	run: PromptfooRun
	/** The harness each run drives; Claude Code when absent. */
	harness?: SkillTestHarness | undefined
	progress?: Pick<ProgressWatch, 'write' | 'heartbeatMs' | 'pollMs' | 'now'> | undefined
}

/** Runs each case with each wording loaded as the harness's project instruction file, on promptfoo, and reads the comparison. */
export async function runCompare(
	options: CompareOptions,
): Promise<
	{ result: CompareResult; replies: Reply[]; warnings: string[] } | { problem: string; code?: 'login' | 'sandbox' }
> {
	const warnings: string[] = []
	if (options.wordings.A.text === options.wordings.B.text)
		warnings.push('the two wordings are the same text; any difference between them is noise')
	const folder = mkdtempSync(join(tmpdir(), 'instruction-compare-'))
	try {
		writeFileSync(join(folder, 'provider.mjs'), promptfooProviderSource)
		writeFileSync(join(folder, 'progress-hook.mjs'), promptfooHookSource)
		const progressFile = join(folder, 'progress.jsonl')
		const harness = options.harness ?? (skillTestHarness('claude-code') as SkillTestHarness)
		if (harness.leaks) warnings.push(`each ${harness.id} run still reads ${harness.leaks}`)
		if (!harness.isolation.containment)
			warnings.push(
				`instruction compare does not contain ${harness.id} runs: a run may read outside its folder, a case's \`network\` list does not apply, and the result lists nothing as blocked`,
			)
		const config = promptfooConfig(options.plan, {
			harness,
			skillName: options.instruction,
			skillFolder: '',
			arms: armLabels.map((label) => ({ label, arm: label, instruction: options.wordings[label].text })),
			description: `instruction compare: ${options.instruction}`,
			model: options.model,
			judge: options.judge,
			provider: './provider.mjs',
			progress: { file: progressFile, hook: './progress-hook.mjs' },
		})
		writeFileSync(join(folder, 'promptfooconfig.yaml'), stringify(config))
		const started = Date.now()
		const watch = options.progress
			? watchProgress({ ...options.progress, file: progressFile, total: plannedRuns(options.plan) })
			: undefined
		let ran: Awaited<ReturnType<PromptfooRun>>
		try {
			ran = await options.run(folder, 'promptfooconfig.yaml', 'output.json')
		} finally {
			watch?.stop()
		}
		const durationMs = Date.now() - started
		if ('problem' in ran) return { problem: `promptfoo did not run: ${ran.problem}` }
		const setup = setupProblem(ran.output)
		if (setup) return setup
		const result = readCompareOutput(ran.output, options.plan, options)
		const evalId = (ran.output as { evalId?: unknown } | undefined)?.evalId
		return {
			result: {
				...result,
				durationMs,
				totalRuns: plannedRuns(options.plan),
				...(typeof evalId === 'string' && evalId ? { evalId } : {}),
			},
			replies: readReplies(ran.output, (label) => label ?? '?'),
			warnings,
		}
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}

/** Where a comparison's results live: `.agents/instruction-design/results/<name>/` under the repository root, or home. */
export function compareResultsFolder(base: string, name: string): string {
	return join(base, '.agents', 'instruction-design', 'results', name)
}

/**
 * Saves the result as `skill test` saves its own: `latest.json`, the previous one moved beside it as `<its at>.json`,
 * the 5 most recent past results kept, every run's reply in `<its at>.replies.json`, and the results folder ignored by git.
 */
export function saveCompare(folder: string, result: CompareResult, replies?: Reply[]): CompareResult {
	mkdirSync(folder, { recursive: true })
	const ignore = join(folder, '..', '.gitignore')
	if (!existsSync(ignore)) writeFileSync(ignore, '*\n')
	const latest = join(folder, 'latest.json')
	if (existsSync(latest)) {
		const previous = JSON.parse(readFileSync(latest, 'utf8')) as { at: string }
		renameSync(latest, join(folder, `${stem(previous.at)}.json`))
	}
	const saved: CompareResult = { ...result }
	if (replies) {
		saved.replies = `${stem(result.at)}.replies.json`
		writeFileSync(join(folder, saved.replies), `${JSON.stringify(replies, null, '\t')}\n`)
	}
	writeFileSync(latest, `${JSON.stringify(saved, null, '\t')}\n`)
	pruneHistory(folder)
	return saved
}

/** The last saved comparison under a name, if there is one. */
export function readLatestCompare(folder: string): CompareResult | undefined {
	try {
		return JSON.parse(readFileSync(join(folder, 'latest.json'), 'utf8')) as CompareResult
	} catch {
		return undefined
	}
}

/** The line written before the first run: how many runs, and about how long and how much the last comparison took. */
export function comparePlanLine(
	plan: TestPlan,
	last?: Pick<CompareResult, 'durationMs' | 'cost' | 'totalRuns'> | undefined,
): string {
	const total = plannedRuns(plan)
	let line = `instruction compare: ${total} runs (${plan.cases.length} cases × ${plan.runs} runs × 2 wordings); ${plan.concurrency} at once`
	const before: string[] = []
	if (last?.durationMs) {
		const minutes = last.durationMs / 60_000
		before.push(minutes < 1 ? `${Math.max(1, Math.round(last.durationMs / 1000))} s` : `${Math.round(minutes)} min`)
	}
	if (last?.cost) before.push(`$${last.cost.toFixed(2)}`)
	if (before.length)
		line +=
			last?.totalRuns === total
				? `; last time about ${before.join(', ')}`
				: `; last time ${last?.totalRuns ?? 'an unknown number of'} runs took about ${before.join(', ')}`
	return line
}
