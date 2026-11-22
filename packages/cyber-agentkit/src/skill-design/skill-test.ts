import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
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
import { basename, join, relative } from 'node:path'
import { stringify } from 'yaml'
import { readAttestations } from './attestation.js'
import { evalFolderNames, rootScope, triggerScope } from './eval-suite.js'
import {
	type EvalSet,
	type ExpectedEntry,
	type ExpectedFile,
	expectedView,
	finishedCases,
	fromLegacy,
	isExpectedFile,
	mergeEntries,
} from './expected-result.js'
import { checkPluginsLoad, type DependencySources, type PluginList, resolveDependencyPlugins } from './plugin-load.js'
import { promptfooConfig, promptfooPackages } from './promptfoo-config.js'
import { promptfooHookSource, promptfooProviderSource } from './promptfoo-provider-source.js'
import { recognizeSandboxFault } from './sandbox-faults.js'
import { readSkill, type SkillFiles } from './skill-files.js'
import { copyPlugin, findSkillPlugin } from './skill-plugin.js'
import { type SkillTestHarness, skillTestHarness } from './skill-test-harness.js'
import type { TestPlan } from './test-plan.js'
import { type ProgressWatch, plannedRuns, watchProgress } from './test-progress.js'
import {
	compareWithHistory,
	compareWithPrevious,
	limitReached,
	type Reply,
	type Row,
	type RunSlot,
	readPromptfooOutput,
	readReplies,
	readRows,
	type TestResult,
} from './test-result.js'
import { type SandboxSettings, sandboxLabel } from './test-sandbox.js'

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
	/** The sandbox settings each run takes, as `skill-design.test.sandbox` resolved them (#302). */
	sandbox: SandboxSettings
	/** Where progress lines go while promptfoo runs (R98, R99); without it the run reports none. */
	progress?: Pick<ProgressWatch, 'write' | 'heartbeatMs' | 'pollMs' | 'now'> | undefined
	/** Where the plugins the skill's plugin depends on are found; without it only `--plugin` folders, of which there are none. */
	dependencies?: DependencySources | undefined
	/** How the test checks that every plugin a run loads does load before it runs a case; without it, it does not check. */
	listPlugins?: PluginList | undefined
	/**
	 * Resume an incomplete result (R163): run only the runs it has `left`, and merge them with the `rows` it finished.
	 * `from` is its `at`, and `durationMs` how long it took.
	 */
	resume?: { rows: Row[]; left: RunSlot[]; from: string; durationMs?: number | undefined } | undefined
}

/** The runs an incomplete result has left, as one slot per case and run, with the arms that run is left in. */
export function resumeSlots(left: RunSlot[]): { case: string; run: number; arms: string[] }[] {
	const slots = new Map<string, { case: string; run: number; arms: string[] }>()
	for (const item of left) {
		const key = `${item.case}|${item.run}`
		const slot = slots.get(key) ?? { case: item.case, run: item.run, arms: [] }
		if (!slot.arms.includes(item.arm)) slot.arms.push(item.arm)
		slots.set(key, slot)
	}
	return [...slots.values()]
}

/**
 * What a resume checks has not changed since the incomplete result (R163): the plan, apart from how many runs go at
 * once, and every file of the skill's folder but its expected and accepted results.
 */
export function testFingerprint(plan: TestPlan, skillFolder: string): string {
	const hash = createHash('sha256')
	const { concurrency: _concurrency, ...rest } = plan
	hash.update(JSON.stringify(rest))
	const walk = (folder: string): string[] =>
		readdirSync(folder, { withFileTypes: true })
			.flatMap((entry) => {
				const path = join(folder, entry.name)
				if (entry.isDirectory()) return walk(path)
				return entry.isFile() ? [path] : []
			})
			.sort()
	for (const path of walk(skillFolder)) {
		const name = relative(skillFolder, path).split('\\').join('/')
		if (/^evals\/([^/]+\/)?(expected\.json$|accepted\/)/.test(name)) continue
		hash.update(`\0${name}\0`)
		hash.update(readFileSync(path))
	}
	return hash.digest('hex')
}

