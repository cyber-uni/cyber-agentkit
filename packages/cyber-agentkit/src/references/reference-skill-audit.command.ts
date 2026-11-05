import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { asCliError, type CommonArgs, compact, type LayersFor, rootOption } from './reference-command-support.js'
import { auditSkill, type SkillAudit } from './reference-skill-audit.js'

export type ReferenceAuditReport = Omit<SkillAudit, 'loads' | 'interfaces' | 'gaps'> & {
	loads?: SkillAudit['loads']
	interfaces?: SkillAudit['interfaces']
	gaps?: SkillAudit['gaps']
}

export function auditCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'audit',
		description:
			'Report what a skill hard-codes that could move into references: its files, the references it loads and which ship a default, and pattern leads (hosts, tools, paths, URLs, step lists) with their lines. A lead is a candidate, never a verdict; the agent judges each and the user decides. Writes nothing.',
		arguments: [{ name: 'skill', description: "A skill's folder, or its name.", type: t.string() }],
		options: {
			root: rootOption,
			also: {
				description: 'A term to flag as a provider lead in this run, such as a tracker name. Repeatable.',
				type: t.array(t.string()).optional(),
			},
		},
		async run(args: CommonArgs & { skill: string; also: string[] | undefined }) {
			try {
				const home = homedir()
				const report = auditSkill(await layersFor(args, home), {
					skill: args.skill,
					cwd: process.cwd(),
					also: args.also,
				})
				return result(
					compact({
						...report,
						skill: { name: report.skill.name, folder: collapseHome(home, report.skill.folder) },
					}),
				)
			} catch (error) {
				return asCliError(error, 'Skill audit failed.')
			}
		},
	})
}
