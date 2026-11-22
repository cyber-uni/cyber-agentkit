import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { type Answer, CliError, type Format, printAnswer, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { type PresentHarnessSource, presentHarnesses } from '../detection/present-harnesses.js'
import { type HarnessId, harnessIds } from '../harness/harness-id.js'
import { type InstalledPlugin, installedPlugins } from '../plugins/installed-plugins.js'
import { findRoot, type ReferencePlugin, referenceLayers } from '../references/reference-layers.js'
import { knownBy } from '../references/reference-loads.js'
import { resolveReference } from '../references/resolve-reference.js'
import { withDefault } from '../references/skill-defaults.js'
import { findSkill } from '../skills/find-skill.js'
import {
	type Attestation,
	type AttestationView,
	attestedTarget,
	readAttestations,
	recordAttestation,
	skillFingerprint,
	viewAttestations,
} from './attestation.js'
import { type FailOn, failOnPolicies, failsPolicy, type SkillCheckReport } from './check-skill.js'
import { combineReports, defaultSkillDirs, findSkills, type RepositoryCheckReport } from './check-skills.js'
import { addCase, addTriggerCase, type CaseChange, type CaseCheck, removeCase } from './eval-case.js'
import { type EvalReport, readEvalReport, reportMarkdown, skillCriteria } from './eval-report.js'
import { carryEntries, finishedCases, readEvalSet, sandboxFailedCases } from './expected-result.js'
import { builtScriptsHash, inputHashes, runResolver } from './input-hashes.js'
import {
	clearKnownFailure,
	type KnownFailureMark,
	listKnownFailures,
	type MarkProblem,
	markKnownFailure,
} from './known-failures.js'
import {
	type PluginEvalRun,
	runPluginEval,
	runPluginEvalTest,
	type ScriptSandboxInstall,
} from './plugin-eval-backend.js'
import { listPlugins, type PluginList } from './plugin-load.js'
import { runCheckScript } from './run-check-script.js'
import { type TriedSetup, trySetup } from './setup-try.js'
import { aspectNames, loadAspect } from './skill-aspects.js'
import { checkSkill } from './skill-check.js'
import { doctorSkills, type SkillDoctorReport } from './skill-doctor.js'
import { criteriaItems, readSkill } from './skill-files.js'
import {
	acceptResult,
	lastResult,
	type PromptfooRun,
	readExpected,
	readExpectedFile,
	readLatest,
	resultsFolder,
	runPromptfoo,
	runTest,
	saveResult,
	testFingerprint,
	writeExpectedFile,
} from './skill-test.js'
import {
	harnessDefault,
	resolveModel,
	resolvePlanModels,
	type SkillTestHarness,
	skillTestHarness,
	skillTestHarnesses,
} from './skill-test-harness.js'
import { type SkillVetReport, vetSkill } from './skill-vet.js'
import { type Selection, selectionLines, selectStale } from './stale-cases.js'
import { defaultTestBudget, estimateTest, estimateText, parseTestBudget } from './test-estimate.js'
import { planScripts, planTest, withoutScripts } from './test-plan.js'
import { planLine } from './test-progress.js'
import type {
	CaseStatus,
	Incomplete,
	InputHashes,
	KnownFailure,
	ResumeOptions,
	Row,
	TestResult,
} from './test-result.js'
import { notRunKind, notRunLine } from './test-result.js'
import {
	defaultTemplate,
	resolveTestSandbox,
	type SandboxSettings,
	sandboxReferenceName,
	sandboxTemplatePrefix,
} from './test-sandbox.js'
import { type GitHubGet, githubGet, type JsonGet, jsonGet, type SupplyChainSignals } from './vet-signals.js'
import { cloneSource, type FetchSource, parseVetSource } from './vet-source.js'
import { readTrustList, trustListName } from './vet-trust.js'

export type SkillCommandOptions = {
	plugin?: ReferencePlugin | undefined
	/** How promptfoo runs; tests pass a fake. */
	runPromptfoo?: PromptfooRun | undefined
	/** How `claude plugin eval` runs; tests pass a fake. */
	runPluginEval?: PluginEvalRun | undefined
	/** How the plugin-eval backend gets the sandbox a setup script runs in; tests pass a fake. */
	scriptSandbox?: ScriptSandboxInstall | undefined
	/** How `skill test` lists the plugins a run loads, to check each one does; tests pass a fake. */
	listPlugins?: PluginList | undefined
	/** The plugins Claude Code has installed, where a plugin's dependencies are found; tests pass a fake. */
	installedPlugins?: (() => Promise<readonly InstalledPlugin[]>) | undefined
	/** How `skill test` polls the progress file and spaces its "still running" lines; tests shorten them. */
	progress?: { heartbeatMs?: number | undefined; pollMs?: number | undefined } | undefined
	/** The machine's hardware threads, which bound how many runs go at once (R103); tests set it. */
	threads?: number | undefined
	/** How `skill vet` puts a source's files in its temporary folder; tests pass a fake. */
	fetchSource?: FetchSource | undefined
	/** How `skill vet` reads the GitHub API; tests pass a fake. */
	githubGet?: GitHubGet | undefined
	/** How `skill vet` reads the skills.sh install count; tests pass a fake. */
	skillsShGet?: JsonGet | undefined
	/** The time `skill vet` measures maintenance from; tests fix it. */
	now?: (() => Date) | undefined
}

function answerThenFail(answer: Answer<any>, format: Format): never {
	const text = printAnswer(answer, format)
	if (text !== undefined) process.stdout.write(text)
	throw CliError.reported(exitCodes.error)
}

function textReport(report: SkillCheckReport): string {
	const lines = [
		`${report.skill}: ${report.status} (${report.passed} passed, ${report.failed} failed of which ${report.critical} critical, ${report.notChecked} not checked, ${report.skipped} skipped)`,
	]
	for (const aspect of report.aspects) {
		lines.push(`${aspect.aspect} (${aspect.implementation}): ${aspect.status}`)
		for (const check of aspect.checks) {
			if (check.status === 'pass') continue
			const where = check.file ? ` [${check.file}]` : ''
			const needs = check.needs ? ` (needs /skill ${check.needs})` : ''
			const severity = check.status === 'fail' && check.severity ? ` (${check.severity})` : ''
			lines.push(
				`  ${check.id} ${check.status}${severity}: ${check.message ?? ''}${where}${check.status === 'not-checked' ? needs : ''}`,
			)
		}
	}
	return `${lines.join('\n')}\n`
}

function repositoryText(report: RepositoryCheckReport): string {
	const parts = report.reports.map((skill) =>
		textReport(skill).replace(/^[^:\n]+:/, `${skill.skill} (${skill.folder}):`),
	)
	parts.push(
		`${report.skills} skills: ${report.status} (${report.skillsFailed} failed; ${report.passed} checks passed, ${report.failed} failed of which ${report.critical} critical, ${report.notChecked} not checked, ${report.skipped} skipped)\n`,
	)
	return parts.join('\n')
}

function checkCommand({ plugin }: SkillCommandOptions): cli.Command {
	return command({
		name: 'check',
		description:
			'Check a skill folder against every aspect without running it: the checks a script decides pass or fail, each critical or a warning, and every other check is listed as not checked. Given no folder, checks every skill under `--dir`, by default `skills` and `.agents/skills`, and adds a summary. Exits 1 when a critical check fails, or with `--fail-on any` when any check does.',
		arguments: [
			{
				name: 'folder',
				description: 'The skill folder, holding its SKILL.md. Leave it out to check every skill under `--dir`.',
				type: t.string().optional(),
			},
		],
		options: {
			dir: {
				description: `A folder to find skills in, relative to the root; a glob such as \`plugins/*/skills\` names several, and \`**\` matches any depth. Each folder that is a skill is checked, else each skill directly under it, and a skill reached twice through a symlink is checked once. Repeat it for more. Defaults to ${defaultSkillDirs.map((dir) => `\`${dir}\``).join(' and ')}.`,
				type: t.array(t.string()).optional(),
			},
			root: {
				description:
					'The repository root whose references choose each aspect. Defaults to the nearest folder at or above the current directory holding `.git`.',
				type: t.string().optional(),
			},
			'fail-on': {
				description:
					'Which failures exit 1: `critical` (the default), which reports warnings and exits 0 on them, or `any`.',
				type: t.string().optional(),
			},
		},
		examples: [
			{ command: 'cyber-agentkit skill check .agents/skills/release-notes', description: 'Check one skill' },
			{
				command: 'cyber-agentkit skill check .agents/skills/release-notes --fail-on any',
				description: 'Fail on warnings too',
			},
			{ command: 'cyber-agentkit skill check', description: 'Check every skill under skills and .agents/skills' },
			{
				command: "cyber-agentkit skill check --dir .agents/skills --dir 'plugins/*/skills'",
				description: 'Check every skill in a monorepo',
			},
		],
		async run(
			this: { format: Format },
			args: {
				folder?: string | undefined
				dir?: string[] | undefined
				root?: string | undefined
				'fail-on'?: string | undefined
			},
		) {
			const failOn = (args['fail-on'] ?? 'critical') as FailOn
			if (!failOnPolicies.includes(failOn)) {
				process.stderr.write(
					`error: unknown-fail-on: no --fail-on ${args['fail-on']}; use ${failOnPolicies.join(' or ')}\n`,
				)
				throw CliError.reported(exitCodes.usage)
			}
			if (args.folder !== undefined && args.dir?.length) {
				process.stderr.write('error: folder-and-dir: give a skill folder or --dir, not both\n')
				throw CliError.reported(exitCodes.usage)
			}
			const skill = args.folder === undefined ? undefined : readSkill(args.folder)
			if (args.folder !== undefined && !skill) {
				process.stderr.write(`error: skill-missing: no SKILL.md in ${args.folder}\n`)
				throw CliError.reported(exitCodes.error)
			}
			const root = args.root === undefined ? findRoot(process.cwd()) : resolve(args.root)
			const dirs = args.dir?.length ? args.dir : defaultSkillDirs
			const found = skill ? [] : findSkills(root, dirs)
			if (!skill && found.length === 0) {
				process.stderr.write(`error: no-skills: no skill under ${dirs.join(', ')} in ${root}\n`)
				throw CliError.reported(exitCodes.error)
			}
			const home = homedir()
			const layers = await referenceLayers({
				root: args.root,
				cwd: process.cwd(),
				home,
				platform: process.platform,
				env: process.env,
				plugin,
			})
			const display = (path: string) => collapseHome(home, path)
			const aspects = aspectNames(layers).map((name) => loadAspect(name, layers, display))
			for (const aspect of aspects)
				for (const warning of aspect.warnings) process.stderr.write(`warning: ${aspect.aspect}: ${warning}\n`)
			const knownIn = (folder: string) => {
				const skillLayers = withDefault(layers, folder)
				return knownBy((name) => resolveReference(name, skillLayers).status === 'found')
			}
			if (skill) {
				const report = checkSkill(skill, aspects, runCheckScript, knownIn(skill.folder))
				const answer = result(report, { render: { text: textReport } })
				if (failsPolicy(report, failOn)) answerThenFail(answer, this.format)
				return answer
			}
			const reports = found.flatMap(({ folder }) => {
				const files = readSkill(folder)
				return files ? [{ folder, report: checkSkill(files, aspects, runCheckScript, knownIn(folder)) }] : []
			})
			const combined = combineReports(root, dirs, reports)
			const answer = result(combined, { render: { text: repositoryText } })
			if (failsPolicy(combined, failOn)) answerThenFail(answer, this.format)
			return answer
		},
	})
}

/** Whether `folder` is `root` or inside it, following links, so a link cannot pass a folder from elsewhere as inside. */
function isInside(root: string, folder: string): boolean {
	const real = (path: string) => {
		try {
			return realpathSync(path)
		} catch {
			return resolve(path)
		}
	}
	const path = relative(real(root), real(folder))
	return path === '' || (!path.startsWith('..') && !isAbsolute(path))
}

/** The folder results live under: the repository root, or the home folder outside a repository. */
function resultsBase(rootOption: string | undefined, home: string): string {
	const root = rootOption === undefined ? findRoot(process.cwd()) : resolve(rootOption)
	return existsSync(join(root, '.git')) ? root : home
}

/**
 * A regression guard's line (R160): a pass on both arms is what a guard is for, so it says so instead of reading as a
 * skill that adds nothing; a fail with the skill is still a fail.
 */
function guardLine(item: CaseStatus, threshold: number): string {
	const rate = item.ran === undefined ? '' : ` ${item.passed} of ${item.ran}`
	const base = item.baseline ? `, baseline ${item.baseline.passed} of ${item.baseline.ran}` : ''
	const note =
		item.status === 'fail'
			? 'a guard that fails with the skill is a failure'
			: item.status === 'pass' && item.baseline?.ran && item.baseline.passed >= Math.min(threshold, item.baseline.ran)
				? 'passes without the skill too, as a guard is expected to'
				: ''
	return `guard ${item.case}: ${item.status}${rate}${base}${note ? ` — ${note}` : ''}`
}

/**
 * The sandbox settings a test, a try, or a compare runs in (#302), as `skill-design.test.sandbox` or `--sandbox`
 * resolves them. Writes its warnings, and a warning for each sandbox the runs go without; exits on an unknown template
 * or settings it cannot read.
 */
export function testSandbox(
	layers: Parameters<typeof resolveTestSandbox>[0],
	flag: string | undefined,
): SandboxSettings {
	const chosen = resolveTestSandbox(layers, flag)
	if ('problem' in chosen) {
		process.stderr.write(`error: ${chosen.code}: ${chosen.problem}\n`)
		throw CliError.reported(chosen.code === 'unknown-sandbox' ? exitCodes.usage : exitCodes.error)
	}
	for (const warning of chosen.warnings) process.stderr.write(`warning: ${warning}\n`)
	const { shell, scripts } = chosen.settings
	const without =
		!shell.sandbox && !scripts.sandbox
			? 'shell commands, setup scripts, and script checks'
			: !shell.sandbox
				? 'shell commands'
				: !scripts.sandbox
					? 'setup scripts and script checks'
					: undefined
	if (without) {
		const source =
			chosen.from === 'flag'
				? '--sandbox'
				: chosen.from === 'plugin'
					? sandboxReferenceName
					: `${sandboxReferenceName} in the ${chosen.from} tier`
		const template = chosen.templates[0] ? `the ${chosen.templates[0]} template (${source})` : source
		process.stderr.write(
			`warning: no-sandbox: ${template} runs ${without} without a sandbox${shell.network === 'open' || scripts.network === 'open' ? ', with the network open' : ''}\n`,
		)
	}
	return chosen.settings
}

const sandboxOption = {
	description: `The sandbox template each run takes: the name of a \`${sandboxTemplatePrefix}<template>\` reference, such as \`folder-only\`, which runs shell commands, setup scripts, and \`script\` checks without a sandbox for a machine that cannot run one, or \`default\` (\`${defaultTemplate}\`). Without it, the runs take what \`${sandboxReferenceName}\` holds in the managed, repo, or user tier, else the plugin's, which extends \`${defaultTemplate}\`.`,
	type: t.string().optional(),
}

/**
 * The entries the first-pass rule reads (#322), with a `not-tested` one that has a current attested pass (#323) counted
 * as passed: an attested pass is a skipped variant, not a failure. A stale one counts for nothing, and a run's own `fail` or
 * `not-run` is never changed.
 */
function withAttestedStatus(
	entries: ({ case: string; status: string } | { id: string; status: string })[],
	skillFolder: string,
): { status: string }[] {
	const attested = viewAttestations(readAttestations(skillFolder), skillFingerprint(skillFolder)).filter(
		(item) => !item.stale,
	)
	if (!attested.length) return entries
	return entries.map((item) => {
		if (item.status !== 'not-tested') return item
		const seen = attested.some((entry) =>
			'case' in item ? entry.case === item.case : entry.case === undefined && entry.id === item.id,
		)
		return seen ? { ...item, status: 'pass' } : item
	})
}

/** A `test` report with the skill's attested passes beside the run (#323), each marked stale when the skill changed since. */
function withAttested(result: TestResult, skillFolder: string): TestResult {
	const attested = readAttestations(skillFolder)
	return attested.length ? { ...result, attested: viewAttestations(attested, skillFingerprint(skillFolder)) } : result
}

/**
 * An attested pass's line in a `test` report (#323): where it was seen, never a pass rate. When this run fails the same
 * criterion or case, the line says the run decides, so an older attested pass hides no failure.
 */
export function attestedLine(item: AttestationView, result: Pick<TestResult, 'criteria' | 'cases'>): string {
	const run =
		item.case !== undefined
			? result.cases.find((other) => other.case === item.case)?.status
			: result.criteria.find((other) => other.id === item.id)?.status
	const parts = [
		`${attestedTarget(item)}: attested${item.stale ? ', stale: skill changed since' : ''} (${item.evidence})`,
	]
	if (item.note) parts.push(` — ${item.note}`)
	parts.push(` (${item.by ? `by ${item.by}, ` : ''}${item.at.slice(0, 10)})`)
	if (run === 'fail') parts.push('; this run fails it, and the run decides')
	return parts.join('')
}

/** A known failure's line in a `test` report (#329): what is marked, how its runs went, and why it is known to fail. */
export function knownFailureLine(item: KnownFailure): string {
	return `known failure: ${markTarget(item)} ${item.passed} of ${item.ran} — ${item.reason}`
}

/** A mark the run passed, in a `test` report (#329): it asks for the mark to be cleared, with the command. */
export function fixedLine(item: KnownFailure, folder: string | undefined): string {
	return `fixed? remove the mark: ${markTarget(item)} passed ${item.passed} of ${item.ran}, marked known to fail (${item.reason}); clear it with \`${clearMarkCommand(folder, item)}\``
}

/** The text report; `folder` is where the result was saved, so the replies file is named in full. */
function testText(result: TestResult, folder?: string): string {
	const lines = [
		`${result.skill}: ${result.runs} runs per case, threshold ${result.threshold}, baseline ${result.baseline}${result.model ? `, model ${result.model === harnessDefault ? "the harness's default" : result.model}` : ''}${result.judge ? `, judge ${result.judge === harnessDefault ? "the harness's default" : result.judge}` : ''}`,
	]
	// Each case on a model of its own says so, so its result is not read as the run's model's (R161).
	for (const item of result.cases) if (item.model) lines.push(`model ${item.case}: ${item.model}`)
	// Sandbox failures come first, so the pass rates below are not read as the skill's (R154).
	const sandbox = result.sandboxFailures ?? []
	if (sandbox.length) {
		lines.push(
			`warning: ${sandbox.length} ${sandbox.length === 1 ? 'run was a sandbox failure' : 'runs were sandbox failures'}: the test sandbox broke ${sandbox.length === 1 ? 'its' : 'their'} shell, so no pass rate counts ${sandbox.length === 1 ? 'it' : 'them'}`,
		)
		const byCase = new Map<string, { skill: number; baseline: number }>()
		for (const item of sandbox) {
			const counts = byCase.get(item.case) ?? { skill: 0, baseline: 0 }
			counts[item.arm]++
			byCase.set(item.case, counts)
		}
		for (const [id, counts] of byCase)
			lines.push(
				`sandbox failure: ${id} — ${counts.skill} with the skill, ${counts.baseline} without — ${sandbox.find((item) => item.case === id)?.text}`,
			)
	}
	// A reached usage limit comes first too: the runs it left count toward no pass rate below (R162).
	const incomplete = result.incomplete
	if (incomplete) {
		const left = incomplete.left
			.map((item) => `${item.case} (${item.arm === 'skill' ? 'with skill' : 'without skill'}, run ${item.run})`)
			.join(', ')
		lines.push(
			`warning: incomplete: the usage limit was reached (${incomplete.text})${incomplete.resets && !incomplete.text.includes(incomplete.resets) ? `; it resets ${incomplete.resets}` : ''}; ${incomplete.left.length} ${incomplete.left.length === 1 ? 'run is' : 'runs are'} left and count toward no pass rate: ${left}`,
		)
	}
	const known = result.knownFailures ?? []
	for (const item of result.trigger) {
		const mark = known.find((entry) => entry.case === item.case && entry.criterion === undefined)
		const status = item.status === 'known-failure' ? `known failure (${mark?.reason ?? 'marked'})` : item.status
		lines.push(`trigger ${item.case} (${item.expect}): ${status}, fired ${item.fired} of ${item.ran} — ${item.prompt}`)
	}
	for (const item of result.criteria) {
		const rate = item.ran === undefined ? '' : ` ${item.passed} of ${item.ran}`
		const base = item.baseline ? `, baseline ${item.baseline.passed} of ${item.baseline.ran}` : ''
		lines.push(
			`${item.id}${item.guard ? ' (guard)' : ''}: ${item.status === 'known-failure' ? 'known failure' : item.status}${rate}${base}${item.reason ? ` — ${item.reason}` : ''}`,
		)
		for (const failure of item.failures ?? [])
			lines.push(
				`  ${failure.case} run ${failure.run}: ${failure.output.split('\n').slice(0, 3).join(' ').slice(0, 200)}`,
			)
	}
	// Known failures stand apart from the passes and failures (#329); a mark the run passed asks to be cleared.
	for (const item of known.filter((entry) => entry.criterion !== undefined && entry.status === 'known-failure'))
		lines.push(knownFailureLine(item))
	for (const item of known.filter((entry) => entry.status === 'fixed')) lines.push(fixedLine(item, result.folder))
	for (const item of result.cases) if (item.guard) lines.push(guardLine(item, result.threshold))
	for (const item of result.attested ?? []) lines.push(attestedLine(item, result))
	for (const item of result.notRun) lines.push(notRunLine(item))
	if (result.sandbox)
		lines.push(
			`sandbox: ${result.sandbox} — ${{ none: 'no sandbox around shell commands or scripts', 'shell-only': 'setup scripts and script checks ran without the script sandbox', 'scripts-only': 'shell commands ran without the OS sandbox' }[result.sandbox]}`,
		)
	for (const item of result.wroteOutside ?? [])
		lines.push(`wrote outside: ${item.case} run ${item.run} (${item.arm}) changed ${item.target}`)
	for (const item of result.blocked ?? [])
		lines.push(
			`blocked: ${item.case} run ${item.run} (${item.arm}) tried to ${item.what === 'network' ? 'reach' : item.what} ${item.target}`,
		)
	if (result.replies) lines.push(`replies of every run: ${folder ? join(folder, result.replies) : result.replies}`)
	// Which scopes ran and why, when the current cases were left out (R177).
	if (result.selected?.current || result.selected?.notSelecting?.length) lines.push(...selectionLines(result.selected))
	if (result.partial)
		lines.push(`partial: only ${result.partial.cases.join(', ')} ran; compared with their expected entries only`)
	if (incomplete)
		lines.push(
			`incomplete: a case with a run at the limit gets no expected entry; run \`skill test --resume\` on the skill${incomplete.resets ? ` after the limit resets (${incomplete.resets})` : ' after the limit resets'} to run only the runs left`,
		)
	if (result.resumedFrom) lines.push(`resumed: holds the runs of ${result.resumedFrom} and the runs it had left`)
	if (result.expectedWritten)
		lines.push(
			result.expectedWritten.by === 'accept'
				? `accepted into evals/expected.json: ${result.expectedWritten.cases.join(', ')}`
				: `no expected entry yet, and passed: saved in evals/expected.json: ${result.expectedWritten.cases.join(', ')}`,
		)
	for (const item of result.notSavedAsExpected ?? [])
		lines.push(
			`no expected entry for ${item.case}: ${item.reason}; run \`skill accept\` on the skill to accept it anyway`,
		)
	if (result.expectedHeld?.length)
		lines.push(
			`not saved in evals/expected.json: ${result.expectedHeld.join(', ')} had sandbox failures; review them, then run \`skill accept\` on the skill to accept them`,
		)
	for (const item of result.comparedCarried ?? [])
		lines.push(`compared with a carried entry: ${item.case} was carried forward, not run (${item.reason})`)
	if (result.noPrevious) lines.push('no expected or previous result to compare with')
	else
		for (const item of result.changed ?? [])
			lines.push(`changed since ${result.comparedWith}: ${item.case} ${item.from} → ${item.to}`)
	// A comparison across models says so (R161): the same change and its models, one line for the cases sharing them.
	const models = new Map<string, string[]>()
	for (const item of result.modelChanged ?? []) {
		const key = `${item.from} → ${item.to}`
		models.set(key, [...(models.get(key) ?? []), item.case])
	}
	for (const [key, cases] of models)
		lines.push(
			`warning: model changed since ${result.comparedWith}: ${key} for ${cases.length === result.cases.filter((item) => item.status !== 'not-run').length ? 'every case that ran' : cases.join(', ')}; a change there may be the model's, not the skill's`,
		)
	for (const item of result.moved ?? [])
		lines.push(
			`moved across accepted results: ${item.case} ${item.rates.map((rate, index) => `${index === item.rates.length - 1 ? 'now ' : ''}${rate.passed} of ${rate.ran}`).join(' → ')}`,
		)
	return `${lines.join('\n')}\n`
}

function testCommand({
	plugin,
	runPromptfoo: run = runPromptfoo,
	runPluginEval: pluginEval = runPluginEval,
	scriptSandbox,
	listPlugins: list = listPlugins,
	installedPlugins: installed = async () => (await installedPlugins('claude-code')).plugins,
	progress,
	threads,
}: SkillCommandOptions): cli.Command {
	return command({
		name: 'test',
		description:
			"Run a skill's evals (evals/evals.yaml, and evals/<name>/evals.yaml for each instructions file's scope) on promptfoo or `claude plugin eval`, several runs per case, each in a fresh folder, beside a run without the skill, and save the result. With no --case or --all, only the stale cases run: those with no expected entry, or whose own definition or a scope input changed since their entry was recorded; the report names, per scope, what changed. Makes model calls. Exits 1 when a case or criterion fails, a run errors or is a sandbox failure, or the usage limit stops the test; a case the plan skips, such as one with an outside effect, is no failure.",
		arguments: [
			{ name: 'folder', description: 'The skill folder, holding its SKILL.md and evals/.', type: t.string() },
		],
		options: {
			harness: {
				description: `The harness each run drives: ${skillTestHarnesses.join(' or ')}. Defaults to claude-code.`,
				type: t.string().optional(),
			},
			sandbox: sandboxOption,
			backend: {
				description:
					"What runs the cases: `promptfoo` (the default), or `plugin-eval` for Claude Code's own `claude plugin eval`, which drives claude-code only and cannot run `script` checks.",
				type: t.string().optional(),
			},
			model: {
				description:
					"The model each run uses: a tier (`small`, `mid`, `top`) or a model ID. Defaults to the harness's mid-tier model, or its own default when its tiers are not known. A case's own `model` in evals.yaml wins over it. The judge keeps --judge.",
				type: t.string().optional(),
			},
			judge: {
				description:
					"The model that decides `judge` rubrics, on the harness the runs drive: a tier (`small`, `mid`, `top`) or a model ID. Defaults to the harness's mid-tier model, or its own default when its tiers are not known.",
				type: t.string().optional(),
			},
			'no-judge': {
				description: 'Run without a judge: the criteria whose checks are all `judge` are reported as not tested.',
				type: t.boolean().optional(),
			},
			baseline: {
				description: 'Another version of the skill to compare with, instead of a run without the skill.',
				type: t.string().optional(),
			},
			plugin: {
				description:
					"A plugin folder to load a dependency from, instead of the installed one: when the skill's plugin declares `dependencies`, each run loads them, and theirs, from these folders or else from Claude Code's installed plugins. Repeat it for more.",
				type: t.array(t.string()).optional(),
			},
			root: {
				description: 'The repository root the result is saved under. Defaults to the nearest folder holding `.git`.',
				type: t.string().optional(),
			},
			case: {
				description:
					"Run only the case with this ID: a case's own `id`, or `trigger-<n>` for the nth trigger case when it has none; repeat it for more. The result is marked partial and is compared with those cases' expected entries only; accepting it writes theirs only.",
				type: t.array(t.string()).optional(),
			},
			all: {
				description:
					"Run every case, not only the stale ones. Without it or --case, a case whose expected entry is current with its definition and its scope's inputs does not run.",
				type: t.boolean().optional(),
			},
			'trust-scripts': {
				description:
					"Run the setup scripts and `script` checks of a skill whose folder is outside the repository (`--root`, else the one holding the current directory). Without it, test lists them and reports the cases that need them as not run. Read them first: they run on this machine, contained to each run's folder with no network.",
				type: t.boolean().optional(),
			},
			resume: {
				description:
					'Run only the runs the last result left when the usage limit stopped it, with the options that run had, and merge them into it. Refused when the last result is not incomplete, or when the skill or its eval cases changed since; takes no --case, --all, --model, --judge, --no-judge, --baseline, --harness, or --backend.',
				type: t.boolean().optional(),
			},
			accept: {
				description:
					"After the run, also write the entry of each case it finished to the skill's `evals/expected.json`, the expected result that later runs compare with, leaving every other case's entry as it was. A case whose runs had sandbox failures is held back: accept it with `skill accept` once you have seen it. A case with a run at the usage limit gets no entry.",
				type: t.boolean().optional(),
			},
			estimate: {
				description:
					'Make no run: print how many runs the test plans (the stale cases only, unless --case or --all), its estimated cost (from the last saved result, else the default per-run cost), whether that is within the budget, and the `Test budget:` line to report. The budget is the one `skill-design.autonomy` sets under `## test budget`, unless --budget-cost or --budget-runs gives one.',
				type: t.boolean().optional(),
			},
			'budget-cost': {
				description: `The budget --estimate holds the cost to, in US dollars, instead of the one skill-design.autonomy sets. Defaults to ${defaultTestBudget.cost} when neither sets one.`,
				type: t.number().optional(),
			},
			'budget-runs': {
				description: `The budget --estimate holds the run count to when no cost is known, instead of the one skill-design.autonomy sets. Defaults to ${defaultTestBudget.runs} when neither sets one.`,
				type: t.number().optional(),
			},
		},
		examples: [
			{
				command: 'cyber-agentkit skill test .agents/skills/release-notes',
				description: 'Test one skill: run its stale cases only',
			},
			{
				command: 'cyber-agentkit skill test .agents/skills/release-notes --all',
				description: 'Run every case, current or not',
			},
			{
				command: 'cyber-agentkit skill test .agents/skills/release-notes --case two-prs --case trigger-1',
				description: 'Try a change on two cases only',
			},
			{
				command: 'cyber-agentkit skill test .agents/skills/release-notes --harness codex --model gpt-5.6-luna',
				description: 'Test it on Codex',
			},
			{
				command: 'cyber-agentkit skill test .agents/skills/release-notes --backend plugin-eval',
				description: 'Test it on `claude plugin eval`',
			},
			{
				command: 'cyber-agentkit skill test .agents/skills/release-notes --resume',
				description: 'Finish a test the usage limit stopped, once the limit resets',
			},
			{
				command: 'cyber-agentkit skill test .agents/skills/release-notes --accept',
				description: "Test it and keep the result as the skill's expected result",
			},
			{
				command: 'cyber-agentkit skill test .agents/skills/release-notes --estimate',
				description:
					'Estimate what the test costs, and whether it is within the configured test budget, without running it',
			},
		],
		async run(
			this: { format: Format; ui?: { displayLevel?: string } },
			args: {
				folder: string
				harness?: string | undefined
				sandbox?: string | undefined
				backend?: string | undefined
				model?: string
				judge?: string
				'no-judge'?: boolean | undefined
				baseline?: string
				plugin?: string[] | undefined
				root?: string | undefined
				accept?: boolean | undefined
				resume?: boolean | undefined
				'trust-scripts'?: boolean | undefined
				case?: string[] | undefined
				all?: boolean | undefined
				estimate?: boolean | undefined
				'budget-cost'?: number | undefined
				'budget-runs'?: number | undefined
			},
		) {
			const skill = readSkill(args.folder)
			if (!skill) {
				process.stderr.write(`error: skill-missing: no SKILL.md in ${args.folder}\n`)
				throw CliError.reported(exitCodes.error)
			}
			// A resume runs again with the options the incomplete result was made with (R163).
			let resume: { rows: Row[]; latest: TestResult; incomplete: Incomplete } | undefined
			if (args.resume) {
				const given = (
					[
						'case',
						'all',
						'model',
						'judge',
						'no-judge',
						'baseline',
						'harness',
						'backend',
						'sandbox',
						'estimate',
					] as const
				).filter((key) => args[key] !== undefined)
				if (given.length) {
					process.stderr.write(
						`error: resume-options: --resume runs with the options of the result it resumes; drop ${given.map((key) => `--${key}`).join(', ')}\n`,
					)
					throw CliError.reported(exitCodes.usage)
				}
				const name =
					typeof skill.frontmatter?.['name'] === 'string' ? (skill.frontmatter['name'] as string) : skill.folderName
				const folder = resultsFolder(resultsBase(args.root, homedir()), name)
				const latest = readLatest(folder)
				const incomplete = latest?.incomplete
				if (!latest || !incomplete) {
					process.stderr.write(
						`error: nothing-to-resume: the last test of ${name} is ${latest ? 'not incomplete' : 'not saved'}; run \`skill test\` without --resume\n`,
					)
					throw CliError.reported(exitCodes.error)
				}
				let rows: Row[] | undefined
				try {
					rows = incomplete.runs
						? (JSON.parse(readFileSync(join(folder, incomplete.runs), 'utf8')) as Row[])
						: undefined
				} catch {
					rows = undefined
				}
				if (!rows || !incomplete.options || !incomplete.fingerprint) {
					process.stderr.write(
						`error: resume-unavailable: the last test of ${name} kept no runs to resume from; run the whole test again\n`,
					)
					throw CliError.reported(exitCodes.error)
				}
				resume = { rows, latest, incomplete }
				args.harness = incomplete.options.harness
				args.backend = incomplete.options.backend
				args.case = incomplete.options.cases
				args.model = incomplete.options.model
				args.judge = incomplete.options.judge
				args['no-judge'] = incomplete.options.noJudge
				args.baseline = incomplete.options.baseline
				args['trust-scripts'] = incomplete.options.trustScripts
				args.sandbox = incomplete.options.sandbox
			}
			const harnessId = args.harness ?? 'claude-code'
			if (!(harnessIds as readonly string[]).includes(harnessId)) {
				process.stderr.write(
					`error: unknown-harness: no harness ${harnessId}; skill test drives ${skillTestHarnesses.join(', ')}\n`,
				)
				throw CliError.reported(exitCodes.usage)
			}
			const driver = skillTestHarness(harnessId as HarnessId)
			if ('problem' in driver) {
				process.stderr.write(`error: unsupported-harness: ${driver.problem}\n`)
				throw CliError.reported(exitCodes.usage)
			}
			// A tier becomes the harness's model, and with none named the runs take its mid tier (R161).
			const runModel = resolveModel(driver, args.model)
			if ('problem' in runModel) {
				process.stderr.write(`error: unknown-tier: ${runModel.problem}\n`)
				throw CliError.reported(exitCodes.usage)
			}
			const harness =
				runModel.model === undefined
					? driver
					: (skillTestHarness(harnessId as HarnessId, runModel.model) as SkillTestHarness)
			if (runModel.model === undefined)
				process.stderr.write(
					`warning: harness-default-model: ${harness.id} has no known mid-tier model, so each run uses its default; name one with --model\n`,
				)
			const backend = args.backend ?? 'promptfoo'
			if (backend !== 'promptfoo' && backend !== 'plugin-eval') {
				process.stderr.write(`error: unknown-backend: no backend ${backend}; use promptfoo or plugin-eval\n`)
				throw CliError.reported(exitCodes.usage)
			}
			if (backend === 'plugin-eval' && harness.id !== 'claude-code') {
				process.stderr.write(
					`error: unsupported-harness: the plugin-eval backend drives claude-code only, not ${harness.id}\n`,
				)
				throw CliError.reported(exitCodes.usage)
			}
			// The judge runs on the harness the runs drive, and with none named takes its mid tier, as the runs do (#357).
			if (args.judge !== undefined && args['no-judge']) {
				process.stderr.write('error: judge-conflict: --judge and --no-judge cannot be used together\n')
				throw CliError.reported(exitCodes.usage)
			}
			let judge: string | undefined
			if (!args['no-judge']) {
				const resolved = resolveModel(driver, args.judge)
				if ('problem' in resolved) {
					process.stderr.write(`error: unknown-tier: judge: ${resolved.problem}\n`)
					throw CliError.reported(exitCodes.usage)
				}
				judge = resolved.model ?? harnessDefault
			}
			if (args.all && args.case?.length) {
				process.stderr.write('error: case-conflict: --all runs every case; drop it, or drop --case\n')
				throw CliError.reported(exitCodes.usage)
			}
			const home = homedir()
			const layers = await referenceLayers({
				root: args.root,
				cwd: process.cwd(),
				home,
				platform: process.platform,
				env: process.env,
				plugin,
			})
			const verification = loadAspect('skill-design.aspects.verification', layers, (path) => collapseHome(home, path))
			const planOptions = {
				judge,
				...(args['no-judge'] ? { noJudge: 'it needs a judge, and the test ran with --no-judge' } : {}),
				threads,
			}
			let planned = planTest(skill, { ...planOptions, cases: args.case })
			if ('problem' in planned) {
				process.stderr.write(`error: ${planned.code}: ${planned.problem}\n`)
				throw CliError.reported(planned.code === 'unknown-case' ? exitCodes.usage : exitCodes.error)
			}
			// What the run's inputs hash to, recorded with it (R181), and what it depends on that selects nothing (R179).
			const hashed = inputHashes(skill, planned.plan.criteria, { resolve: runResolver(layers, skill.folder) })
			const scriptsHash = builtScriptsHash(skill)
			const inputs: InputHashes | undefined = hashed && {
				...hashed,
				reported: {
					...(scriptsHash ? { scripts: scriptsHash } : {}),
					harness: harness.id,
					verification: `${verification.name} from ${verification.implementation}`,
				},
			}
			// With no case named, only the stale cases run (R177); a resume runs what the stopped test planned.
			let selection: Selection | undefined
			const evalSet = readEvalSet(skill.folder, planned.plan.criteria)
			if (!args.case?.length && !args.all && !resume && inputs && evalSet) {
				selection = selectStale(evalSet, inputs, readExpectedFile(skill.folder, evalSet))
				if (selection.stale.length < evalSet.cases.length) {
					if (selection.stale.length) planned = planTest(skill, { ...planOptions, cases: selection.stale })
					else {
						const { judge: _judge, ...rest } = planned.plan
						planned = { plan: { ...rest, cases: [], notRun: [], only: [] }, warnings: planned.warnings }
					}
					if ('problem' in planned) {
						process.stderr.write(`error: ${planned.code}: ${planned.problem}\n`)
						throw CliError.reported(exitCodes.error)
					}
				}
			}
			for (const warning of planned.warnings) process.stderr.write(`warning: ${warning}\n`)
			if (planned.plan.judge === harnessDefault)
				process.stderr.write(
					`warning: harness-default-judge: ${harness.id} has no known mid-tier model, so the judge uses its default; name one with --judge\n`,
				)
			const modelled = resolvePlanModels(planned.plan, harness, args.model)
			if ('problem' in modelled) {
				process.stderr.write(`error: unknown-tier: ${modelled.problem}\n`)
				throw CliError.reported(exitCodes.usage)
			}
			planned.plan = modelled.plan
			// The scripts of a skill from outside the repository are listed, and run only when the author trusts them (R158).
			const repository = args.root === undefined ? findRoot(process.cwd()) : resolve(args.root)
			const scripts = planScripts(planned.plan)
			if (scripts.length && !isInside(repository, skill.folder)) {
				const listed = scripts
					.map(
						(item) =>
							`case ${item.case}: ${item.kind === 'setup' ? `setup script ${item.script}` : `script check \`${item.script}\``}`,
					)
					.join('; ')
				if (args['trust-scripts'])
					process.stderr.write(
						`warning: untrusted-scripts: ${skill.folder} is outside ${repository}; running its scripts, as --trust-scripts asks: ${listed}\n`,
					)
				else {
					process.stderr.write(
						`warning: untrusted-scripts: ${skill.folder} is outside ${repository}, so its scripts run only with --trust-scripts; read them first: ${listed}\n`,
					)
					planned.plan = withoutScripts(
						planned.plan,
						'it runs a script from outside this repository; read it, then pass --trust-scripts',
					)
				}
			}
			const fingerprint = backend === 'promptfoo' ? testFingerprint(planned.plan, skill.folder) : undefined
			if (resume && resume.incomplete.fingerprint !== fingerprint) {
				process.stderr.write(
					`error: resume-changed: the skill or its eval cases changed since the test ${resume.latest.at} stopped, so its runs cannot be merged; run the whole test again\n`,
				)
				throw CliError.reported(exitCodes.error)
			}
			if (args.estimate) {
				const skillName =
					typeof skill.frontmatter?.['name'] === 'string' ? (skill.frontmatter['name'] as string) : skill.folderName
				// With no budget option, the budget is the one `skill-design.autonomy` sets, resolved as `reference load`
				// resolves it, so the skill reports the line as printed instead of reading the reference itself (#238).
				const flagged = args['budget-cost'] !== undefined || args['budget-runs'] !== undefined
				const configured = flagged
					? undefined
					: parseTestBudget(resolveReference('skill-design.autonomy', layers).content)
				const estimate = estimateTest(
					skillName,
					planned.plan,
					lastResult(resultsFolder(resultsBase(args.root, home), skillName), skill.folder),
					harness.id,
					configured ?? {
						cost: args['budget-cost'] ?? defaultTestBudget.cost,
						runs: args['budget-runs'] ?? defaultTestBudget.runs,
					},
					flagged ? 'flags' : configured ? 'reference' : 'default',
				)
				const answered = selection ? { ...estimate, selected: selection } : estimate
				return result(answered, {
					render: {
						text: () =>
							`${
								selection
									? selectionLines(selection)
											.map((line) => `${line}\n`)
											.join('')
									: ''
							}${estimateText(estimate)}`,
					},
				})
			}
			// Every case is current: nothing runs, and the report says so (R177).
			if (selection && !selection.stale.length) {
				const nothing = {
					skill:
						typeof skill.frontmatter?.['name'] === 'string' ? (skill.frontmatter['name'] as string) : skill.folderName,
					ran: 0,
					selected: selection,
					notRun: planned.plan.notRun,
				}
				return result(nothing, {
					render: {
						text: () =>
							`${[
								`${nothing.skill}: nothing to run; every case is current with its expected entry`,
								...selectionLines(selection),
								...planned.plan.notRun.map((item) => notRunLine(item)),
								'run `skill test --all` to run every case',
							].join('\n')}\n`,
					},
				})
			}
			const sandbox = testSandbox(layers, args.sandbox)
			const name =
				typeof skill.frontmatter?.['name'] === 'string' ? (skill.frontmatter['name'] as string) : skill.folderName
			// Progress goes to stderr, never into the result, and `--silent` turns it off (R100).
			const report =
				this.ui?.displayLevel === 'none' ? undefined : (line: string) => void process.stderr.write(`${line}\n`)
			const resultFolder = resultsFolder(resultsBase(args.root, home), name)
			if (resume)
				report?.(
					`skill test: resuming ${resume.latest.at}: ${resume.incomplete.left.length} runs left of ${resume.latest.totalRuns ?? 'an unknown number'}; ${planned.plan.concurrency} at once`,
				)
			else report?.(planLine(planned.plan, lastResult(resultFolder, skill.folder)))
			const common = {
				plan: planned.plan,
				skill,
				skillName: name,
				baselineFolder: args.baseline === undefined ? undefined : resolve(args.baseline),
				model: modelled.model,
				judge,
				verification: `${verification.name} from ${verification.implementation}`,
				at: new Date().toISOString(),
			}
			const ran =
				backend === 'plugin-eval'
					? await runPluginEvalTest({
							...common,
							run: pluginEval,
							progress: report,
							listPlugins: list,
							scriptSandbox,
							sandbox,
						})
					: await runTest({
							...common,
							harness,
							sandbox,
							run,
							listPlugins: list,
							dependencies: {
								folders: (args.plugin ?? []).map((folder) => resolve(folder)),
								installed: await installed(),
							},
							progress: report ? { ...progress, write: report } : undefined,
							resume: resume && {
								rows: resume.rows,
								left: resume.incomplete.left,
								from: resume.latest.at,
								durationMs: resume.latest.durationMs,
							},
						})
			if ('problem' in ran) {
				process.stderr.write(`error: ${('code' in ran && ran.code) || `${backend}-failed`}: ${ran.problem}\n`)
				throw CliError.reported(exitCodes.error)
			}
			for (const warning of ran.warnings) process.stderr.write(`warning: ${warning}\n`)
			// An incomplete result keeps what a resume needs: the options it ran with, and what the skill and plan were (R163).
			const options: ResumeOptions = {
				harness: harness.id,
				backend,
				...(args.case?.length ? { cases: args.case } : planned.plan.only?.length ? { cases: planned.plan.only } : {}),
				...(args.model !== undefined ? { model: args.model } : {}),
				...(args.judge !== undefined ? { judge: args.judge } : {}),
				...(args['no-judge'] ? { noJudge: true as const } : {}),
				...(args.baseline !== undefined ? { baseline: args.baseline } : {}),
				...(args['trust-scripts'] ? { trustScripts: true } : {}),
				...(args.sandbox !== undefined ? { sandbox: args.sandbox } : {}),
			}
			// The run records what its inputs hashed to, so the entries it writes say what they were recorded against (R181).
			const recorded: TestResult = {
				...ran.result,
				...(inputs ? { inputs } : {}),
				...(selection ? { selected: selection } : {}),
			}
			const toSave: TestResult =
				recorded.incomplete && fingerprint
					? { ...recorded, incomplete: { ...recorded.incomplete, fingerprint, options } }
					: recorded
			const saved = saveResult(
				resultFolder,
				toSave,
				skill.folder,
				ran.replies,
				'rows' in ran ? (ran.rows as Row[]) : undefined,
			)
			const entries = withAttestedStatus([...saved.trigger, ...saved.criteria], skill.folder)
			const failed = entries.some((item) => item.status === 'fail')
			// A test in which no run finished is no pass (#322): every case not run.
			const noneRan = saved.cases.length > 0 && saved.cases.every((item) => item.status === 'not-run')
			// A planned skip is no failure, but a harness failure is (#327): a run that started and errored, a run the
			// sandbox broke (R154), even with the rest passing, or a test in which no run finished though the plan ran some case.
			const skipped = new Set(saved.notRun.filter((item) => notRunKind(item) === 'skipped').map((item) => item.case))
			const harnessFailed =
				saved.notRun.some((item) => notRunKind(item) === 'failed') ||
				!!saved.sandboxFailures?.length ||
				(noneRan && saved.cases.some((item) => !skipped.has(item.case)))
			// A mark the run passed fails the test until it is cleared, so a fix is noticed (#329).
			const fixed = !!saved.knownFailures?.some((item) => item.status === 'fixed')
			const written = writeExpectedEntries(saved, skill.folder, planned.plan.criteria, !!args.accept)
			const reported: TestResult = withAttested({ ...saved, ...written }, skill.folder)
			const answer = result(reported, { render: { text: () => testText(reported, resultFolder) } })
			if (failed || fixed || saved.incomplete || harnessFailed) answerThenFail(answer, this.format)
			return answer
		},
	})
}

/**
 * Writes the expected entries a test earns (R80, R181) and answers what the report says of them. With `accept`, every
 * case the run finished gets its entry, but a case whose runs had sandbox failures is held back until the author accepts
 * it with `skill accept` (R154). Without it, only a finished case with no entry whose runs passed, and whose
 * known-failure mark the run did not find fixed (#329), gets one; a case that
 * ran with no entry and did not pass gets none, and the report says why (#322). A case with a run at the usage limit
 * gets none either way (R162).
 */
function writeExpectedEntries(
	saved: TestResult,
	skillFolder: string,
	criteria: string[],
	accept: boolean,
): Pick<TestResult, 'expectedWritten' | 'notSavedAsExpected' | 'expectedHeld'> {
	const evalSet = readEvalSet(skillFolder, criteria)
	const expected = readExpected(skillFolder)
	const hasEntry = new Set(
		(expected?.cases ?? [])
			.filter((item) => item.status !== 'not-run' && item.status !== 'not-tested')
			.map((item) => item.case),
	)
	const finished = new Set(finishedCases(saved))
	const broken = sandboxFailedCases(saved)
	const statusOf = new Map(saved.cases.map((item) => [item.case, item.status]))
	// A case whose known-failure mark the run found fixed fails the test until the mark is cleared (#329).
	const outdated = new Set((saved.knownFailures ?? []).filter((k) => k.status === 'fixed').map((k) => k.case))
	const eligible = accept
		? [...finished]
		: [...finished].filter((id) => !hasEntry.has(id) && statusOf.get(id) === 'pass' && !outdated.has(id))
	const held = eligible.filter((id) => broken.has(id))
	const cases = eligible.filter((id) => !broken.has(id))
	const out: Pick<TestResult, 'expectedWritten' | 'notSavedAsExpected' | 'expectedHeld'> = {}
	if (cases.length) {
		const { written } = acceptResult(saved, skillFolder, cases, evalSet)
		if (written.length) out.expectedWritten = { by: accept ? 'accept' : 'pass', cases: written }
	}
	if (held.length) out.expectedHeld = held
	if (!accept) {
		const limited = new Set((saved.incomplete?.left ?? []).map((item) => item.case))
		const reasons: Record<string, string> = {
			fail: 'it failed',
			'known-failure': 'it is known to fail',
			'not-run': 'it was not run',
			'not-tested': 'it tests no criterion with a rubric',
		}
		const unsaved = saved.cases.flatMap((item) => {
			if (hasEntry.has(item.case) || broken.has(item.case)) return []
			if (item.status === 'pass')
				return outdated.has(item.case)
					? [{ case: item.case, reason: 'its known-failure mark is out of date; clear it first' }]
					: []
			if (saved.partial && !saved.partial.cases.includes(item.case)) return []
			const skipped = saved.notRun.find((entry) => entry.case === item.case)
			const reason = limited.has(item.case)
				? 'it has a run at the usage limit'
				: item.status === 'not-run' && skipped
					? `it was not run: ${skipped.reason}`
					: reasons[item.status]
			return reason ? [{ case: item.case, reason }] : []
		})
		if (unsaved.length) out.notSavedAsExpected = unsaved
	}
	return out
}

function attestCommand(_options: SkillCommandOptions): cli.Command {
	return command({
		name: 'attest',
		description:
			"Record that a `## Done when` criterion or an eval case passed in the skill's real use, where the link shows, instead of in a run. Writes it to the `attested` list of `evals/expected.json` with the link, the time, and a fingerprint of SKILL.md and its references, and keeps any run result there. Runs nothing. Only the skill's author attests a pass; an agent never records one on its own judgment.",
		arguments: [
			{ name: 'folder', description: 'The skill folder, holding its SKILL.md.', type: t.string() },
			{
				name: 'target',
				description: 'The criterion that passed, such as `C3`, or the ID of the case that passed.',
				type: t.string(),
			},
			{
				name: 'url',
				description: 'The link to where it passed, such as a merge request thread or a pipeline: an http or https URL.',
				type: t.string(),
			},
		],
		options: {
			note: { description: 'What happened there, in a sentence.', type: t.string().optional() },
			by: { description: 'Who saw it pass.', type: t.string().optional() },
		},
		examples: [
			{
				command:
					'cyber-agentkit skill attest .agents/skills/review-mr C3 https://gitlab.example.com/group/app/-/merge_requests/58#note_16308023 --note "held the design-question thread"',
				description: 'Attest that C3 passed on a real merge request',
			},
			{
				command:
					'cyber-agentkit skill attest .agents/skills/review-mr mixed-round https://gitlab.example.com/group/app/-/merge_requests/61',
				description: 'Attest that the case mixed-round passed',
			},
		],
		async run(
			this: { format: Format },
			args: { folder: string; target: string; url: string; note?: string | undefined; by?: string | undefined },
		) {
			const skill = readSkill(args.folder)
			if (!skill) {
				process.stderr.write(`error: skill-missing: no SKILL.md in ${args.folder}\n`)
				throw CliError.reported(exitCodes.error)
			}
			const name =
				typeof skill.frontmatter?.['name'] === 'string' ? (skill.frontmatter['name'] as string) : skill.folderName
			const usage = (code: string, message: string): never => {
				process.stderr.write(`error: ${code}: ${message}\n`)
				throw CliError.reported(exitCodes.usage)
			}
			let url: URL | undefined
			try {
				url = new URL(args.url)
			} catch {}
			if (!url || !/^https?:$/.test(url.protocol))
				usage('attest-evidence', `the link to where it passed must be an http or https URL; got ${args.url}`)
			// A criterion ID names a criterion; anything else names a case.
			const criteria = Object.keys(skillCriteria(skill))
			const plan = planTest(skill)
			const cases =
				'problem' in plan
					? []
					: [...plan.plan.cases.map((item) => item.id), ...plan.plan.notRun.map((item) => item.case)]
			const isCriterion = criteria.includes(args.target)
			if (!isCriterion && !cases.includes(args.target))
				usage(
					'unknown-target',
					`${args.target} is neither a criterion of ${name}'s \`## Done when\` (${criteria.join(', ') || 'none'}) nor one of its cases (${cases.join(', ') || 'none'})`,
				)
			const entry = {
				...(isCriterion ? { id: args.target } : { case: args.target }),
				status: 'pass',
				source: 'attested',
				evidence: args.url,
				...(args.note ? { note: args.note } : {}),
				...(args.by ? { by: args.by } : {}),
				at: new Date().toISOString(),
				skillFingerprint: skillFingerprint(skill.folder),
			} as Attestation
			let path: string
			try {
				path = recordAttestation(skill.folder, name, entry)
			} catch (error) {
				process.stderr.write(`error: result-unreadable: ${(error as Error).message}\n`)
				throw CliError.reported(exitCodes.error)
			}
			return result(
				{ skill: name, attested: entry, expected: path },
				{ render: { text: () => `attested ${attestedTarget(entry)} (${entry.evidence}) in ${path}\n` } },
			)
		},
	})
}

/** A mark as a line names it: `trigger-2`, or `mixed-round C3`. */
const markTarget = (mark: { case: string; criterion?: string | undefined }) =>
	mark.criterion === undefined ? mark.case : `${mark.case} ${mark.criterion}`

/** The command that clears a mark, for a `fixed?` line (#329). */
export function clearMarkCommand(folder: string | undefined, mark: { case: string; criterion?: string | undefined }) {
	return `cyber-agentkit skill fails ${folder ?? '<skill folder>'} ${markTarget(mark)} --clear`
}

function failsCommand(_options: SkillCommandOptions): cli.Command {
	return command({
		name: 'fails',
		description:
			"List, add, or clear the marks of the eval cases known to fail, as `it.fails` marks a test. A mark is the case's `fails` in `evals/evals.yaml`, with the reason: a trigger case's takes no criterion, an outcome case's names one of the criteria it tests. `skill test` judges a mark at the same threshold as a pass: below it, a known failure, which exits 0; at or above it, `fixed?`, which exits 1 until the mark is cleared. Marking one already marked replaces its reason. The edit keeps every comment and the layout of the rest of the file. Only the skill's author marks a known failure, with a reason; an agent never adds one to make a test pass.",
		arguments: [
			{ name: 'folder', description: 'The skill folder, holding its SKILL.md and evals/.', type: t.string() },
			{
				name: 'case',
				description:
					"The case to mark or clear, by its ID: a case's own `id`, or `trigger-<n>` for the nth trigger case when it has none. Leave it out to list every mark.",
				type: t.string().optional(),
			},
			{
				name: 'criterion',
				description:
					'For an outcome case, the criterion known to fail, such as `C3`. With --clear and no criterion, every mark of the case is cleared.',
				type: t.string().optional(),
			},
		],
		options: {
			reason: {
				description: 'Why it is known to fail: a sentence or a link, such as an issue. Required to mark one.',
				type: t.string().optional(),
			},
			clear: { description: 'Clear the mark instead of adding one.', type: t.boolean().optional() },
		},
		examples: [
			{
				command: 'cyber-agentkit skill fails .agents/skills/review-mr',
				description: 'List every mark, with its reason',
			},
			{
				command:
					'cyber-agentkit skill fails .agents/skills/review-mr mixed-round C3 --reason "resolves the design thread before the author answers (#341)"',
				description: 'Mark C3 of the case mixed-round as known to fail',
			},
			{
				command:
					'cyber-agentkit skill fails .agents/skills/review-mr trigger-2 --reason "description misses \'changelog\' (#340)"',
				description: 'Mark the second trigger case as known to fail',
			},
			{
				command: 'cyber-agentkit skill fails .agents/skills/review-mr mixed-round C3 --clear',
				description: 'Clear the mark once the skill is fixed',
			},
		],
		async run(
			this: { format: Format },
			args: {
				folder: string
				case?: string | undefined
				criterion?: string | undefined
				reason?: string | undefined
				clear?: boolean | undefined
			},
		) {
			const skill = readSkill(args.folder)
			if (!skill) {
				process.stderr.write(`error: skill-missing: no SKILL.md in ${args.folder}\n`)
				throw CliError.reported(exitCodes.error)
			}
			const name =
				typeof skill.frontmatter?.['name'] === 'string' ? (skill.frontmatter['name'] as string) : skill.folderName
			const fail = (problem: MarkProblem): never => {
				process.stderr.write(`error: ${problem.code}: ${problem.problem}\n`)
				throw CliError.reported(problem.code === 'evals-invalid' ? exitCodes.error : exitCodes.usage)
			}
			if (args.case === undefined) {
				if (args.reason !== undefined || args.clear || args.criterion !== undefined)
					fail({ code: 'unknown-case', problem: 'name the case to mark or clear' })
				const listed = listKnownFailures(skill.folder)
				if ('problem' in listed) return fail(listed)
				return result(
					{ skill: name, evals: listed.evals, marks: listed.marks },
					{
						render: {
							text: () =>
								listed.marks.length
									? `${listed.marks.length === 1 ? '1 mark' : `${listed.marks.length} marks`} of a known failure in ${listed.evals}:\n${listed.marks.map((mark) => `${markTarget(mark)} — ${mark.reason}\n`).join('')}`
									: `no case of ${name} is marked known to fail\n`,
						},
					},
				)
			}
			const target = { case: args.case, criterion: args.criterion }
			if (args.clear) {
				if (args.reason !== undefined)
					fail({ code: 'no-reason', problem: 'give --reason to mark a case, or --clear to clear its mark, not both' })
				const cleared = clearKnownFailure(skill.folder, target)
				if ('problem' in cleared) return fail(cleared)
				return result(
					{ skill: name, evals: cleared.evals, cleared: cleared.cleared },
					{
						render: {
							text: () =>
								cleared.cleared
									.map(
										(mark: KnownFailureMark) =>
											`cleared the mark on ${markTarget(mark)} (${mark.reason}) in ${cleared.evals}\n`,
									)
									.join(''),
						},
					},
				)
			}
			if (args.reason === undefined || args.reason.trim() === '')
				fail({
					code: 'no-reason',
					problem: `a mark needs the reason ${markTarget(target)} is known to fail: give --reason with a sentence or a link`,
				})
			const items = criteriaItems(skill)
			const criteria = items ? items.ids.filter((id): id is string => id !== undefined) : []
			const marked = markKnownFailure(skill.folder, target, args.reason as string, criteria)
			if ('problem' in marked) return fail(marked)
			return result(
				{
					skill: name,
					evals: marked.evals,
					mark: marked.mark,
					...(marked.replaced !== undefined ? { replaced: marked.replaced } : {}),
				},
				{
					render: {
						text: () =>
							`marked ${markTarget(marked.mark)} known to fail (${marked.mark.reason}) in ${marked.evals}${marked.replaced !== undefined ? `, replacing its reason (${marked.replaced})` : ''}\n`,
					},
				},
			)
		},
	})
}

function acceptCommand(_options: SkillCommandOptions): cli.Command {
	return command({
		name: 'accept',
		description:
			"Write the entry of each case the skill's last saved test result finished to its `evals/expected.json`, without running the test or spending anything, and leave every other case's entry as it was. A result of some cases (`--case`) writes theirs only; one the usage limit stopped writes no entry for a case with a run at the limit; an entry of a case the evals no longer hold is dropped. The expected result an accept changes moves to `evals/accepted/`, which keeps the 3 newest. Fails when there is no saved result, or when it finished no case.",
		arguments: [{ name: 'folder', description: 'The skill folder, holding its SKILL.md.', type: t.string() }],
		options: {
			root: {
				description: 'The repository root the result was saved under. Defaults to the nearest folder holding `.git`.',
				type: t.string().optional(),
			},
		},
		examples: [
			{
				command: 'cyber-agentkit skill accept .agents/skills/release-notes',
				description: 'Keep the cases of the last saved result as their expected entries',
			},
		],
		async run(this: { format: Format }, args: { folder: string; root?: string | undefined }) {
			const skill = readSkill(args.folder)
			if (!skill) {
				process.stderr.write(`error: skill-missing: no SKILL.md in ${args.folder}\n`)
				throw CliError.reported(exitCodes.error)
			}
			const name =
				typeof skill.frontmatter?.['name'] === 'string' ? (skill.frontmatter['name'] as string) : skill.folderName
			const latest = readLatest(resultsFolder(resultsBase(args.root, homedir()), name))
			if (!latest) {
				process.stderr.write(`error: no-result: no saved test result for ${name}; run \`skill test\` first\n`)
				throw CliError.reported(exitCodes.error)
			}
			const cases = finishedCases(latest)
			if (!cases.length) {
				process.stderr.write(
					`error: nothing-finished: the last test of ${name} finished no case, so it has no entry to accept; run \`skill test\`${latest.incomplete ? ' --resume after the limit resets' : ''}\n`,
				)
				throw CliError.reported(exitCodes.error)
			}
			const limited = [...new Set((latest.incomplete?.left ?? []).map((item) => item.case))]
			if (limited.length)
				process.stderr.write(
					`warning: limit-reached: the usage limit stopped the last test of ${name}, so ${limited.join(', ')} get no entry; run \`skill test --resume\` to finish them\n`,
				)
			if (latest.sandboxFailures?.length)
				process.stderr.write(
					`warning: sandbox-failures: ${latest.sandboxFailures.length} runs of this result were sandbox failures and count toward no pass rate; accepted as you asked\n`,
				)
			const accepted = acceptResult(
				latest,
				skill.folder,
				cases,
				readEvalSet(
					skill.folder,
					latest.criteria.map((item) => item.id),
				),
			)
			return result(
				{
					skill: name,
					accepted: latest.at,
					expected: accepted.path,
					cases: accepted.written,
					...(accepted.dropped.length ? { dropped: accepted.dropped } : {}),
				},
				{
					render: {
						text: () =>
							`accepted ${latest.at} into ${accepted.path}: ${accepted.written.join(', ')}\n${accepted.dropped.length ? `dropped the entries of cases no longer in the evals: ${accepted.dropped.join(', ')}\n` : ''}`,
					},
				},
			)
		},
	})
}

function carryCommand({ plugin }: SkillCommandOptions): cli.Command {
	return command({
		name: 'carry',
		description:
			"Carry expected entries forward to the skill's current inputs without a run, for a change that alters no behavior, such as a typo fix: each entry named takes the hashes of the case and its scope as they are now, and is marked carried with the reason, keeping its result and the date it was recorded. `test` and `report` show a carried entry as carried, never as a pass from a run. Name the cases with --case, or a whole scope with --scope: `trigger`, `root`, or the name of an instructions file with an eval folder. Runs nothing.",
		arguments: [
			{ name: 'folder', description: 'The skill folder, holding its SKILL.md and evals/.', type: t.string() },
		],
		options: {
			reason: {
				description: 'Why the change alters no behavior, kept with each entry carried.',
				type: t.string(),
			},
			case: {
				description: 'Carry the entry of the case with this ID; repeat it for more.',
				type: t.array(t.string()).optional(),
			},
			scope: {
				description:
					'Carry every entry of this scope: `trigger` for the trigger cases, `root` for the outcome cases of evals/evals.yaml, or `<name>` for those of evals/<name>/.',
				type: t.string().optional(),
			},
		},
		examples: [
			{
				command:
					"cyber-agentkit skill carry .agents/skills/release-notes --scope root --reason 'fixed a typo in the steps'",
				description: 'Carry every outcome entry past a typo fix',
			},
		],
		async run(
			this: { format: Format },
			args: { folder: string; reason: string; case?: string[] | undefined; scope?: string | undefined },
		) {
			const skill = readSkill(args.folder)
			if (!skill) {
				process.stderr.write(`error: skill-missing: no SKILL.md in ${args.folder}\n`)
				throw CliError.reported(exitCodes.error)
			}
			if (!args.reason.trim()) {
				process.stderr.write('error: no-reason: give the reason the change alters no behavior with --reason\n')
				throw CliError.reported(exitCodes.usage)
			}
			if (!args.case?.length === !args.scope) {
				process.stderr.write('error: carry-what: name the cases with --case, or one scope with --scope, not both\n')
				throw CliError.reported(exitCodes.usage)
			}
			const name =
				typeof skill.frontmatter?.['name'] === 'string' ? (skill.frontmatter['name'] as string) : skill.folderName
			const criteria = (criteriaItems(skill)?.ids ?? []).filter((id): id is string => id !== undefined)
			const evalSet = readEvalSet(skill.folder, criteria)
			// The inputs as a test hashes them, so a carried entry is current for the next test (R183).
			const home = homedir()
			const layers = await referenceLayers({
				cwd: process.cwd(),
				home,
				platform: process.platform,
				env: process.env,
				plugin,
			})
			const inputs = inputHashes(skill, criteria, { resolve: runResolver(layers, skill.folder) })
			if (inputs && args.scope !== undefined && !(args.scope in inputs.scopes)) {
				process.stderr.write(
					`error: unknown-scope: no scope ${args.scope}; the scopes are ${Object.keys(inputs.scopes).join(', ')}\n`,
				)
				throw CliError.reported(exitCodes.usage)
			}
			const file = readExpectedFile(skill.folder, evalSet)
			if (!file || !inputs || !evalSet) {
				process.stderr.write(
					`error: no-expected: ${name} has ${file ? 'no readable evals/evals.yaml' : 'no expected result to carry'}\n`,
				)
				throw CliError.reported(exitCodes.error)
			}
			const ids = args.scope
				? Object.entries(file.entries).flatMap(([id, entry]) =>
						(inputs.scopeOf?.[id] ?? entry.scope) === args.scope ? [id] : [],
					)
				: [...new Set(args.case ?? [])]
			const carried = carryEntries(file, ids, inputs, { reason: args.reason.trim(), at: new Date().toISOString() })
			if (carried.missing.length) {
				process.stderr.write(
					`error: no-entry: ${carried.missing.join(', ')} ${carried.missing.length === 1 ? 'has' : 'have'} no expected entry to carry; run \`skill test\` on ${carried.missing.length === 1 ? 'it' : 'them'} instead\n`,
				)
				throw CliError.reported(exitCodes.error)
			}
			if (!carried.carried.length) {
				process.stderr.write(`error: no-entry: the ${args.scope} scope has no expected entry to carry\n`)
				throw CliError.reported(exitCodes.error)
			}
			const path = writeExpectedFile(skill.folder, carried.file)
			return result(
				{ skill: name, expected: path, carried: carried.carried, reason: args.reason.trim() },
				{
					render: {
						text: () => `carried ${carried.carried.join(', ')} in ${path}: ${args.reason.trim()}\n`,
					},
				},
			)
		},
	})
}

function reportCommand(_options: SkillCommandOptions): cli.Command {
	return command({
		name: 'report',
		description:
			"Report a skill's accepted eval results for its docs: the summary and cost, the gap over the no-skill baseline, the trigger cases, each criterion with the skill and without, the outcome cases, runs the sandbox broke, and the trend over the kept accepted results. Reads `evals/expected.json` and `evals/accepted/` and runs nothing. Prints Markdown ready to paste into a docs page or README by default, or JSON for a site generator with `--format json`. Says so plainly when the skill has no accepted result.",
		arguments: [
			{ name: 'folder', description: 'The skill folder, holding its SKILL.md and evals/.', type: t.string() },
		],
		options: {
			'test-link': {
				description: 'Where the Markdown links `skill test`. Defaults to its page on the cyber-agentkit docs site.',
				type: t.string().optional(),
			},
		},
		examples: [
			{
				command: 'cyber-agentkit skill report .agents/skills/release-notes',
				description: "Print the skill's eval results as Markdown",
			},
			{
				command: 'cyber-agentkit skill report .agents/skills/release-notes --format json',
				description: 'Print them as JSON for a site generator',
			},
		],
		async run(this: { format: Format }, args: { folder: string; 'test-link'?: string | undefined }) {
			const skill = readSkill(args.folder)
			if (!skill) {
				process.stderr.write(`error: skill-missing: no SKILL.md in ${args.folder}\n`)
				throw CliError.reported(exitCodes.error)
			}
			const name =
				typeof skill.frontmatter?.['name'] === 'string' ? (skill.frontmatter['name'] as string) : skill.folderName
			let report: EvalReport
			try {
				report = readEvalReport(name, skill.folder, skillCriteria(skill))
			} catch (error) {
				process.stderr.write(`error: result-unreadable: ${(error as Error).message}\n`)
				throw CliError.reported(exitCodes.error)
			}
			return result(report, {
				render: { text: () => reportMarkdown(report, args['test-link'] ? { testLink: args['test-link'] } : {}) },
			})
		},
	})
}

function signalLines(signals: SupplyChainSignals): string[] {
	const lines: string[] = []
	const { publisher, maintenance, license } = signals
	if (publisher.available)
		lines.push(
			`publisher: ${publisher.login} (${publisher.kind}${publisher.verified ? ', verified' : ''}), ${publisher.trusted ? 'trusted' : 'not on the trust list'}`,
		)
	else lines.push(`publisher: unknown, ${publisher.reason}`)
	if (maintenance.available) {
		const commit =
			maintenance.lastCommit === null
				? 'no commit found'
				: `last commit ${maintenance.lastCommit.slice(0, 10)} (${maintenance.daysSinceCommit} days ago)`
		const release = maintenance.latestRelease
			? `latest release ${maintenance.latestRelease.tag} ${maintenance.latestRelease.published.slice(0, 10)}`
			: 'no release'
		lines.push(`maintenance: ${maintenance.status}, ${commit}, ${release}`)
	} else lines.push(`maintenance: unknown, ${maintenance.reason}`)
	if (license.available) lines.push(`license: ${license.repository ?? 'none'}`)
	else lines.push(`license: unknown, ${license.reason}`)
	return lines
}

function verdictText(report: SkillVetReport): string {
	if (report.blockedBy === 'untrusted-warning')
		return 'blocked: a Security check failed at warning, and no entry on the trust list covers the source'
	if (report.verdict === 'blocked') return 'blocked: a Security check failed at critical'
	return 'not blocked by a script check'
}

function trustLines({ trust }: SkillVetReport): string[] {
	const who = trust.by ? `trusted, covered by ${trust.by}` : 'not trusted, no entry on the trust list covers the source'
	const list =
		trust.list.length === 0
			? 'none'
			: trust.list.map(({ label, from }) => `${label} (from ${from.join(', ')})`).join('; ')
	return [`trust: ${who}`, `trusted sources: ${list}`]
}

function vetText(report: SkillVetReport): string {
	const { source } = report
	const at = [source.ref, source.commit?.slice(0, 12)].filter(Boolean).join(' at ')
	const lines = [
		`${source.repository ?? source.url}${source.path ? `/${source.path}` : ''}${at ? ` (${at})` : ''}: install ${verdictText(report)}`,
	]
	for (const skill of report.skills) {
		const r = skill.report
		lines.push(
			`${skill.path} (${r.skill}): ${r.failed} failed of which ${r.critical} critical, ${r.notChecked} not checked${skill.license ? `, license ${skill.license}` : ''}`,
		)
		if (skill.installs?.available)
			lines.push(`  installs via the skills CLI (skills.sh, opt-in telemetry): ${skill.installs.count}`)
		else if (skill.installs) lines.push(`  installs: not shown, ${skill.installs.reason}`)
		for (const aspect of r.aspects)
			for (const check of aspect.checks) {
				if (check.status === 'pass' || check.status === 'skipped') continue
				const where = check.file ? ` [${skill.path}/${check.file}]` : ''
				const severity = check.status === 'fail' && check.severity ? ` (${check.severity})` : ''
				lines.push(`  ${check.id} ${check.status}${severity}: ${check.message ?? ''}${where}`)
			}
	}
	if (report.signals) lines.push(...signalLines(report.signals))
	else lines.push(`signals: not read, the source is ${source.local ? 'a local folder' : 'not on GitHub'}`)
	lines.push(...trustLines(report))
	return `${lines.join('\n')}\n`
}

function vetCommand({
	plugin,
	fetchSource = cloneSource,
	githubGet: get = githubGet,
	skillsShGet = jsonGet,
	now = () => new Date(),
}: SkillCommandOptions): cli.Command {
	return command({
		name: 'vet',
		description: `Vet a third-party skill before installing it: check its source out (or copy a local folder) to a temporary folder, run every Security check on each skill in it, read who publishes it, whether it is maintained, its license, and its skills.sh install count, and remove the folder. Runs nothing from the source. Trusted sources come from the \`${trustListName}\` reference, merged across its tiers, and \`--trust\`. Exits 1 when the install is blocked: a critical Security check fails, or a warning one does and no trusted entry covers the source.`,
		arguments: [
			{
				name: 'source',
				description:
					'The source: `owner/repo`, `owner/repo/<path>`, a GitHub URL (with `/tree/<ref>/<path>`), an `https://` git URL, or a local folder written as a path (`./skills/x`, `/abs/path`, `~/x`).',
				type: t.string(),
			},
		],
		options: {
			ref: {
				description: 'The branch or tag to check out. Defaults to the default branch.',
				type: t.string().optional(),
			},
			path: {
				description:
					'The folder inside the repository holding the skill, or several. Defaults to the whole repository.',
				type: t.string().optional(),
			},
			trust: {
				description: `A source to trust for this run, on top of the \`${trustListName}\` reference: \`owner/repo\`, \`owner/*\`, an \`https://\` git URL, an absolute folder, or a \`{ source: github, repo: owner/repo, ref: v1 }\` mapping. It matches exactly, ref and path included; repeat it for more.`,
				type: t.array(t.string()).optional(),
			},
			root: {
				description:
					'The repository root whose references choose the Security aspect. Defaults to the nearest folder at or above the current directory holding `.git`.',
				type: t.string().optional(),
			},
		},
		examples: [
			{ command: 'cyber-agentkit skill vet acme/skills/release-notes', description: 'Vet one skill on GitHub' },
			{
				command: "cyber-agentkit skill vet acme/skills/release-notes --trust 'acme/*'",
				description: 'Vet a skill from an owner trusted for this run',
			},
			{
				command: 'cyber-agentkit skill vet ./vendor/skills/release-notes',
				description: 'Vet a skill in a local folder',
			},
		],
		async run(
			this: { format: Format },
			args: {
				source: string
				ref?: string | undefined
				path?: string | undefined
				trust?: string[] | undefined
				root?: string | undefined
			},
		) {
			const source = parseVetSource(
				args.source,
				{ ref: args.ref, path: args.path },
				{ cwd: process.cwd(), home: homedir() },
			)
			if ('problem' in source) {
				process.stderr.write(`error: bad-source: ${source.problem}\n`)
				throw CliError.reported(exitCodes.usage)
			}
			const home = homedir()
			const layers = await referenceLayers({
				root: args.root,
				cwd: process.cwd(),
				home,
				platform: process.platform,
				env: process.env,
				plugin,
			})
			const security = loadAspect('skill-design.aspects.security', layers, (path) => collapseHome(home, path))
			for (const warning of security.warnings) process.stderr.write(`warning: security: ${warning}\n`)
			const trust = readTrustList(layers, args.trust ?? [], (path) => collapseHome(home, path))
			for (const warning of trust.warnings) process.stderr.write(`warning: trust: ${warning}\n`)
			const vetted = await vetSkill({
				source,
				security,
				fetch: fetchSource,
				runScript: runCheckScript,
				github: get,
				skillsSh: skillsShGet,
				trusted: trust.sources,
				now: now(),
			})
			if ('problem' in vetted) {
				process.stderr.write(`error: ${vetted.code}: ${vetted.problem}\n`)
				throw CliError.reported(exitCodes.error)
			}
			const answer = result(vetted, { render: { text: vetText } })
			if (vetted.verdict === 'blocked') answerThenFail(answer, this.format)
			return answer
		},
	})
}

function caseText(verb: 'added' | 'removed', change: CaseChange): string {
	const lines = [`${verb} case ${change.case} ${verb === 'added' ? 'to' : 'from'} ${change.evals}`]
	for (const path of change.paths) lines.push(`${verb === 'added' ? 'made' : 'deleted'} ${path}`)
	return `${lines.join('\n')}\n`
}

function triedText(tried: TriedSetup): string {
	const lines = [
		`${tried.failed ? 'setup failed' : 'setup ran'} for case ${tried.case}; kept the run's folder at ${tried.folder} and its home at ${tried.home}`,
		'git status --porcelain:',
		tried.status.trimEnd() || '(clean)',
	]
	if (tried.said) lines.push('the setup printed:', tried.said)
	return `${lines.join('\n')}\n`
}

function caseFailure(failed: { code: string; problem: string }): never {
	process.stderr.write(`error: ${failed.code}: ${failed.problem}\n`)
	throw CliError.reported(
		['bad-case-id', 'bad-criterion', 'bad-check', 'bad-expect', 'outside-evals'].includes(failed.code)
			? exitCodes.usage
			: exitCodes.error,
	)
}

function caseCommand({ runPromptfoo: run = runPromptfoo, plugin }: SkillCommandOptions): cli.Command {
	const skillOf = (folder: string) => {
		const skill = readSkill(folder)
		if (!skill) {
			process.stderr.write(`error: skill-missing: no SKILL.md in ${folder}\n`)
			throw CliError.reported(exitCodes.error)
		}
		return skill
	}
	const add = command({
		name: 'add',
		description:
			"Add an outcome case to a skill: its entry in `evals/evals.yaml`, its files folder `evals/files/<case>/`, and with `--setup` a setup script `evals/setup/<case>.sh` that each run runs before the model starts, or with `--from` a copy of another case's. With `--expect`, add a trigger case instead: only its entry, with its ID. The entry goes after the last case of its kind, and every other entry keeps its formatting. Touches nothing outside the skill's `evals/` folder, and changes nothing when a case of that ID exists.",
		arguments: [
			{ name: 'folder', description: 'The skill folder, holding its SKILL.md.', type: t.string() },
			{
				name: 'case',
				description:
					"The case's ID, unique in the skill: letters, digits, '.', '_', and '-', not `trigger-<n>`. It names an outcome case's files folder and setup script.",
				type: t.string(),
			},
		],
		options: {
			prompt: { description: "The case's request, as a user would type it.", type: t.string() },
			expect: {
				description:
					'Add a trigger case that expects the skill to `fire` or `skip` on the prompt, instead of an outcome case. It takes none of the other options.',
				type: t.string().optional(),
			},
			setup: {
				description:
					'Also scaffold a setup script, for a case that needs a state plain files cannot hold, such as git history. With it, no files folder is made unless `--files` is given too.',
				type: t.boolean().optional(),
			},
			files: {
				description: 'Make the files folder too when `--setup` or `--from` is given.',
				type: t.boolean().optional(),
			},
			from: {
				description:
					"Start from another outcome case's setup: the new setup script `evals/setup/<case>.sh` is a copy of that case's, to edit, and the new case names that case's files folder unless `--files` is given. Implies `--setup`.",
				type: t.string().optional(),
			},
			criteria: {
				description: "The criteria the case tests, as comma-separated IDs from the skill's Criteria, such as `C1,C2`.",
				type: t.string().optional(),
			},
			check: {
				description:
					"A `script` check on a criterion, as `<ID>=<script>`: a shell command run in the run's folder that exits 0 to pass. Repeat it for more; its criterion joins the case's criteria.",
				type: t.array(t.string()).optional(),
			},
		},
		examples: [
			{
				command:
					"cyber-agentkit skill case add .agents/skills/release-notes two-prs --prompt 'write the release notes'",
				description: 'Add a case with a files folder',
			},
			{
				command:
					"cyber-agentkit skill case add .agents/skills/commit red-check --prompt 'commit the parser change' --setup",
				description: 'Add a case whose setup script makes its git history',
			},
			{
				command:
					"cyber-agentkit skill case add .agents/skills/commit clean-tree --prompt 'commit my change' --criteria C1 --check 'C2=test -z \"$(git status --porcelain)\"'",
				description: 'Add a case with its criteria and a script check',
			},
			{
				command:
					"cyber-agentkit skill case add .agents/skills/commit red-check-amend --prompt 'amend the last commit' --from red-check",
				description: "Add a case that starts from another case's setup script",
			},
			{
				command:
					"cyber-agentkit skill case add .agents/skills/release-notes changelog-v2 --prompt 'draft the changelog for v2' --expect fire",
				description: 'Add a trigger case with its own ID',
			},
		],
		async run(
			this: { format: Format },
			args: {
				folder: string
				case: string
				prompt: string
				expect?: string | undefined
				setup?: boolean | undefined
				files?: boolean | undefined
				from?: string | undefined
				criteria?: string | undefined
				check?: string[] | undefined
			},
		) {
			const skill = skillOf(args.folder)
			if (args.expect !== undefined) {
				if (args.expect !== 'fire' && args.expect !== 'skip')
					caseFailure({
						code: 'bad-expect',
						problem: `--expect ${JSON.stringify(args.expect)} is not \`fire\` or \`skip\``,
					})
				const outcomeOnly = (['setup', 'files', 'from', 'criteria', 'check'] as const).filter(
					(name) => args[name] !== undefined,
				)
				if (outcomeOnly.length)
					caseFailure({
						code: 'bad-expect',
						problem: `a trigger case takes no ${outcomeOnly.map((name) => `--${name}`).join(', ')}; those are for an outcome case`,
					})
				const added = addTriggerCase(skill.folder, args.case, { prompt: args.prompt, expect: args.expect })
				if ('problem' in added) caseFailure(added)
				return result(added, { render: { text: () => caseText('added', added) } })
			}
			const checks: CaseCheck[] = []
			for (const given of args.check ?? []) {
				const at = given.indexOf('=')
				if (at < 1 || at === given.length - 1)
					caseFailure({
						code: 'bad-check',
						problem: `--check ${JSON.stringify(given)} is not <ID>=<script>, such as C2='test -f notes.md'`,
					})
				checks.push({ criterion: given.slice(0, at).trim(), script: given.slice(at + 1) })
			}
			const added = addCase(skill.folder, args.case, {
				prompt: args.prompt,
				from: args.from,
				setup: args.setup || args.from !== undefined,
				files: args.files === true || (!args.setup && args.from === undefined),
				criteria: args.criteria
					?.split(',')
					.map((id) => id.trim())
					.filter(Boolean),
				checks,
			})
			if ('problem' in added) caseFailure(added)
			return result(added, { render: { text: () => caseText('added', added) } })
		},
	})
	const remove = command({
		name: 'remove',
		description:
			"Remove an outcome case from a skill: its entry in `evals/evals.yaml`, and the files folder and setup script it names when no other case names them. Refuses, changing nothing, when one of them is outside the skill's `evals/` folder.",
		arguments: [
			{ name: 'folder', description: 'The skill folder, holding its SKILL.md.', type: t.string() },
			{ name: 'case', description: "The outcome case's ID.", type: t.string() },
		],
		examples: [
			{
				command: 'cyber-agentkit skill case remove .agents/skills/release-notes two-prs',
				description: 'Remove a case and its files',
			},
		],
		async run(this: { format: Format }, args: { folder: string; case: string }) {
			const skill = skillOf(args.folder)
			const removed = removeCase(skill.folder, args.case)
			if ('problem' in removed) caseFailure(removed)
			return result(removed, { render: { text: () => caseText('removed', removed) } })
		},
	})
	const tryIt = command({
		name: 'try',
		description:
			"Run one outcome case's setup script alone, as `skill test` runs it: in a git repository holding the case's files, in the same script sandbox and empty home, with no model call. Prints the folder's `git status --porcelain` and what the setup printed, and keeps the run's folder and home under the skill's results path (`try/<case>/folder` and `try/<case>/home`, replaced by the next try), so nothing needs deleting. Exits 1 when the setup script fails.",
		arguments: [
			{ name: 'folder', description: 'The skill folder, holding its SKILL.md.', type: t.string() },
			{ name: 'case', description: 'The outcome case whose setup to try.', type: t.string() },
		],
		options: {
			sandbox: sandboxOption,
			harness: {
				description: `The harness whose isolation the run takes, which sets where its home and config live: ${skillTestHarnesses.join(', ')}. Defaults to claude-code.`,
				type: t.string().optional(),
			},
			root: {
				description:
					'The repository root, where the results path is and which decides whether the skill is inside the repository. Defaults to the one holding the current directory.',
				type: t.string().optional(),
			},
			'trust-scripts': {
				description:
					"Run the setup script of a skill whose folder is outside the repository. Read it first: it runs on this machine, contained to the run's folder with no network.",
				type: t.boolean().optional(),
			},
		},
		examples: [
			{
				command: 'cyber-agentkit skill case try .agents/skills/commit red-check',
				description: 'See the state the setup of red-check makes, without a model run',
			},
		],
		async run(
			this: { format: Format },
			args: {
				folder: string
				case: string
				harness?: string | undefined
				sandbox?: string | undefined
				root?: string | undefined
				'trust-scripts'?: boolean | undefined
			},
		) {
			const skill = skillOf(args.folder)
			const harnessId = args.harness ?? 'claude-code'
			const harness = (harnessIds as readonly string[]).includes(harnessId)
				? skillTestHarness(harnessId as HarnessId)
				: undefined
			if (!harness || 'problem' in harness) {
				process.stderr.write(
					`error: unknown-harness: no harness ${harnessId}; skill case try takes ${skillTestHarnesses.join(', ')}\n`,
				)
				throw CliError.reported(exitCodes.usage)
			}
			const planned = planTest(skill, { cases: [args.case] })
			if ('problem' in planned) {
				process.stderr.write(`error: ${planned.code}: ${planned.problem}\n`)
				throw CliError.reported(planned.code === 'unknown-case' ? exitCodes.usage : exitCodes.error)
			}
			const repository = args.root === undefined ? findRoot(process.cwd()) : resolve(args.root)
			if (!isInside(repository, skill.folder) && !args['trust-scripts']) {
				process.stderr.write(
					`error: untrusted-scripts: ${skill.folder} is outside ${repository}, so its setup script runs only with --trust-scripts; read it first\n`,
				)
				throw CliError.reported(exitCodes.error)
			}
			const name =
				typeof skill.frontmatter?.['name'] === 'string' ? (skill.frontmatter['name'] as string) : skill.folderName
			const results = resultsFolder(resultsBase(args.root, homedir()), name)
			// The try folder sits beside the skill's results, which ignore themselves.
			const ignore = join(results, '..', '.gitignore')
			mkdirSync(join(results, '..'), { recursive: true })
			if (!existsSync(ignore)) writeFileSync(ignore, '*\n')
			const layers = await referenceLayers({
				root: args.root,
				cwd: process.cwd(),
				home: homedir(),
				platform: process.platform,
				env: process.env,
				plugin,
			})
			const tried = await trySetup({
				plan: planned.plan,
				skillFolder: skill.folder,
				skillName: name,
				harness,
				keep: join(results, 'try', args.case),
				run,
				sandbox: testSandbox(layers, args.sandbox),
			})
			if ('problem' in tried) {
				process.stderr.write(`error: ${tried.code}: ${tried.problem}\n`)
				throw CliError.reported(tried.code === 'no-setup' ? exitCodes.usage : exitCodes.error)
			}
			const answer = result(tried, { render: { text: () => triedText(tried) } })
			if (tried.failed) answerThenFail(answer, this.format)
			return answer
		},
	})
	return command({
		name: 'case',
		description:
			"Add, remove, or try one outcome case of a skill: add and remove change its files and its `evals/evals.yaml` entry, without touching anything outside the skill's `evals/` folder; try runs its setup alone.",
		commands: [add, remove, tryIt],
	})
}

function whereCommand({ plugin }: SkillCommandOptions): cli.Command {
	return command({
		name: 'where',
		description:
			"Find a skill's folder from its name, among the folders each detected harness reads skills from and the repository's `skills` and `.agents/skills`. Given a folder holding a SKILL.md, gives that folder. Other commands that read a skill, such as the `reference` commands `advise`, `uses`, and `defaults`, take the folder this gives.",
		arguments: [{ name: 'skill', description: "The skill's name, or its folder.", type: t.string() }],
		options: {
			root: {
				description:
					'The repository root to search. Defaults to the nearest folder at or above the current directory holding `.git`.',
				type: t.string().optional(),
			},
		},
		examples: [{ command: 'cyber-agentkit skill where release-notes', description: "Find a skill's folder" }],
		async run(args: { skill: string; root?: string | undefined }) {
			const home = homedir()
			const layers = await referenceLayers({
				root: args.root,
				cwd: process.cwd(),
				home,
				platform: process.platform,
				env: process.env,
				plugin,
			})
			const found = findSkill({
				skill: args.skill,
				cwd: process.cwd(),
				root: layers.root ?? findRoot(process.cwd()),
				harnesses: layers.harnesses,
				also: layers.skills?.skills.map((skill) => skill.folder),
				home,
			})
			if ('found' in found) return result({ name: found.found.name, folder: collapseHome(home, found.found.folder) })
			process.stderr.write(`error: ${found.code}: ${found.message}\n`)
			if (found.code === 'skill-ambiguous')
				for (const folder of found.folders) process.stderr.write(`  ${collapseHome(home, folder)}\n`)
			throw CliError.reported(found.code === 'skill-not-found' ? exitCodes.usage : exitCodes.error)
		},
	})
}

/** One harness's examination: the skills it loads, checked as it reads them. */
export type HarnessDoctorReport = SkillDoctorReport & {
	/** The harness checked, or `unknown` when none is detected and only the harness-neutral files are read. */
	harness: HarnessId | 'unknown'
	/** How it was found: running this process, set in the environment beside another, installed on `PATH`, or declared. */
	source?: PresentHarnessSource
	/** Every way it was found, so a harness detected and declared lists both. */
	sources?: readonly PresentHarnessSource[]
}

/** `skill doctor`'s answer: one examination per harness checked. */
export type DoctorRunReport = {
	status: SkillDoctorReport['status']
	/** The harness running this process, as `detectHarness()` reports it. */
	running: HarnessId | 'unknown'
	harnesses: HarnessDoctorReport[]
}

function doctorSkillText(skill: SkillDoctorReport['skills'][number], lines: string[]): void {
	lines.push(
		`${skill.skill} (${skill.folder}): ${skill.status}${skill.references.length ? '' : ', loads no reference'}`,
	)
	for (const reference of skill.references) {
		const by = reference.answeredBy.length ? reference.answeredBy.join(' < ') : 'no tier'
		const file = reference.file ? ` [${reference.file}]` : ''
		lines.push(`  ${reference.name}: ${reference.status}, answered by ${by}${file}`)
		for (const { code, message, action } of reference.failures ?? [])
			lines.push(`    fail ${code}: ${message}`, `      ${action}`)
		for (const { code, message, action } of reference.warnings ?? [])
			lines.push(`    warning ${code}: ${message}`, `      ${action}`)
	}
	for (const { code, message, action } of skill.warnings ?? [])
		lines.push(`  warning ${code}: ${message}`, `    ${action}`)
	for (const note of skill.notes ?? []) lines.push(`  note: ${note}`)
}

/** `detected: running` or `declared`, or both, so the text marks how each harness came to be checked. */
function sourceLabel(sources: readonly PresentHarnessSource[]): string {
	const detected = sources.filter((source) => source !== 'declared')
	return [
		...(detected.length ? [`detected: ${detected.join(', ')}`] : []),
		...(sources.includes('declared') ? ['declared'] : []),
	].join('; ')
}

function doctorText(report: DoctorRunReport): string {
	const lines: string[] = []
	for (const section of report.harnesses) {
		if (report.harnesses.length > 1 || section.harness === 'unknown' || (section.sources ?? []).join() !== 'running')
			lines.push(
				section.harness === 'unknown'
					? 'harness unknown: no harness is detected running here, so only the harness-neutral files are read (SKILL.md and what it loads)'
					: `== ${section.harness} (${sourceLabel(section.sources ?? [section.source ?? 'running'])})`,
			)
		for (const skill of section.skills) doctorSkillText(skill, lines)
		const failed = section.skills.filter(({ status }) => status === 'failed').length
		const warned = section.skills.filter(({ status }) => status === 'warned').length
		lines.push(`${section.skills.length} skills: ${section.status} (${failed} failed, ${warned} warned)`)
		if (section.unverified) lines.push(`note: ${section.unverified}`)
	}
	return `${lines.join('\n')}\n`
}

function doctorCommand({ plugin }: SkillCommandOptions): cli.Command {
	return command({
		name: 'doctor',
		description:
			"Examine whether each skill's references work as installed and configured here, for the harness running now. Lists the references the skill loads, as `reference uses` does, and checks each one as `reference check` composes it through the managed, repo, user, plugin, and default tiers; for an interface whose implementations it loads, checks the interface and each implementation. For Codex it also checks the skill's `agents/openai.yaml`. Reports, per reference, the tiers that answer it, the file on top, and each failure or warning with what to do. Changes nothing. Given no skill, examines every skill the harness loads here. When no harness is detected, says so and reads only the harness-neutral files. `--all-harnesses` checks each harness detected on this machine or declared with `harness add` instead, one report per harness. Exits 1 when a reference fails; a warning alone exits 0.",
		arguments: [
			{
				name: 'skills',
				description: 'Skill names or folders. Leave them out to examine every skill each checked harness loads here.',
				type: t.array(t.string()).optional(),
			},
		],
		options: {
			root: {
				description:
					'The repository root whose references answer. Defaults to the nearest folder at or above the current directory holding `.git`.',
				type: t.string().optional(),
			},
			'all-harnesses': {
				description:
					'Check against every harness detected on this machine or declared, not only the one running now: the running harness, any other whose environment signals are set, each whose command is on PATH (`claude`, `codex`, `copilot`, `cursor-agent`, `gemini`, `qwen`), and each the repo or the user declares with `harness add`. Reports per harness.',
				type: t.boolean().optional(),
			},
		},
		examples: [
			{ command: 'cyber-agentkit skill doctor issue', description: "Examine one skill's references" },
			{ command: 'cyber-agentkit skill doctor', description: 'Examine every skill loaded here' },
			{
				command: 'cyber-agentkit skill doctor --all-harnesses',
				description: 'Examine every skill each harness on this machine loads',
			},
		],
		async run(
			this: { format: Format },
			args: { skills?: string[] | undefined; root?: string | undefined; 'all-harnesses'?: boolean | undefined },
		) {
			const home = homedir()
			const present = presentHarnesses({
				env: process.env,
				platform: process.platform,
				all: args['all-harnesses'],
				root: args.root,
				home,
			})
			for (const { message } of present.rejected ?? [])
				process.stderr.write(`warning: harness-declaration: ${message}\n`)
			const targets: {
				harness: HarnessId | 'unknown'
				source?: PresentHarnessSource
				sources?: readonly PresentHarnessSource[]
			}[] = present.harnesses.length
				? present.harnesses.map(({ harness, source, sources }) => ({ harness, source, sources }))
				: [{ harness: 'unknown' }]
			const layered = await Promise.all(
				targets.map(async (target) => ({
					...target,
					layers: await referenceLayers({
						root: args.root,
						cwd: process.cwd(),
						home,
						platform: process.platform,
						env: process.env,
						plugin,
						harnesses: target.harness === 'unknown' ? [] : [target.harness],
					}),
				})),
			)
			const first = (layered[0] as (typeof layered)[number]).layers
			const root = first.root ?? findRoot(process.cwd())
			const named = args.skills ?? []
			const skills = named.map((name) => {
				const found = findSkill({
					skill: name,
					cwd: process.cwd(),
					root,
					harnesses: present.harnesses.map(({ harness }) => harness),
					also: layered.flatMap(({ layers }) => layers.skills?.loaded?.map((skill) => skill.folder) ?? []),
					home,
				})
				if ('found' in found) return found.found
				process.stderr.write(`error: ${found.code}: ${found.message}\n`)
				if (found.code === 'skill-ambiguous')
					for (const folder of found.folders) process.stderr.write(`  ${collapseHome(home, folder)}\n`)
				throw CliError.reported(found.code === 'skill-not-found' ? exitCodes.usage : exitCodes.error)
			})
			if (!named.length && !layered.some(({ layers }) => layers.skills?.loaded?.length)) {
				const why = layered.flatMap(({ layers }) => (layers.skills?.unverified ? [layers.skills.unverified] : []))
				process.stderr.write(`error: no-skills: no skill is loaded here${why.length ? `: ${why.join('; ')}` : ''}\n`)
				throw CliError.reported(exitCodes.error)
			}
			const display = (path: string) => collapseHome(home, path)
			const harnesses = layered.map(({ harness, source, sources, layers }): HarnessDoctorReport => {
				const examined = named.length ? skills : (layers.skills?.loaded ?? [])
				const report = doctorSkills(examined, layers, { display, harness })
				return {
					harness,
					...(source ? { source } : {}),
					...(sources ? { sources } : {}),
					...report,
					...(!named.length && layers.skills?.unverified ? { unverified: layers.skills.unverified } : {}),
				}
			})
			const full: DoctorRunReport = {
				status: harnesses.some(({ status }) => status === 'failed')
					? 'failed'
					: harnesses.some(({ status }) => status === 'warned')
						? 'warned'
						: 'passed',
				running: present.running,
				harnesses,
			}
			const answer = result(full, { render: { text: doctorText } })
			if (full.status === 'failed') answerThenFail(answer, this.format)
			return answer
		},
	})
}

/** `skill`: the commands `/skill` runs without an agent. */
export function createSkillCommand(options: SkillCommandOptions = {}): cli.Command {
	return command({
		name: 'skill',
		description:
			"Work on agent skills as /skill does: find a skill's folder from its name, examine whether a skill's references work here, check a skill folder without running it, test it by running its evals, add or remove one of its eval cases, accept the cases of a test result as their expected entries, carry entries forward past a change that alters no behavior, attest a criterion or case that passed in real use, mark a case known to fail, report its accepted results for docs, or vet a third-party skill before installing it.",
		commands: [
			whereCommand(options),
			doctorCommand(options),
			checkCommand(options),
			testCommand(options),
			caseCommand(options),
			acceptCommand(options),
			carryCommand(options),
			attestCommand(options),
			failsCommand(options),
			reportCommand(options),
			vetCommand(options),
		],
	})
}