/** Why a test stopped before any run: a cause every run would share. */
export type TestProblemCode = 'login' | 'sandbox' | 'dependency-missing' | 'plugin-load'

/** Runs a plan and reads the result; the baseline falls back to a run without the skill when its folder holds no skill (R35). */
export async function runTest(
	options: TestOptions,
): Promise<
	| { result: TestResult; replies: Reply[]; rows: Row[]; warnings: string[] }
	| { problem: string; code?: TestProblemCode }
> {
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
		const slots = options.resume ? resumeSlots(options.resume.left) : undefined
		// A skill developed in a plugin runs inside a copy of that plugin, with its references and other skills (R91).
		const found = findSkillPlugin(options.skill.folder)
		const harness = options.harness ?? (skillTestHarness('claude-code') as SkillTestHarness)
		let plugin: { name: string; withSkill: string; baseline: string; dependencies?: string[] } | undefined
		if (found) {
			plugin = { name: found.name, withSkill: join(folder, 'plugin-with'), baseline: join(folder, 'plugin-baseline') }
			copyPlugin(found.root, plugin.withSkill)
			copyPlugin(found.root, plugin.baseline, options.skill.folder, baselineFolder)
		}
		// Only Claude Code lets a plugin declare the plugins it needs, and it does not start one without them (E-CC-X1,
		// E-CC-H10): both arms load them, and the test stops when one cannot be found or a plugin does not load.
		if (found && plugin && harness.id === 'claude-code') {
			const resolved = await resolveDependencyPlugins(found.root, found.name, options.dependencies ?? {})
			if ('problem' in resolved) return { code: 'dependency-missing', problem: resolved.problem }
			const dependencies = resolved.plugins.map((dependency) => {
				const path = join(folder, 'dependencies', dependency.name)
				copyPlugin(dependency.path, path)
				return { name: dependency.name, path }
			})
			plugin.dependencies = dependencies.map((dependency) => dependency.path)
			if (options.listPlugins)
				for (const path of [plugin.withSkill, plugin.baseline]) {
					const checked = await checkPluginsLoad([{ name: found.name, path }, ...dependencies], options.listPlugins)
					if (checked && 'problem' in checked) return { code: 'plugin-load', problem: checked.problem }
					if (checked) {
						warnings.push(checked.warning)
						break
					}
				}
		}
		if (harness.leaks) warnings.push(`each ${harness.id} run still reads ${harness.leaks}`)
		// Only a harness whose definition declares containment is held to the run's folder (R107).
		if (!harness.isolation.containment)
			warnings.push(
				`skill test does not contain ${harness.id} runs: a run may read outside its folder, a case's \`network\` list does not apply, and the result lists nothing as blocked`,
			)
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
			limitFile: join(folder, 'usage-limit.json'),
			slots,
			sandbox: options.sandbox,
		})
		writeFileSync(join(folder, 'promptfooconfig.yaml'), stringify(config))
		const started = Date.now()
		const watch = options.progress
			? watchProgress({
					...options.progress,
					file: progressFile,
					total: options.resume ? options.resume.left.length : plannedRuns(options.plan),
				})
			: undefined
		let ran: Awaited<ReturnType<PromptfooRun>>
		try {
			ran = await options.run(folder, 'promptfooconfig.yaml', 'output.json')
		} finally {
			watch?.stop()
		}
		const durationMs = Date.now() - started + (options.resume?.durationMs ?? 0)
		if ('problem' in ran) return { problem: `promptfoo did not run: ${ran.problem}` }
		const setup = setupProblem(ran.output)
		if (setup) return setup
		const dropped = options.baselineFolder !== undefined && baselineFolder === undefined
		// A resume's runs take the numbers of the runs they stand for, beside the runs the incomplete result finished.
		let rows = readRows(ran.output)
		if (options.resume)
			rows = [
				...options.resume.rows.filter((row) => !limitReached(row)),
				...rows
					.filter((row) => !row.response?.metadata?.skipped)
					.map((row) => {
						const run = Number(row.testCase?.vars?.__run)
						return Number.isInteger(run) && run > 0 ? { ...row, repeatIndex: run - 1 } : row
					}),
			]
		const output = { results: { results: rows } }
		const result = readPromptfooOutput(output, options.plan, {
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
				...(sandboxLabel(options.sandbox) ? { sandbox: sandboxLabel(options.sandbox) } : {}),
				durationMs,
				totalRuns: plannedRuns(options.plan),
				...(typeof evalId === 'string' && evalId ? { evalId } : {}),
				...(options.resume ? { resumedFrom: options.resume.from } : {}),
			},
			replies: readReplies(output),
			rows,
			warnings,
		}
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}

