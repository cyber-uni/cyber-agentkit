import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { type Answer, CliError, type Format, printAnswer, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { type ReferencePlugin, referenceLayers } from '../references/reference-layers.js'
import type { SkillCheckReport } from './check-skill.js'
import { runCheckScript } from './run-check-script.js'
import { aspectNames, loadAspect } from './skill-aspects.js'
import { checkSkill } from './skill-check.js'
import { readSkill } from './skill-files.js'

export type SkillCommandOptions = { plugin?: ReferencePlugin | undefined }

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

/** `skill`: the commands `/skill` runs without an agent. */
export function createSkillCommand(options: SkillCommandOptions = {}): cli.Command {
	return command({
		name: 'skill',
		description: 'Work on agent skills as /skill does: check a skill folder without running it.',
		commands: [checkCommand(options)],
	})
}
