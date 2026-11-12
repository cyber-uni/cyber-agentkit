import { spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { readSkill, type SkillFiles } from './skill-files.js'
import { copyPlugin, findSkillPlugin } from './skill-plugin.js'
import type { TestPlan } from './test-plan.js'
import { plannedRuns } from './test-progress.js'
import { readPromptfooOutput, type TestResult } from './test-result.js'

/**
 * `skill test` on Claude Code's own `claude plugin eval` (E-CC-H8). The plan becomes an eval suite in a copy of the
 * skill's plugin (or a plugin made for the skill), `claude plugin eval` runs it, and its JSON result (E-CC-H9) is
 * read into the same result a promptfoo run gives.
 */

/** The folder, below the plugin, that holds the suite, so a plugin's own `evals/` is left alone. */
export const pluginEvalDir = 'skill-test-evals'

/** The name of the plugin made for a skill that is not developed in one. */
const madePlugin = 'skill-test'

/** Runs `claude plugin eval` with these arguments and answers its JSON result, or why it could not. */
export type PluginEvalRun = (
	args: string[],
	output: string,
	progress?: ((line: string) => void) | undefined,
) => Promise<{ output: unknown } | { problem: string }>

/** `claude plugin eval` as a child process; its stderr lines go to `progress`. */
export const runPluginEval: PluginEvalRun = (args, output, progress) =>
	new Promise((done) => {
		const child = spawn('claude', ['plugin', 'eval', ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
		let tail: string[] = []
		let buffer = ''
		child.stderr.setEncoding('utf8')
		child.stderr.on('data', (chunk: string) => {
			buffer += chunk
			const lines = buffer.split('\n')
			buffer = lines.pop() ?? ''
			for (const line of lines.filter((l) => l.trim() !== '')) {
				progress?.(`claude plugin eval: ${line}`)
				tail = [...tail, line].slice(-3)
			}
		})
		child.on('error', (error) => done({ problem: error.message }))
		// It exits non-zero when a case scores below the threshold or a run errors; the JSON file is the answer either way.
		child.on('close', (code) => {
			if (existsSync(output)) return done({ output: JSON.parse(readFileSync(output, 'utf8')) })
			done({ problem: tail.join(' ') || `claude plugin eval exited ${code} and wrote no result` })
		})
	})

/** A check of `evals.yaml` as a grader, or `undefined` for one `claude plugin eval` cannot run (a `script`). */
export function checkGrader(check: Record<string, unknown>): Record<string, unknown> | undefined {
	const [kind, value] = Object.entries(check)[0] ?? []
	const literal = (text: unknown) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	switch (kind) {
		case 'contains':
			return { type: 'regex', pattern: literal(value) }
		case 'not-contains':
			return { type: 'regex', pattern: literal(value), match: 'not_contains' }
		case 'regex':
			return { type: 'regex', pattern: String(value) }
		case 'not-regex':
			return { type: 'regex', pattern: String(value), match: 'not_contains' }
		// `file_exists` sees only files the run created; a regex over the file passes for any file there at the end.
		case 'file-exists':
			return { type: 'regex', pattern: '^', target: { source: 'file', path: String(value) } }
		case 'file-contains': {
			const { path, text } = value as { path: string; text: string }
			return { type: 'regex', pattern: literal(text), target: { source: 'file', path } }
		}
		default:
			return undefined
	}
}

/** A grader's name: the criterion it decides, then `--<n>` or `--judge`. */
const safe = (id: string) => id.replace(/[^\w.-]/g, '_')
const graderName = (id: string, suffix: string) => `${safe(id)}--${suffix}`

/** Leaves out the criteria whose checks `claude plugin eval` cannot run, reporting them as not tested. */
export function pluginEvalPlan(plan: TestPlan): TestPlan {
	const unrunnable = new Set(
		plan.cases.flatMap((item) =>
			Object.entries(item.rubrics)
				.filter(([, list]) => list.some((check) => checkGrader(check) === undefined))
				.map(([id]) => id),
		),
	)
	if (!unrunnable.size) return plan
	const drop = <T>(record: Record<string, T>) =>
		Object.fromEntries(Object.entries(record).filter(([id]) => !unrunnable.has(id)))
	return {
		...plan,
		cases: plan.cases.map((item) => ({ ...item, rubrics: drop(item.rubrics), judged: drop(item.judged) })),
		notTested: [
			...plan.notTested,
			...[...unrunnable].map((id) => ({
				id,
				reason: 'its rubric runs a `script` check, and `claude plugin eval` has no custom-code graders',
			})),
		],
	}
}

/** The cases a suite holds: `claude plugin eval` refuses a case with no grader, so an outcome case with nothing to grade stays out, reported as not tested. */
function runnableCases(plan: TestPlan): TestPlan['cases'] {
	return plan.cases.filter(
		(item) => item.kind === 'trigger' || Object.keys(item.rubrics).length + Object.keys(item.judged).length > 0,
	)
}

const quote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`

/**
 * Writes the plan as a suite under `<plugin>/skill-test-evals/`: one `case.yaml` per case, tagged `trigger` or
 * `outcome`, with a scaffold script that copies the case's files and commits them in a new git repository, as a
 * promptfoo run's folder starts. A trigger case has one grader, `fired`, on the Skill tool; an outcome case has one
 * grader per check, named after its criterion.
 */
export function writePluginEvalSuite(plan: TestPlan, plugin: string, skillName: string, model?: string): void {
	const root = join(plugin, pluginEvalDir)
	rmSync(root, { recursive: true, force: true })
	for (const item of runnableCases(plan)) {
		const folder = join(root, item.id)
		mkdirSync(folder, { recursive: true })
		const script = ['#!/bin/bash', 'set -e']
		if (item.files) script.push(`cp -R ${quote(item.files)}/. .`)
		script.push(
			'git init -q',
			'git add -A',
			"git -c user.name=skill-test -c user.email=skill-test@example.invalid -c commit.gpgsign=false commit -q -m 'case files' --allow-empty",
		)
		writeFileSync(join(folder, 'setup.sh'), `${script.join('\n')}\n`, { mode: 0o755 })
		const graders: Record<string, unknown>[] = []
		if (item.kind === 'trigger')
			graders.push({
				name: 'fired',
				type: 'tool_used',
				tool: 'Skill',
				input_match: `"skill"\\s*:\\s*"(?:[\\w-]+:)?${skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`,
			})
		for (const [id, list] of Object.entries(item.rubrics))
			list.forEach((check, index) => {
				graders.push({ name: graderName(id, String(index + 1)), ...checkGrader(check) })
			})
		for (const [id, rubric] of Object.entries(item.judged))
			graders.push({ name: graderName(id, 'judge'), type: 'llm', criteria: rubric })
		const execution: Record<string, unknown> = {
			prompt: item.prompt,
			// A trigger case only needs to know which skill the request chose.
			max_turns: item.kind === 'trigger' ? 3 : 20,
			timeout_seconds: Math.min(plan.timeout, 3600),
			allowed_tools: ['Read', 'Glob', 'Grep', 'Skill', 'Write', 'Edit', 'Bash'],
			...(model ? { model } : {}),
		}
		const yaml = {
			schema_version: '1.1',
			name: item.id,
			tags: [item.kind],
			runs: plan.runs,
			context: { scaffold_script: 'setup.sh' },
			execution,
			graders,
		}
		writeFileSync(join(folder, 'case.yaml'), stringify(yaml))
	}
}