/**
 * A cause every run shares, said in plain words instead of one "not run" per run: the provider found the runs are not
 * logged in (its reason starts with `login: `), or Claude Code's sandbox could not start, so no command could be
 * contained (R107, R108).
 */
export function setupProblem(output: unknown): { problem: string; code: 'login' | 'sandbox' } | undefined {
	const rows = ((output as { results?: { results?: { response?: { error?: string } }[] } })?.results?.results ??
		[]) as { response?: { error?: string } }[]
	const errors = rows.map((row) => row.response?.error).filter((error): error is string => !!error)
	const login = errors.find((error) => error.startsWith('login: '))
	if (login) return { code: 'login', problem: login.slice('login: '.length) }
	// The provider's own word that the script sandbox cannot start (R157): no setup script or script check runs.
	const scripts = errors.find((error) => error.startsWith('sandbox: '))
	if (scripts) return { code: 'sandbox', problem: scripts.slice('sandbox: '.length) }
	// A known fault that broke one run's shell is that run's sandbox failure (R154), not a sandbox that could not start.
	const sandbox = errors.find(
		(error) =>
			!recognizeSandboxFault(error) &&
			!error.startsWith('setup script failed: ') &&
			/sandbox/i.test(error) &&
			/unavailable|cannot|missing|not supported|bubblewrap|bwrap/i.test(error),
	)
	if (sandbox)
		return {
			code: 'sandbox',
			problem: `Claude Code's sandbox could not start, so no run can be contained: ${sandbox.split('\n')[0]}. On Linux and WSL it needs bubblewrap and socat installed.`,
		}
	return undefined
}

/** Where a skill's results live: `.agents/skill-design/results/<skill>/` under the repository root, or the home folder. */
export function resultsFolder(base: string, skill: string): string {
	return join(base, '.agents', 'skill-design', 'results', skill)
}

/**
 * The skill's expected result, written by an author's `--accept`, or by the first run that passes when there is none
 * (R80): `evals/expected.json`, which holds the entries of the trigger and root scopes, the settings of the last write,
 * and the attested passes. Each eval folder's scope keeps its own beside its cases (`scopeExpectedPath`, R181).
 */
export function expectedPath(skillFolder: string): string {
	return join(skillFolder, 'evals', 'expected.json')
}

/**
 * Where one scope's expected result lives (R181): `evals/<scope>/expected.json` for the scope of an instructions file,
 * `evals/expected.json` for the trigger and root scopes.
 */
export function scopeExpectedPath(skillFolder: string, scope: string): string {
	return scope === triggerScope || scope === rootScope
		? expectedPath(skillFolder)
		: join(skillFolder, 'evals', scope, 'expected.json')
}

/** Each eval folder of the skill that holds an expected result of its own, by scope name. */
function scopeExpectedFiles(skillFolder: string): { scope: string; path: string }[] {
	return evalFolderNames(skillFolder).flatMap((scope) => {
		const path = scopeExpectedPath(skillFolder, scope)
		return existsSync(path) ? [{ scope, path }] : []
	})
}

function readJson(path: string): unknown {
	try {
		return JSON.parse(readFileSync(path, 'utf8'))
	} catch {
		return undefined
	}
}

