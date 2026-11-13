import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { type Answer, CliError, type Format, printAnswer, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { type HarnessId, harnessIds } from '../harness/harness-id.js'
import { findRoot, type ReferencePlugin, referenceLayers } from '../references/reference-layers.js'
import { type FailOn, failOnPolicies, failsPolicy, type SkillCheckReport } from './check-skill.js'
import { combineReports, defaultSkillDirs, findSkills, type RepositoryCheckReport } from './check-skills.js'
import { type PluginEvalRun, runPluginEval, runPluginEvalTest } from './plugin-eval-backend.js'
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
} from './skill-test.js'
import { skillTestHarness, skillTestHarnesses } from './skill-test-harness.js'
import { planTest } from './test-plan.js'
import { planLine } from './test-progress.js'
import type { TestResult } from './test-result.js'

export type SkillCommandOptions = {
	plugin?: ReferencePlugin | undefined
	/** How promptfoo runs; tests pass a fake. */
	runPromptfoo?: PromptfooRun | undefined
	/** How `claude plugin eval` runs; tests pass a fake. */
	runPluginEval?: PluginEvalRun | undefined
	/** How `skill test` polls the progress file and spaces its "still running" lines; tests shorten them. */
	progress?: { heartbeatMs?: number | undefined; pollMs?: number | undefined } | undefined
	/** The machine's hardware threads, which bound how many runs go at once (R103); tests set it. */
	threads?: number | undefined
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

/** The folder results live under: the repository root, or the home folder outside a repository. */
function resultsBase(rootOption: string | undefined, home: string): string {
	const root = rootOption === undefined ? findRoot(process.cwd()) : resolve(rootOption)
	return existsSync(join(root, '.git')) ? root : home
}

/** The text report; `folder` is where the result was saved, so the replies file is named in full. */
function testText(result: TestResult, folder?: string): string {
	const lines = [
		`${result.skill}: ${result.runs} runs per case, threshold ${result.threshold}, baseline ${result.baseline}`,
	]
	for (const item of result.trigger)
		lines.push(
			`trigger ${item.case} (${item.expect}): ${item.status}, fired ${item.fired} of ${item.ran} — ${item.prompt}`,
		)
	for (const item of result.criteria) {
		const rate = item.ran === undefined ? '' : ` ${item.passed} of ${item.ran}`
		const base = item.baseline ? `, baseline ${item.baseline.passed} of ${item.baseline.ran}` : ''
		lines.push(`${item.id}: ${item.status}${rate}${base}${item.reason ? ` — ${item.reason}` : ''}`)
		for (const failure of item.failures ?? [])
			lines.push(
				`  ${failure.case} run ${failure.run}: ${failure.output.split('\n').slice(0, 3).join(' ').slice(0, 200)}`,
			)
	}
	for (const item of result.notRun) lines.push(`not run: ${item.case} — ${item.reason}`)
	for (const item of result.blocked ?? [])
		lines.push(
			`blocked: ${item.case} run ${item.run} (${item.arm}) tried to ${item.what === 'network' ? 'reach' : item.what} ${item.target}`,
		)
	if (result.replies) lines.push(`replies of every run: ${folder ? join(folder, result.replies) : result.replies}`)
	if (result.partial)
		lines.push(`partial: only ${result.partial.cases.join(', ')} ran; not saved as the expected result`)
	if (result.savedAsExpected) lines.push('no expected result yet: saved this passing result as evals/expected.json')
	if (result.noPrevious) lines.push('no expected or previous result to compare with')
	else
		for (const item of result.changed ?? [])
			lines.push(`changed since ${result.comparedWith}: ${item.case} ${item.from} → ${item.to}`)
	return `${lines.join('\n')}\n`
}

function testCommand({
	plugin,
	runPromptfoo: run = runPromptfoo,
	runPluginEval: pluginEval = runPluginEval,
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
				description: "The model each run uses. Defaults to the harness's default.",
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
			root: {
				description: 'The repository root the result is saved under. Defaults to the nearest folder holding `.git`.',
				type: t.string().optional(),
			},
			case: {
				description:
					'Run only the case with this ID, an outcome case ID or `trigger-<n>`; repeat it for more. The result is marked partial, is compared for those cases only, and is never saved as the expected result.',
				type: t.array(t.string()).optional(),
			},
			accept: {
				description:
					"After the run, also write its result to the skill's `evals/expected.json`, the expected result that later runs compare with.",
				type: t.boolean().optional(),
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
				command: 'cyber-agentkit skill test .agents/skills/release-notes --accept',
				description: "Test it and keep the result as the skill's expected result",
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
				root?: string | undefined
				accept?: boolean | undefined
				case?: string[] | undefined
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
			const harnessId = args.harness ?? 'claude-code'
			if (!(harnessIds as readonly string[]).includes(harnessId)) {
				process.stderr.write(
					`error: unknown-harness: no harness ${harnessId}; skill test drives ${skillTestHarnesses.join(', ')}\n`,
				)
				throw CliError.reported(exitCodes.usage)
			}
			const harness = skillTestHarness(harnessId as HarnessId, args.model)
			if ('problem' in harness) {
				process.stderr.write(`error: unsupported-harness: ${harness.problem}\n`)
				throw CliError.reported(exitCodes.usage)
			}
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
			const name =
				typeof skill.frontmatter?.['name'] === 'string' ? (skill.frontmatter['name'] as string) : skill.folderName
			// Progress goes to stderr, never into the result, and `--silent` turns it off (R100).
			const report =
				this.ui?.displayLevel === 'none' ? undefined : (line: string) => void process.stderr.write(`${line}\n`)
			const resultFolder = resultsFolder(resultsBase(args.root, home), name)
			report?.(planLine(planned.plan, lastResult(resultFolder, skill.folder)))
			const common = {
				plan: planned.plan,
				skill,
				skillName: name,
				baselineFolder: args.baseline === undefined ? undefined : resolve(args.baseline),
				model: args.model,
				judge: args.judge,
				verification: `${verification.name} from ${verification.implementation}`,
				at: new Date().toISOString(),
			}
			const ran =
				backend === 'plugin-eval'
					? await runPluginEvalTest({ ...common, run: pluginEval, progress: report })
					: await runTest({
							...common,
							harness,
							run,
							progress: report ? { ...progress, write: report } : undefined,
						})
			if ('problem' in ran) {
				process.stderr.write(`error: ${('code' in ran && ran.code) || `${backend}-failed`}: ${ran.problem}\n`)
				throw CliError.reported(exitCodes.error)
			}
			for (const warning of ran.warnings) process.stderr.write(`warning: ${warning}\n`)
			const saved = saveResult(resultFolder, ran.result, skill.folder, ran.replies)
			const failed = [...saved.trigger, ...saved.criteria].some((item) => item.status === 'fail')
			// The first run that passes becomes the expected result when there is none (R80).
			const firstPass = !failed && !saved.partial && !existsSync(expectedPath(skill.folder))
			if (args.accept || firstPass) acceptResult(saved, skill.folder)
			const reported: TestResult = !args.accept && firstPass ? { ...saved, savedAsExpected: true } : saved
			const answer = result(reported, { render: { text: () => testText(reported, resultFolder) } })
			if (failed) answerThenFail(answer, this.format)
			return answer
		},
	})
}

function acceptCommand(_options: SkillCommandOptions): cli.Command {
	return command({
		name: 'accept',
		description:
			"Write the skill's last saved test result to its `evals/expected.json` as the expected result, without running the test or spending anything. Fails when there is no saved result.",
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
			const path = acceptResult(latest, skill.folder)
			return result(
				{ skill: name, accepted: latest.at, expected: path },
				{ render: { text: () => `accepted ${latest.at} as ${path}\n` } },
			)
		},
	})
}

/** `skill`: the commands `/skill` runs without an agent. */
export function createSkillCommand(options: SkillCommandOptions = {}): cli.Command {
	return command({
		name: 'skill',
		description:
			'Work on agent skills as /skill does: check a skill folder without running it, test it by running its evals, or accept a test result as its expected result.',
		commands: [checkCommand(options), testCommand(options), acceptCommand(options)],
	})
}
