import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { type Answer, CliError, type Format, printAnswer, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { findRoot, type ReferencePlugin, referenceLayers } from '../references/reference-layers.js'
import type { SkillCheckReport } from './check-skill.js'
import { runCheckScript } from './run-check-script.js'
import { aspectNames, loadAspect } from './skill-aspects.js'
import { checkSkill } from './skill-check.js'
import { readSkill } from './skill-files.js'
import { type PromptfooRun, resultsFolder, runPromptfoo, runTest, saveResult } from './skill-test.js'
import { planTest } from './test-plan.js'
import type { TestResult } from './test-result.js'

export type SkillCommandOptions = {
	plugin?: ReferencePlugin | undefined
	/** How promptfoo runs; tests pass a fake. */
	runPromptfoo?: PromptfooRun | undefined
}

function answerThenFail(answer: Answer<any>, format: Format): never {
	const text = printAnswer(answer, format)
	if (text !== undefined) process.stdout.write(text)
	throw CliError.reported(exitCodes.error)
}

function textReport(report: SkillCheckReport): string {
	const lines = [
		`${report.skill}: ${report.status} (${report.passed} passed, ${report.failed} failed, ${report.notChecked} not checked)`,
	]
	for (const aspect of report.aspects) {
		lines.push(`${aspect.aspect} (${aspect.implementation}): ${aspect.status}`)
		for (const check of aspect.checks) {
			if (check.status === 'pass') continue
			const where = check.file ? ` [${check.file}]` : ''
			const needs = check.needs ? ` (needs /skill ${check.needs})` : ''
			lines.push(
				`  ${check.id} ${check.status}: ${check.message ?? ''}${where}${check.status === 'not-checked' ? needs : ''}`,
			)
		}
	}
	return `${lines.join('\n')}\n`
}

function checkCommand({ plugin }: SkillCommandOptions): cli.Command {
	return command({
		name: 'check',
		description:
			'Check a skill folder against every aspect without running it: the checks a script decides pass or fail, and every other check is listed as not checked. Exits 1 when any check fails.',
		arguments: [{ name: 'folder', description: 'The skill folder, holding its SKILL.md.', type: t.string() }],
		options: {
			root: {
				description:
					'The repository root whose references choose each aspect. Defaults to the nearest folder at or above the current directory holding `.git`.',
				type: t.string().optional(),
			},
		},
		examples: [{ command: 'cyber-agentkit skill check .agents/skills/release-notes', description: 'Check one skill' }],
		async run(this: { format: Format }, args: { folder: string; root?: string | undefined }) {
			const skill = readSkill(args.folder)
			if (!skill) {
				process.stderr.write(`error: skill-missing: no SKILL.md in ${args.folder}\n`)
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
			const report = checkSkill(skill, aspects, runCheckScript)
			const answer = result(report, { render: { text: textReport } })
			if (report.failed) answerThenFail(answer, this.format)
			return answer
		},
	})
}

function testText(result: TestResult): string {
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
	if (result.noPrevious) lines.push('no previous result to compare with')
	else for (const item of result.changed ?? []) lines.push(`changed: ${item.case} ${item.from} → ${item.to}`)
	return `${lines.join('\n')}\n`
}

function testCommand({ plugin, runPromptfoo: run = runPromptfoo }: SkillCommandOptions): cli.Command {
	return command({
		name: 'test',
		description:
			"Run a skill's evals (evals/evals.yaml) on promptfoo, several runs per case, each in a fresh folder, beside a run without the skill, and save the result. Makes model calls. Exits 1 when a case or criterion fails.",
		arguments: [
			{ name: 'folder', description: 'The skill folder, holding its SKILL.md and evals/.', type: t.string() },
		],
		options: {
			model: {
				description: 'The model each run uses. Defaults to the Agent SDK default.',
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
		},
		examples: [{ command: 'cyber-agentkit skill test .agents/skills/release-notes', description: 'Test one skill' }],
		async run(
			this: { format: Format },
			args: { folder: string; model?: string; judge?: string; baseline?: string; root?: string | undefined },
		) {
			const skill = readSkill(args.folder)
			if (!skill) {
				process.stderr.write(`error: skill-missing: no SKILL.md in ${args.folder}\n`)
				throw CliError.reported(exitCodes.error)
			}
			const planned = planTest(skill, { judge: args.judge })
			if ('problem' in planned) {
				process.stderr.write(`error: ${planned.code}: ${planned.problem}\n`)
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
			const verification = loadAspect('skill-design.aspects.verification', layers, (path) => collapseHome(home, path))
			const name =
				typeof skill.frontmatter?.['name'] === 'string' ? (skill.frontmatter['name'] as string) : skill.folderName
			const ran = await runTest({
				plan: planned.plan,
				skill,
				skillName: name,
				baselineFolder: args.baseline === undefined ? undefined : resolve(args.baseline),
				model: args.model,
				judge: args.judge,
				verification: `${verification.name} from ${verification.implementation}`,
				at: new Date().toISOString(),
				run,
			})
			if ('problem' in ran) {
				process.stderr.write(`error: promptfoo-failed: ${ran.problem}\n`)
				throw CliError.reported(exitCodes.error)
			}
			for (const warning of ran.warnings) process.stderr.write(`warning: ${warning}\n`)
			const root = args.root === undefined ? findRoot(process.cwd()) : resolve(args.root)
			const base = existsSync(join(root, '.git')) ? root : home
			const saved = saveResult(resultsFolder(base, name), ran.result)
			const answer = result(saved, { render: { text: testText } })
			const failed = [...saved.trigger, ...saved.criteria].some((item) => item.status === 'fail')
			if (failed) answerThenFail(answer, this.format)
			return answer
		},
	})
}

/** `skill`: the commands `/skill` runs without an agent. */
export function createSkillCommand(options: SkillCommandOptions = {}): cli.Command {
	return command({
		name: 'skill',
		description:
			'Work on agent skills as /skill does: check a skill folder without running it, or test it by running its evals.',
		commands: [checkCommand(options), testCommand(options)],
	})
}