/**
 * The skill's expected result laid out as a saved result (`expectedView`): the per-case form with each criterion
 * computed from its entries (R182), or a version 1 file as it is. With eval folders that keep their own, it is every
 * scope's entries as one. A file that holds only attested passes (#323), or that cannot be read, holds none.
 */
export function readExpected(skillFolder: string): TestResult | undefined {
	if (!scopeExpectedFiles(skillFolder).length) return readResult(expectedPath(skillFolder))
	const file = readExpectedFile(skillFolder, undefined)
	return file ? expectedView(file) : undefined
}

/**
 * The skill's expected result in the per-case form, for a write to merge into: `evals/expected.json` with the entries
 * of each eval folder's own (R181), in `evalSet`'s order when given. A version 1 file is read as entries (`fromLegacy`),
 * with `evalSet` telling which criteria each case tests; it is the single-file form, whose entries all live at the root.
 * Undefined when no file holds a run result.
 */
export function readExpectedFile(skillFolder: string, evalSet: EvalSet | undefined): ExpectedFile | undefined {
	const value = readJson(expectedPath(skillFolder))
	let root: ExpectedFile | undefined
	if (isExpectedFile(value)) root = value
	else {
		const old = expectedView(value)
		root = old ? fromLegacy(old, evalSet) : undefined
	}
	const parts = scopeExpectedFiles(skillFolder).flatMap(({ path }) => {
		const part = readJson(path)
		return isExpectedFile(part) ? [part] : []
	})
	if (!parts.length) return root
	const base = root ?? (parts[0] as ExpectedFile)
	const entries: Record<string, ExpectedEntry> = { ...(root?.entries ?? {}) }
	let inputs: Record<string, Record<string, string>> = { ...(root?.inputs ?? {}) }
	for (const part of parts) {
		Object.assign(entries, part.entries)
		inputs = { ...inputs, ...(part.inputs ?? {}) }
	}
	const ordered = evalSet
		? Object.fromEntries([
				...evalSet.cases.flatMap((c) => (entries[c.id] ? [[c.id, entries[c.id] as ExpectedEntry]] : [])),
				...Object.entries(entries).filter(([id]) => !evalSet.cases.some((c) => c.id === id)),
			])
		: entries
	const { inputs: _inputs, ...rest } = base
	return { ...rest, entries: ordered, ...(Object.keys(inputs).length ? { inputs } : {}) }
}

/**
 * Where a scope's past accepted results live, each as `<its at>.json`, beside its expected result: `evals/accepted/`
 * for the trigger and root scopes, `evals/<scope>/accepted/` for an eval folder's.
 */
export function acceptedFolder(skillFolder: string, scope: string = rootScope): string {
	return join(scopeExpectedPath(skillFolder, scope), '..', 'accepted')
}

/** How many past accepted results each scope keeps in its `accepted/` folder beside its expected result, the newest. */
export const keptAcceptedResults = 3

/**
 * The skill's kept accepted results, every scope's, oldest first, with the expected result last; a file that cannot be
 * read is skipped. A past result of one eval folder holds that scope's cases only, which is all a case's trend reads.
 */
export function acceptedHistory(skillFolder: string): TestResult[] {
	const scopes = [rootScope, ...evalFolderNames(skillFolder)]
	const past = scopes
		.flatMap((scope) => {
			const folder = acceptedFolder(skillFolder, scope)
			return existsSync(folder)
				? readdirSync(folder)
						.filter((name) => name.endsWith('.json'))
						.map((name) => ({ name, path: join(folder, name) }))
				: []
		})
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
		.flatMap(({ path }) => {
			const read = readResult(path)
			return read ? [read] : []
		})
	const expected = readExpected(skillFolder)
	return expected ? [...past, expected] : past
}

function readResult(path: string): TestResult | undefined {
	try {
		return expectedView(JSON.parse(readFileSync(path, 'utf8')))
	} catch {
		return undefined
	}
}

