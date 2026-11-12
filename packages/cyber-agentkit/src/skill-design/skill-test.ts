import { execFile } from 'node:child_process'
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { stringify } from 'yaml'
import { promptfooConfig, promptfooPackages } from './promptfoo-config.js'
import { promptfooHookSource, promptfooProviderSource } from './promptfoo-provider-source.js'
import { readSkill, type SkillFiles } from './skill-files.js'
import { copyPlugin, findSkillPlugin } from './skill-plugin.js'
import { type SkillTestHarness, skillTestHarness } from './skill-test-harness.js'
import type { TestPlan } from './test-plan.js'
import { type ProgressWatch, plannedRuns, watchProgress } from './test-progress.js'
import { compareWithPrevious, type Reply, readPromptfooOutput, readReplies, type TestResult } from './test-result.js'

/** Runs promptfoo on a config in a folder and answers its output JSON, or why it could not. */
export type PromptfooRun = (
	folder: string,
	config: string,
	output: string,
) => Promise<{ output: unknown } | { problem: string }>

/** promptfoo through pinned npx, with its telemetry and update check off. */
export const runPromptfoo: PromptfooRun = (folder, config, output) =>
	new Promise((done) => {
		const args = ['-y', ...promptfooPackages.flatMap((name) => ['-p', name]), 'promptfoo', 'eval', '-c', config]
		args.push('--output', output, '--no-cache', '--no-progress-bar')
		execFile(
			process.platform === 'win32' ? 'npx.cmd' : 'npx',
			args,
			{
				cwd: folder,
				timeout: 60 * 60_000,
				maxBuffer: 64 * 1024 * 1024,
				env: { ...process.env, PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_UPDATE: '1' },
			},
			(error, _stdout, stderr) => {
				// promptfoo exits non-zero when an assertion fails; the output file is the answer either way.
				const path = join(folder, output)
				if (existsSync(path)) return done({ output: JSON.parse(readFileSync(path, 'utf8')) })
				done({
					problem: (stderr || error?.message || 'promptfoo wrote no output').trim().split('\n').slice(-3).join(' '),
				})
			},
		)
	})

export type TestOptions = {
	plan: TestPlan
	skill: SkillFiles
	skillName: string
	baselineFolder?: string | undefined
	model?: string | undefined
	judge?: string | undefined
	verification: string
	at: string
	run: PromptfooRun
	/** The harness each run drives; Claude Code when absent. */
	harness?: SkillTestHarness | undefined
	/** Where progress lines go while promptfoo runs (R98, R99); without it the run reports none. */
	progress?: Pick<ProgressWatch, 'write' | 'heartbeatMs' | 'pollMs' | 'now'> | undefined
}