/** The fields of one run in a `claude plugin eval` result that `skill test` reads (E-CC-H9). */
type EvalRun = {
	error?: string | null
	costUsd?: number
	judgeCostUsd?: number
	graders?: { name: string; passed: boolean; explanation?: string }[]
}
type EvalCase = { name: string; arms?: { with?: EvalRun[]; without?: EvalRun[] } }

/**
 * Turns `claude plugin eval` runs into the rows `readPromptfooOutput` reads: each arm is `with-skill` or `baseline`,
 * each grader a component result under its criterion. A trigger run that ended at its turn cap but was graded is not
 * an error: ending there is its normal end.
 */
export function pluginEvalRows(output: unknown, plan: TestPlan, arms: { with?: string; without?: string }): unknown[] {
	const kinds = new Map(plan.cases.map((item) => [item.id, item.kind]))
	const criteria = new Map(plan.criteria.map((id) => [safe(id), id]))
	const rows: unknown[] = []
	for (const item of ((output as { cases?: EvalCase[] })?.cases ?? []) as EvalCase[]) {
		const kind = kinds.get(item.name)
		if (!kind) continue
		for (const [arm, label] of Object.entries(arms) as [keyof NonNullable<EvalCase['arms']>, string][]) {
			;(item.arms?.[arm] ?? []).forEach((run, index) => {
				const graders = run.graders ?? []
				const error = run.error && !(kind === 'trigger' && graders.length) ? run.error : undefined
				const parts = graders
					.filter((grader) => grader.name !== 'fired')
					.map((grader) => ({
						pass: grader.passed,
						reason: grader.explanation ?? '',
						assertion: { metric: criteria.get(grader.name.replace(/--[^-]+$/, '')) ?? grader.name },
					}))
				rows.push({
					provider: { label },
					testCase: { description: item.name },
					repeatIndex: index,
					cost: (run.costUsd ?? 0) + (run.judgeCostUsd ?? 0),
					response: {
						output: '',
						...(error ? { error } : {}),
						metadata: { fired: graders.some((grader) => grader.name === 'fired' && grader.passed) },
					},
					gradingResult: { componentResults: parts },
				})
			})
		}
	}
	return rows
}

export type PluginEvalTestOptions = {
	plan: TestPlan
	skill: SkillFiles
	skillName: string
	baselineFolder?: string | undefined
	model?: string | undefined
	judge?: string | undefined
	verification: string
	at: string
	run: PluginEvalRun
	progress?: ((line: string) => void) | undefined
}