/** The file name a result saved at `at` is kept under once a newer one replaces it. */
export function stem(at: string): string {
	return at.replace(/[:]/g, '-')
}

/**
 * Saves the result as `latest.json`, moving the previous one beside it as `<its at>.json`, and adds the cases that
 * changed since the skill's expected result, else the previous one. Every run's reply goes beside it in
 * `<its at>.replies.json`, which the result names (R138).
 */
export function saveResult(
	folder: string,
	result: TestResult,
	skillFolder: string,
	replies?: Reply[],
	rows?: Row[],
): TestResult {
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
	const expected = readExpected(skillFolder)
	const ran = new Set(finishedCases(result))
	const carried = (expected?.cases ?? []).flatMap((item) =>
		item.carried && ran.has(item.case) ? [{ case: item.case, reason: item.carried.reason }] : [],
	)
	const compared = expected
		? { ...compareWithPrevious(result, expected, 'expected'), ...(carried.length ? { comparedCarried: carried } : {}) }
		: compareWithPrevious(result, previous, 'previous')
	const saved: TestResult = { ...compareWithHistory(compared, acceptedHistory(skillFolder)), folder: skillFolder }
	if (replies) {
		saved.replies = `${stem(result.at)}.replies.json`
		writeFileSync(join(folder, saved.replies), `${JSON.stringify(replies, null, '\t')}\n`)
	}
	// An incomplete result keeps the runs it finished beside it, for a resume to merge with its own (R163).
	if (saved.incomplete && rows) {
		saved.incomplete = { ...saved.incomplete, runs: `${stem(result.at)}.runs.json` }
		writeFileSync(join(folder, saved.incomplete.runs as string), `${JSON.stringify(rows)}\n`)
	}
	writeFileSync(latest, `${JSON.stringify(saved, null, '\t')}\n`)
	pruneHistory(folder)
	removeVanished(join(folder, '..'), basename(folder))
	return saved
}

/** How many past results (`<at>.json`) a skill keeps beside `latest.json`. */
export const keptPastResults = 5

/**
 * Deletes all but the most recent past results of one skill, and the replies of every result it no longer keeps. Only
 * the latest result's runs file stays: a resume reads no other (R163).
 */
export function pruneHistory(folder: string): void {
	const names = readdirSync(folder)
	const past = names
		.filter(
			(name) =>
				name.endsWith('.json') &&
				!name.endsWith('.replies.json') &&
				!name.endsWith('.runs.json') &&
				name !== 'latest.json',
		)
		.sort()
	const dropped = past.slice(0, Math.max(0, past.length - keptPastResults))
	for (const name of dropped) rmSync(join(folder, name), { force: true })
	const kept = new Set(past.slice(dropped.length).map((name) => name.slice(0, -'.json'.length)))
	const latest = readLatest(folder)
	if (latest?.at) kept.add(stem(latest.at))
	for (const name of names) {
		if (name.endsWith('.replies.json') && !kept.has(name.slice(0, -'.replies.json'.length)))
			rmSync(join(folder, name), { force: true })
		if (name.endsWith('.runs.json') && name !== latest?.incomplete?.runs) rmSync(join(folder, name), { force: true })
	}
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
		} catch {}
	}
}

/**
 * Writes the entries of `cases` from a saved result into the skill's expected result (R181), leaving every other entry
 * as it was and dropping the entry of a case `evalSet` no longer holds. Each entry keeps what a run decided, never its
 * replies or an absolute path, since the file is committed. Each scope's entries go to its own file
 * (`writeExpectedFile`). When the write replaces or drops an entry a file holds, that file moves to its scope's
 * `accepted/<its at>.json` first, unless it is the same run, and only the newest `keptAcceptedResults` stay there. A
 * write of no case changes nothing.
 */