/** Runs a plan and reads the result; the baseline falls back to a run without the skill when its folder holds no skill (R35). */
export async function runTest(
	options: TestOptions,
): Promise<{ result: TestResult; replies: Reply[]; warnings: string[] } | { problem: string }> {
	const warnings: string[] = []
	let baselineFolder = options.baselineFolder
	if (baselineFolder !== undefined && !readSkill(baselineFolder)) {
		warnings.push(`the baseline ${baselineFolder} holds no SKILL.md; results are reported without it`)
		baselineFolder = undefined
	}
	const folder = mkdtempSync(join(tmpdir(), 'skill-test-'))
	try {
		writeFileSync(join(folder, 'provider.mjs'), promptfooProviderSource)
		writeFileSync(join(folder, 'progress-hook.mjs'), promptfooHookSource)
		const progressFile = join(folder, 'progress.jsonl')
		// A skill developed in a plugin runs inside a copy of that plugin, with its references and other skills (R91).
		const found = findSkillPlugin(options.skill.folder)
		let plugin: { name: string; withSkill: string; baseline: string } | undefined
		if (found) {
			plugin = { name: found.name, withSkill: join(folder, 'plugin-with'), baseline: join(folder, 'plugin-baseline') }
			copyPlugin(found.root, plugin.withSkill)
			copyPlugin(found.root, plugin.baseline, options.skill.folder, baselineFolder)
		}
		const harness = options.harness ?? (skillTestHarness('claude-code') as SkillTestHarness)
		if (harness.leaks) warnings.push(`each ${harness.id} run still reads ${harness.leaks}`)
		if (found && !harness.isolation.pluginFlag)
			warnings.push(
				`${harness.id} has no flag to load a local plugin, so each run gets the skills of ${found.name} as project skills, without its references`,
			)
		const config = promptfooConfig(options.plan, {
			harness,
			plugin,
			skillName: options.skillName,
			skillFolder: options.skill.folder,
			baselineFolder,
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
		const dropped = options.baselineFolder !== undefined && baselineFolder === undefined
		const result = readPromptfooOutput(ran.output, options.plan, {
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
		const evalId = (ran.output as { evalId?: unknown } | undefined)?.evalId
		return {
			result: {
				...result,
				durationMs,
				totalRuns: plannedRuns(options.plan),
				...(typeof evalId === 'string' && evalId ? { evalId } : {}),
			},
			replies: readReplies(ran.output),
			warnings,
		}
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}

/** Where a skill's results live: `.agents/skill-design/results/<skill>/` under the repository root, or the home folder. */
export function resultsFolder(base: string, skill: string): string {
	return join(base, '.agents', 'skill-design', 'results', skill)
}

/** The skill's expected result, written by an author's `--accept`, or by the first run that passes when there is none (R80). */
export function expectedPath(skillFolder: string): string {
	return join(skillFolder, 'evals', 'expected.json')
}

/** The file name a result saved at `at` is kept under once a newer one replaces it. */
function stem(at: string): string {
	return at.replace(/[:]/g, '-')
}

/**
 * Saves the result as `latest.json`, moving the previous one beside it as `<its at>.json`, and adds the cases that
 * changed since the skill's expected result, else the previous one. Every run's reply goes beside it in
 * `<its at>.replies.json`, which the result names (R138).
 */
export function saveResult(folder: string, result: TestResult, skillFolder: string, replies?: Reply[]): TestResult {
	mkdirSync(folder, { recursive: true })
	// Each run's result stays local: the results folder ignores itself.
	const ignore = join(folder, '..', '.gitignore')
	if (!existsSync(ignore)) writeFileSync(ignore, '*\n')
	const latest = join(folder, 'latest.json')
	let previous: TestResult | undefined
	if (existsSync(latest)) {
		previous = JSON.parse(readFileSync(latest, 'utf8')) as TestResult
		renameSync(latest, join(folder, `${stem(previous.at)}.json`))
	}
	const expected = existsSync(expectedPath(skillFolder))
		? (JSON.parse(readFileSync(expectedPath(skillFolder), 'utf8')) as TestResult)
		: undefined
	const compared = expected
		? compareWithPrevious(result, expected, 'expected')
		: compareWithPrevious(result, previous, 'previous')
	const saved: TestResult = { ...compared, folder: skillFolder }
	if (replies) {
		saved.replies = `${stem(result.at)}.replies.json`
		writeFileSync(join(folder, saved.replies), `${JSON.stringify(replies, null, '\t')}\n`)
	}
	writeFileSync(latest, `${JSON.stringify(saved, null, '\t')}\n`)
	pruneHistory(folder)
	removeVanished(join(folder, '..'), basename(folder))
	return saved
}

/** How many past results (`<at>.json`) a skill keeps beside `latest.json`. */
export const keptPastResults = 5

/** Deletes all but the most recent past results of one skill, and the replies of every result it no longer keeps. */
function pruneHistory(folder: string): void {
	const names = readdirSync(folder)
	const past = names
		.filter((name) => name.endsWith('.json') && !name.endsWith('.replies.json') && name !== 'latest.json')
		.sort()
	const dropped = past.slice(0, Math.max(0, past.length - keptPastResults))
	for (const name of dropped) rmSync(join(folder, name), { force: true })
	const kept = new Set(past.slice(dropped.length).map((name) => name.slice(0, -'.json'.length)))
	const latest = readLatest(folder)
	if (latest?.at) kept.add(stem(latest.at))
	for (const name of names)
		if (name.endsWith('.replies.json') && !kept.has(name.slice(0, -'.replies.json'.length)))
			rmSync(join(folder, name), { force: true })
}

/**
 * Deletes the results folder of every other skill whose `latest.json` names a skill folder that no longer exists.
 * A folder whose `latest.json` is missing, unparsable, or has no `folder` is left alone.
 */
function removeVanished(resultsRoot: string, current: string): void {
	for (const entry of readdirSync(resultsRoot, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name === current) continue
		try {
			const latest = JSON.parse(readFileSync(join(resultsRoot, entry.name, 'latest.json'), 'utf8')) as {
				folder?: unknown
			}
			if (typeof latest.folder === 'string' && latest.folder !== '' && !existsSync(latest.folder))
				rmSync(join(resultsRoot, entry.name), { recursive: true, force: true })
		} catch {
			// unreadable: leave it alone
		}
	}
}

/**
 * Writes a saved result as the skill's expected result, the same shape as `latest.json`. It leaves out `folder`: the
 * file is committed, and an absolute path names the author's machine. It leaves out `replies` and `evalId` too: they
 * point at files and a database on that machine alone.
 */
export function acceptResult(result: TestResult, skillFolder: string): string {
	const path = expectedPath(skillFolder)
	mkdirSync(join(skillFolder, 'evals'), { recursive: true })
	const { folder: _folder, replies: _replies, evalId: _evalId, ...shared } = result
	writeFileSync(path, `${JSON.stringify(shared, null, '\t')}\n`)
	return path
}

/** The last saved result of a skill, if there is one. */
export function readLatest(folder: string): TestResult | undefined {
	const latest = join(folder, 'latest.json')
	return existsSync(latest) ? (JSON.parse(readFileSync(latest, 'utf8')) as TestResult) : undefined
}

/** The result a new run is measured against for the plan line (R97): the latest saved one, else the skill's expected result. */
export function lastResult(folder: string, skillFolder: string): TestResult | undefined {
	const latest = readLatest(folder)
	if (latest) return latest
	try {
		return JSON.parse(readFileSync(expectedPath(skillFolder), 'utf8')) as TestResult
	} catch {
		return undefined
	}
}