/** A plugin holding just the skill, for a skill not developed in one. */
function makePlugin(target: string, skillName: string, skillFolder: string): void {
	mkdirSync(join(target, '.claude-plugin'), { recursive: true })
	writeFileSync(
		join(target, '.claude-plugin', 'plugin.json'),
		`${JSON.stringify({ name: madePlugin, version: '0.0.0' })}\n`,
	)
	cpSync(skillFolder, join(target, 'skills', skillName), { recursive: true })
}

/**
 * Runs a plan on `claude plugin eval` and reads the result. With no baseline named and no plugin the skill is
 * developed in, the baseline is the run's own no-plugin arm. Otherwise the baseline is a second suite run on a copy
 * of the plugin holding the baseline's version of the skill, or none of it (R91), with one arm each.
 */
export async function runPluginEvalTest(
	options: PluginEvalTestOptions,
): Promise<{ result: TestResult; warnings: string[] } | { problem: string }> {
	const warnings: string[] = []
	let baselineFolder = options.baselineFolder
	if (baselineFolder !== undefined && !readSkill(baselineFolder)) {
		warnings.push(`the baseline ${baselineFolder} holds no SKILL.md; results are reported without it`)
		baselineFolder = undefined
	}
	const plan = pluginEvalPlan(options.plan)
	const folder = mkdtempSync(join(tmpdir(), 'skill-test-'))
	try {
		const found = findSkillPlugin(options.skill.folder)
		const withSkill = join(folder, 'plugin-with')
		const baseline = join(folder, 'plugin-baseline')
		if (found) {
			copyPlugin(found.root, withSkill)
			copyPlugin(found.root, baseline, options.skill.folder, baselineFolder)
		} else {
			makePlugin(withSkill, options.skillName, options.skill.folder)
			if (baselineFolder) makePlugin(baseline, options.skillName, baselineFolder)
		}
		const dropped = options.baselineFolder !== undefined && baselineFolder === undefined
		// The run's own no-plugin arm is the baseline only when that is a run without the skill.
		const ownArm = !found && !baselineFolder && !dropped
		const baselineSuite = !ownArm && !dropped
		const common = (target: string, out: string) => [
			target,
			'--eval-dir',
			pluginEvalDir,
			'--trust-plugin',
			'--scaffold',
			'--no-publish',
			'--threshold',
			'0',
			'--runs',
			String(plan.runs),
			'--concurrency',
			String(Math.min(plan.concurrency, 8)),
			'--allow-tools',
			'Bash',
			'Write',
			'Edit',
			'--disallow-tools',
			'WebFetch',
			'WebSearch',
			'AskUserQuestion',
			...(options.model ? ['--model', options.model] : []),
			...(options.judge ? ['--judge-model', options.judge] : []),
			'--output-dir',
			join(folder, 'results'),
			'--json',
			out,
		]
		const kinds = new Set(runnableCases(plan).map((item) => item.kind))
		const rows: unknown[] = []
		const started = Date.now()
		const suite = async (
			target: string,
			tag: 'trigger' | 'outcome',
			ablation: string,
			arms: Record<string, string>,
		) => {
			writePluginEvalSuite(plan, target, options.skillName, options.model)
			const out = join(folder, `${tag}-${rows.length}.json`)
			const ran = await options.run(
				[...common(target, out), '--tag', tag, '--ablation', ablation],
				out,
				options.progress,
			)
			if ('problem' in ran) return ran.problem
			const result = ran.output as { partial?: boolean; partialReason?: string }
			if (result.partial) warnings.push(`claude plugin eval did not finish the ${tag} cases: ${result.partialReason}`)
			rows.push(...pluginEvalRows(ran.output, plan, arms))
			return undefined
		}
		const problems: (string | undefined)[] = []
		if (kinds.has('trigger')) problems.push(await suite(withSkill, 'trigger', 'none', { with: 'with-skill' }))
		if (kinds.has('outcome')) {
			problems.push(
				await suite(
					withSkill,
					'outcome',
					ownArm ? 'with-without' : 'none',
					ownArm ? { with: 'with-skill', without: 'baseline' } : { with: 'with-skill' },
				),
			)
			if (baselineSuite) problems.push(await suite(baseline, 'outcome', 'none', { with: 'baseline' }))
		}
		const problem = problems.find((item) => item !== undefined)
		if (problem) return { problem: `claude plugin eval did not run: ${problem}` }
		const result = readPromptfooOutput({ results: { results: rows } }, plan, {
			skill: options.skillName,
			at: options.at,
			verification: options.verification,
			baseline: baselineFolder
				? `the skill at ${baselineFolder}`
				: dropped
					? 'not run: the baseline folder holds no skill'
					: 'without the skill',
			baselineRan: !dropped,
		})
		return {
			result: {
				...result,
				durationMs: Date.now() - started,
				totalRuns: plannedRuns(plan),
			},
			warnings,
		}
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}
