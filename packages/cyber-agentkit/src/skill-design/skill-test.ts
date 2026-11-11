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
import { promptfooProviderSource } from './promptfoo-provider-source.js'
import { readSkill, type SkillFiles } from './skill-files.js'
import type { TestPlan } from './test-plan.js'
import { compareWithPrevious, readPromptfooOutput, type TestResult } from './test-result.js'

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
}

/** Runs a plan and reads the result; the baseline falls back to a run without the skill when its folder holds no skill (R35). */
export async function runTest(
	options: TestOptions,
): Promise<{ result: TestResult; warnings: string[] } | { problem: string }> {
	const warnings: string[] = []
	let baselineFolder = options.baselineFolder
	if (baselineFolder !== undefined && !readSkill(baselineFolder)) {
		warnings.push(`the baseline ${baselineFolder} holds no SKILL.md; results are reported without it`)
		baselineFolder = undefined
	}
	const folder = mkdtempSync(join(tmpdir(), 'skill-test-'))
	try {
		writeFileSync(join(folder, 'provider.mjs'), promptfooProviderSource)
		const config = promptfooConfig(options.plan, {
			skillName: options.skillName,
			skillFolder: options.skill.folder,
			baselineFolder,
			model: options.model,
			judge: options.judge,
			provider: './provider.mjs',
		})
		writeFileSync(join(folder, 'promptfooconfig.yaml'), stringify(config))
		const ran = await options.run(folder, 'promptfooconfig.yaml', 'output.json')
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
		return { result, warnings }
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}

/** Where a skill's results live: `.agents/skill-design/results/<skill>/` under the repository root, or the home folder. */
export function resultsFolder(base: string, skill: string): string {
	return join(base, '.agents', 'skill-design', 'results', skill)
}

/** The skill's expected result, which only an author's `--accept` writes (R80). */
export function expectedPath(skillFolder: string): string {
	return join(skillFolder, 'evals', 'expected.json')
}

/** Saves the result as `latest.json`, moving the previous one beside it as `<its at>.json`, and adds the cases that changed since the skill's expected result, else the previous one. */
export function saveResult(folder: string, result: TestResult, skillFolder: string): TestResult {
	mkdirSync(folder, { recursive: true })
	// Each run's result stays local: the results folder ignores itself.
	const ignore = join(folder, '..', '.gitignore')
	if (!existsSync(ignore)) writeFileSync(ignore, '*\n')
	const latest = join(folder, 'latest.json')
	let previous: TestResult | undefined
	if (existsSync(latest)) {
		previous = JSON.parse(readFileSync(latest, 'utf8')) as TestResult
		renameSync(latest, join(folder, `${previous.at.replace(/[:]/g, '-')}.json`))
	}
	const expected = existsSync(expectedPath(skillFolder))
		? (JSON.parse(readFileSync(expectedPath(skillFolder), 'utf8')) as TestResult)
		: undefined
	const compared = expected
		? compareWithPrevious(result, expected, 'expected')
		: compareWithPrevious(result, previous, 'previous')
	const saved: TestResult = { ...compared, folder: skillFolder }
	writeFileSync(latest, `${JSON.stringify(saved, null, '\t')}\n`)
	pruneHistory(folder)
	removeVanished(join(folder, '..'), basename(folder))
	return saved
}

/** How many past results (`<at>.json`) a skill keeps beside `latest.json`. */
export const keptPastResults = 5

/** Deletes all but the most recent past results of one skill. */
function pruneHistory(folder: string): void {
	const past = readdirSync(folder)
		.filter((name) => name.endsWith('.json') && name !== 'latest.json')
		.sort()
	for (const name of past.slice(0, Math.max(0, past.length - keptPastResults)))
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

/** Writes a saved result as the skill's expected result, the same shape as `latest.json`. It leaves out `folder`: the file is committed, and an absolute path names the author's machine. */
export function acceptResult(result: TestResult, skillFolder: string): string {
	const path = expectedPath(skillFolder)
	mkdirSync(join(skillFolder, 'evals'), { recursive: true })
	const { folder: _folder, ...shared } = result
	writeFileSync(path, `${JSON.stringify(shared, null, '\t')}\n`)
	return path
}

/** The last saved result of a skill, if there is one. */
export function readLatest(folder: string): TestResult | undefined {
	const latest = join(folder, 'latest.json')
	return existsSync(latest) ? (JSON.parse(readFileSync(latest, 'utf8')) as TestResult) : undefined
}