export function acceptResult(
	result: TestResult,
	skillFolder: string,
	cases: string[] = finishedCases(result),
	evalSet?: EvalSet,
): { path: string; written: string[]; dropped: string[] } {
	const path = expectedPath(skillFolder)
	const previous = readExpectedFile(skillFolder, evalSet)
	const merged = mergeEntries(previous, result, cases, evalSet)
	if (!merged.written.length && !merged.dropped.length) return { path, written: [], dropped: [] }
	// The passes the author attested (#323) outlive the expected result they were recorded beside.
	const attested = readAttestations(skillFolder)
	const changed = new Set([...merged.written.filter((id) => previous?.entries[id]), ...merged.dropped])
	for (const stored of storedExpected(skillFolder)) {
		if (stored.at === result.at || !stored.ids.some((id) => changed.has(id))) continue
		const folder = acceptedFolder(skillFolder, stored.scope)
		mkdirSync(folder, { recursive: true })
		renameSync(stored.path, join(folder, `${stem(stored.at)}.json`))
		pruneAccepted(folder)
	}
	writeExpectedFile(skillFolder, merged.file, attested)
	return { path, written: merged.written, dropped: merged.dropped }
}

/** Each expected result file the skill holds now, with its scope, when it was written, and the cases it has entries of. */
function storedExpected(skillFolder: string): { scope: string; path: string; at: string; ids: string[] }[] {
	return [{ scope: rootScope, path: expectedPath(skillFolder) }, ...scopeExpectedFiles(skillFolder)].flatMap(
		({ scope, path }) => {
			const value = readJson(path)
			if (isExpectedFile(value)) return [{ scope, path, at: value.at, ids: Object.keys(value.entries) }]
			const old = expectedView(value)
			return old ? [{ scope, path, at: old.at, ids: old.cases.map((item) => item.case) }] : []
		},
	)
}

/**
 * Writes the per-case expected result as it is, one file per scope (R181): the entries of each eval folder's scope to
 * `evals/<scope>/expected.json`, and the trigger and root entries, with the passes the author attested (#323), those in
 * the file now by default, to `evals/expected.json`. An entry of a scope with no eval folder stays at the root. An eval
 * folder left with no entry has its file removed. Answers each file it wrote, the root's first.
 */
export function writeExpectedFile(
	skillFolder: string,
	file: ExpectedFile,
	attested = readAttestations(skillFolder),
): string[] {
	const { attested: _attested, entries, inputs, ...rest } = file
	const folders = new Set(evalFolderNames(skillFolder))
	const byScope = new Map<string, Record<string, ExpectedEntry>>([[rootScope, {}]])
	for (const scope of folders) byScope.set(scope, {})
	for (const [id, entry] of Object.entries(entries)) {
		const scope = folders.has(entry.scope) ? entry.scope : rootScope
		;(byScope.get(scope) as Record<string, ExpectedEntry>)[id] = entry
	}
	const written: string[] = []
	for (const [scope, own] of byScope) {
		const path = scopeExpectedPath(skillFolder, scope)
		if (scope !== rootScope && !Object.keys(own).length) {
			rmSync(path, { force: true })
			continue
		}
		const used = new Set(Object.values(own).flatMap((entry) => (entry.hashes ? [entry.hashes.scope] : [])))
		const kept = Object.fromEntries(Object.entries(inputs ?? {}).filter(([hash]) => used.has(hash)))
		const part = { ...rest, entries: own, ...(Object.keys(kept).length ? { inputs: kept } : {}) }
		mkdirSync(join(path, '..'), { recursive: true })
		writeFileSync(
			path,
			`${JSON.stringify(scope === rootScope && attested.length ? { ...part, attested } : part, null, '\t')}\n`,
		)
		written.push(path)
	}
	return written
}

/** Deletes all but the newest `keptAcceptedResults` past accepted results of one scope; its expected result is never one. */
function pruneAccepted(folder: string): void {
	if (!existsSync(folder)) return
	const past = readdirSync(folder)
		.filter((name) => name.endsWith('.json'))
		.sort()
	for (const name of past.slice(0, Math.max(0, past.length - keptAcceptedResults)))
		rmSync(join(folder, name), { force: true })
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
	return readExpected(skillFolder)
}
