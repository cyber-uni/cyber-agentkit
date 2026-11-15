import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { type Answer, CliError, type Format, printAnswer, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { type HarnessId, harnessIds } from '../harness/harness-id.js'
import { type InstalledPlugin, installedPlugins } from '../plugins/installed-plugins.js'
import { findRoot, type ReferencePlugin, referenceLayers } from '../references/reference-layers.js'
import { type FailOn, failOnPolicies, failsPolicy, type SkillCheckReport } from './check-skill.js'
import { combineReports, defaultSkillDirs, findSkills, type RepositoryCheckReport } from './check-skills.js'
import { addCase, type CaseChange, removeCase } from './eval-case.js'
import { doneWhenCriteria, type EvalReport, readEvalReport, reportMarkdown } from './eval-report.js'
import {
	type PluginEvalRun,
	runPluginEval,
	runPluginEvalTest,
	type ScriptSandboxInstall,
} from './plugin-eval-backend.js'
import { listPlugins, type PluginList } from './plugin-load.js'
import { runCheckScript } from './run-check-script.js'
import { aspectNames, loadAspect } from './skill-aspects.js'
import { checkSkill } from './skill-check.js'
import { readSkill } from './skill-files.js'
import {
	acceptResult,
	expectedPath,
	lastResult,
	type PromptfooRun,
	readLatest,
	resultsFolder,
	runPromptfoo,
	runTest,
	saveResult,
	testFingerprint,
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
import { defaultTestBudget, estimateTest, estimateText } from './test-estimate.js'
import { planScripts, planTest, withoutScripts } from './test-plan.js'
import { planLine } from './test-progress.js'
import type { CaseStatus, Incomplete, ResumeOptions, Row, TestResult } from './test-result.js'
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
			if (skill) {
				const report = checkSkill(skill, aspects, runCheckScript)
				const answer = result(report, { render: { text: textReport } })
				if (failsPolicy(report, failOn)) answerThenFail(answer, this.format)
				return answer
			}
			const reports = found.flatMap(({ folder }) => {
				const files = readSkill(folder)
				return files ? [{ folder, report: checkSkill(files, aspects, runCheckScript) }] : []
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

/** The text report; `folder` is where the result was saved, so the replies file is named in full. */
function testText(result: TestResult, folder?: string): string {
	const lines = [
		`${result.skill}: ${result.runs} runs per case, threshold ${result.threshold}, baseline ${result.baseline}${result.model ? `, model ${result.model === harnessDefault ? "the harness's default" : result.model}` : ''}`,
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
	for (const item of result.trigger)
		lines.push(
			`trigger ${item.case} (${item.expect}): ${item.status}, fired ${item.fired} of ${item.ran} — ${item.prompt}`,
		)
	for (const item of result.criteria) {
		const rate = item.ran === undefined ? '' : ` ${item.passed} of ${item.ran}`
		const base = item.baseline ? `, baseline ${item.baseline.passed} of ${item.baseline.ran}` : ''
		lines.push(
			`${item.id}${item.guard ? ' (guard)' : ''}: ${item.status}${rate}${base}${item.reason ? ` — ${item.reason}` : ''}`,
		)
		for (const failure of item.failures ?? [])
			lines.push(
				`  ${failure.case} run ${failure.run}: ${failure.output.split('\n').slice(0, 3).join(' ').slice(0, 200)}`,
			)
	}
	for (const item of result.cases) if (item.guard) lines.push(guardLine(item, result.threshold))
	for (const item of result.notRun) lines.push(`not run: ${item.case} — ${item.reason}`)
	for (const item of result.blocked ?? [])
		lines.push(
			`blocked: ${item.case} run ${item.run} (${item.arm}) tried to ${item.what === 'network' ? 'reach' : item.what} ${item.target}`,
		)
	if (result.replies) lines.push(`replies of every run: ${folder ? join(folder, result.replies) : result.replies}`)
	if (result.partial)
		lines.push(`partial: only ${result.partial.cases.join(', ')} ran; not saved as the expected result`)
	if (incomplete)
		lines.push(
			`incomplete: not saved as the expected result; run \`skill test --resume\` on the skill${incomplete.resets ? ` after the limit resets (${incomplete.resets})` : ' after the limit resets'} to run only the runs left`,
		)
	if (result.resumedFrom) lines.push(`resumed: holds the runs of ${result.resumedFrom} and the runs it had left`)
	if (result.savedAsExpected) lines.push('no expected result yet: saved this passing result as evals/expected.json')
	if (result.expectedHeld)
		lines.push(
			'not saved as evals/expected.json: it has sandbox failures; review it, then run `skill accept` on the skill to accept it anyway',
		)
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
			"Run a skill's evals (evals/evals.yaml) on promptfoo or `claude plugin eval`, several runs per case, each in a fresh folder, beside a run without the skill, and save the result. Makes model calls. Exits 1 when a case or criterion fails.",
		arguments: [
			{ name: 'folder', description: 'The skill folder, holding its SKILL.md and evals/.', type: t.string() },
		],
		options: {
			harness: {
				description: `The harness each run drives: ${skillTestHarnesses.join(' or ')}. Defaults to claude-code.`,
				type: t.string().optional(),
			},
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
				description: 'The model that decides `judge` rubrics. Without it, those criteria are not tested.',
				type: t.string().optional(),
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
					'Run only the case with this ID, an outcome case ID or `trigger-<n>`; repeat it for more. The result is marked partial, is compared for those cases only, and is never saved as the expected result.',
				type: t.array(t.string()).optional(),
			},
			'trust-scripts': {
				description:
					"Run the setup scripts and `script` checks of a skill whose folder is outside the repository (`--root`, else the one holding the current directory). Without it, test lists them and reports the cases that need them as not run. Read them first: they run on this machine, contained to each run's folder with no network.",
				type: t.boolean().optional(),
			},
			resume: {
				description:
					'Run only the runs the last result left when the usage limit stopped it, with the options that run had, and merge them into it. Refused when the last result is not incomplete, or when the skill or its eval cases changed since; takes no --case, --model, --judge, --baseline, --harness, or --backend.',
				type: t.boolean().optional(),
			},
			accept: {
				description:
					"After the run, also write its result to the skill's `evals/expected.json`, the expected result that later runs compare with. A result with sandbox failures is held back: accept it with `skill accept` once you have seen it.",
				type: t.boolean().optional(),
			},
			estimate: {
				description:
					'Make no run: print how many runs the test plans, its estimated cost (from the last saved result, else the default per-run cost), and whether that is within the budget.',
				type: t.boolean().optional(),
			},
			'budget-cost': {
				description: `The budget --estimate holds the cost to, in US dollars. Defaults to ${defaultTestBudget.cost}.`,
				type: t.number().optional(),
			},
			'budget-runs': {
				description: `The budget --estimate holds the run count to when no cost is known. Defaults to ${defaultTestBudget.runs}.`,
				type: t.number().optional(),
			},
		},
		examples: [
			{ command: 'cyber-agentkit skill test .agents/skills/release-notes', description: 'Test one skill' },
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
				command: 'cyber-agentkit skill test .agents/skills/release-notes --estimate --budget-cost 10 --budget-runs 60',
				description: 'Estimate what the test costs, and whether it is within a budget, without running it',
			},
		],
		async run(
			this: { format: Format; ui?: { displayLevel?: string } },
			args: {
				folder: string
				harness?: string | undefined
				backend?: string | undefined
				model?: string
				judge?: string
				baseline?: string
				plugin?: string[] | undefined
				root?: string | undefined
				accept?: boolean | undefined
				resume?: boolean | undefined
				'trust-scripts'?: boolean | undefined
				case?: string[] | undefined
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
			if (args.accept && args.case?.length) {
				process.stderr.write(
					'error: partial-accept: --accept cannot be used with --case; a partial result is never the expected result\n',
				)
				throw CliError.reported(exitCodes.usage)
			}
			// A resume runs again with the options the incomplete result was made with (R163).
			let resume: { rows: Row[]; latest: TestResult; incomplete: Incomplete } | undefined
			if (args.resume) {
				const given = (['case', 'model', 'judge', 'baseline', 'harness', 'backend', 'estimate'] as const).filter(
					(key) => args[key] !== undefined,
				)
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
				args.baseline = incomplete.options.baseline
				args['trust-scripts'] = incomplete.options.trustScripts
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
			const planned = planTest(skill, { judge: args.judge, cases: args.case, threads })
			if ('problem' in planned) {
				process.stderr.write(`error: ${planned.code}: ${planned.problem}\n`)
				throw CliError.reported(planned.code === 'unknown-case' ? exitCodes.usage : exitCodes.error)
			}
			for (const warning of planned.warnings) process.stderr.write(`warning: ${warning}\n`)
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
			const home = homedir()
			if (args.estimate) {
				const skillName =
					typeof skill.frontmatter?.['name'] === 'string' ? (skill.frontmatter['name'] as string) : skill.folderName
				const estimate = estimateTest(
					skillName,
					planned.plan,
					lastResult(resultsFolder(resultsBase(args.root, home), skillName), skill.folder),
					harness.id,
					{
						cost: args['budget-cost'] ?? defaultTestBudget.cost,
						runs: args['budget-runs'] ?? defaultTestBudget.runs,
					},
				)
				return result(estimate, { render: { text: () => estimateText(estimate) } })
			}
			const layers = await referenceLayers({
				root: args.root,
				cwd: process.cwd(),
				home,
				platform: process.platform,
				env: process.env,
				plugin,
			})
			const verification = loadAspect('skill-design.aspects.verification', layers, (path) => collapseHome(home, path))
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
				judge: args.judge,
				verification: `${verification.name} from ${verification.implementation}`,
				at: new Date().toISOString(),
			}
			const ran =
				backend === 'plugin-eval'
					? await runPluginEvalTest({ ...common, run: pluginEval, progress: report, listPlugins: list, scriptSandbox })
					: await runTest({
							...common,
							harness,
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
				...(args.case?.length ? { cases: args.case } : {}),
				...(args.model !== undefined ? { model: args.model } : {}),
				...(args.judge !== undefined ? { judge: args.judge } : {}),
				...(args.baseline !== undefined ? { baseline: args.baseline } : {}),
				...(args['trust-scripts'] ? { trustScripts: true } : {}),
			}
			const toSave: TestResult =
				ran.result.incomplete && fingerprint
					? { ...ran.result, incomplete: { ...ran.result.incomplete, fingerprint, options } }
					: ran.result
			const saved = saveResult(
				resultFolder,
				toSave,
				skill.folder,
				ran.replies,
				'rows' in ran ? (ran.rows as Row[]) : undefined,
			)
			const failed = [...saved.trigger, ...saved.criteria].some((item) => item.status === 'fail')
			// The first run that passes becomes the expected result when there is none (R80); an incomplete one never does (R162).
			const firstPass = !failed && !saved.partial && !saved.incomplete && !existsSync(expectedPath(skill.folder))
			// A result with sandbox failures becomes the expected one only by `skill accept`, once the author has seen it (R154).
			const held = (args.accept || firstPass) && !!saved.sandboxFailures?.length && !saved.incomplete
			if ((args.accept || firstPass) && !held && !saved.incomplete) acceptResult(saved, skill.folder)
			const reported: TestResult = held
				? { ...saved, expectedHeld: true }
				: !args.accept && firstPass
					? { ...saved, savedAsExpected: true }
					: saved
			const answer = result(reported, { render: { text: () => testText(reported, resultFolder) } })
			if (failed || saved.incomplete) answerThenFail(answer, this.format)
			return answer
		},
	})
}

function acceptCommand(_options: SkillCommandOptions): cli.Command {
	return command({
		name: 'accept',
		description:
			"Write the skill's last saved test result to its `evals/expected.json` as the expected result, without running the test or spending anything. The expected result it replaces moves to `evals/accepted/`, which keeps the 3 newest. Fails when there is no saved result.",
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
				description: 'Keep the last saved result as the expected result',
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
			if (latest.partial) {
				process.stderr.write(
					`error: partial-result: the last test of ${name} ran only ${latest.partial.cases.join(', ')}; run the whole test to accept it\n`,
				)
				throw CliError.reported(exitCodes.error)
			}
			if (latest.incomplete) {
				process.stderr.write(
					`error: incomplete-result: the usage limit stopped the last test of ${name} with ${latest.incomplete.left.length} runs left; run \`skill test --resume\` to finish it, then accept it\n`,
				)
				throw CliError.reported(exitCodes.error)
			}
			if (latest.sandboxFailures?.length)
				process.stderr.write(
					`warning: sandbox-failures: ${latest.sandboxFailures.length} runs of this result were sandbox failures and count toward no pass rate; accepted as you asked\n`,
				)
			const path = acceptResult(latest, skill.folder)
			return result(
				{ skill: name, accepted: latest.at, expected: path },
				{ render: { text: () => `accepted ${latest.at} as ${path}\n` } },
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
				report = readEvalReport(name, skill.folder, doneWhenCriteria(skill.body))
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

function caseFailure(failed: { code: string; problem: string }): never {
	process.stderr.write(`error: ${failed.code}: ${failed.problem}\n`)
	throw CliError.reported(
		failed.code === 'bad-case-id' || failed.code === 'outside-evals' ? exitCodes.usage : exitCodes.error,
	)
}

function caseCommand(_options: SkillCommandOptions): cli.Command {
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
			"Add an outcome case to a skill: its entry in `evals/evals.yaml`, its files folder `evals/files/<case>/`, and with `--setup` a setup script `evals/setup/<case>.sh` that each run runs before the model starts. Touches nothing outside the skill's `evals/` folder, and changes nothing when the case exists.",
		arguments: [
			{ name: 'folder', description: 'The skill folder, holding its SKILL.md.', type: t.string() },
			{
				name: 'case',
				description: "The case's ID: letters, digits, '.', '_', and '-'. It names its files folder and setup script.",
				type: t.string(),
			},
		],
		options: {
			prompt: { description: "The case's request, as a user would type it.", type: t.string() },
			setup: {
				description:
					'Also scaffold a setup script, for a case that needs a state plain files cannot hold, such as git history. With it, no files folder is made unless `--files` is given too.',
				type: t.boolean().optional(),
			},
			files: {
				description: 'Make the files folder too when `--setup` is given.',
				type: t.boolean().optional(),
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
		],
		async run(
			this: { format: Format },
			args: { folder: string; case: string; prompt: string; setup?: boolean | undefined; files?: boolean | undefined },
		) {
			const skill = skillOf(args.folder)
			const added = addCase(skill.folder, args.case, {
				prompt: args.prompt,
				setup: args.setup,
				files: args.files === true || !args.setup,
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
	return command({
		name: 'case',
		description:
			"Add or remove one outcome case of a skill, its files and its `evals/evals.yaml` entry, without touching anything outside the skill's `evals/` folder.",
		commands: [add, remove],
	})
}

/** `skill`: the commands `/skill` runs without an agent. */
export function createSkillCommand(options: SkillCommandOptions = {}): cli.Command {
	return command({
		name: 'skill',
		description:
			'Work on agent skills as /skill does: check a skill folder without running it, test it by running its evals, add or remove one of its eval cases, accept a test result as its expected result, report its accepted results for docs, or vet a third-party skill before installing it.',
		commands: [
			checkCommand(options),
			testCommand(options),
			caseCommand(options),
			acceptCommand(options),
			reportCommand(options),
			vetCommand(options),
		],
	})
}
