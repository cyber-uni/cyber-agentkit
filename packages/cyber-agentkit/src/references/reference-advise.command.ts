import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { adviseReferences, type ReferenceAdvice } from './reference-advise.js'
import {
	asCliError,
	type CommonArgs,
	compact,
	defaultReferencePath,
	type LayersFor,
	rootOption,
} from './reference-command-support.js'
import { type ReferenceUses, referenceUses } from './reference-uses.js'

export type ReferenceAdviseReport = ReferenceAdvice
export type ReferenceUsesReport = ReferenceUses
/** @deprecated `audit` is split into `advise` and `uses`; it is removed in the next minor release. */
export type ReferenceAuditReport = ReferenceAdvice & ReferenceUses & { deprecated: string }

const pathsArgument = {
	name: 'paths' as const,
	description: 'Files or folders an agent reads, such as a skill folder, an AGENTS.md, or an agent definition.',
	type: t.array(t.string()),
}

const alsoOption = {
	description: 'A term to flag as a provider lead in this run, such as a tracker name. Repeatable.',
	type: t.array(t.string()).optional(),
}

type PathArgs = { paths: string[]; also?: string[] | undefined }

/** Paths in a report as the user typed them, an absolute one with the home folder collapsed. */
function displayPaths<T extends { path: string } | { file: string }>(home: string, items: T[]): T[] {
	return items.map((item) =>
		'path' in item
			? { ...item, path: collapseHome(home, item.path) }
			: { ...item, file: collapseHome(home, item.file) },
	)
}

function advise(paths: string[], also: string[] | undefined, home: string): ReferenceAdvice {
	const report = adviseReferences({ paths, cwd: process.cwd(), also })
	return { ...report, files: displayPaths(home, report.files), leads: displayPaths(home, report.leads) }
}

async function uses(layersFor: LayersFor, args: CommonArgs & PathArgs, home: string): Promise<ReferenceUses> {
	const report = referenceUses(await layersFor(args, home), { paths: args.paths, cwd: process.cwd() })
	return report.loads
		? {
				...report,
				loads: report.loads.map((load) => ({ ...load, files: load.files.map((file) => collapseHome(home, file)) })),
			}
		: report
}

export function adviseCommand(path = defaultReferencePath): cli.Command {
	return command({
		name: 'advise',
		description:
			'Report what the given files or folders hard-code that could move into references: pattern leads (hosts, tools, paths, URLs, step lists, templates) with their lines, and the files read with their sizes. Works on any text an agent reads. Each lead is a suggestion for the author to judge, never a pass or fail. Writes nothing.',
		arguments: [pathsArgument],
		options: { also: alsoOption },
		examples: [
			{
				command: `${path} advise skills/file-bug`,
				description: 'Suggest what a skill folder could move into references',
			},
			{ command: `${path} advise AGENTS.md --also Teamwork`, description: 'Also flag a term the patterns do not know' },
		],
		async run(args: PathArgs) {
			try {
				return result(compact(advise(args.paths, args.also, homedir())))
			} catch (error) {
				return asCliError(error, 'Advise failed.')
			}
		},
	})
}

export function usesCommand(layersFor: LayersFor, path = defaultReferencePath): cli.Command {
	return command({
		name: 'uses',
		description:
			'List the references the given files or folders load with the `reference` skill: each name, the files that load it, whether a bundled default ships beside it (references/<name>.default.md), and which tiers answer it here; the interfaces whose implementations they load; and `gaps`, the names with no bundled default. Writes nothing.',
		arguments: [pathsArgument],
		options: { root: rootOption },
		examples: [{ command: `${path} uses skills/file-bug`, description: 'List the references a skill folder loads' }],
		async run(args: CommonArgs & PathArgs) {
			try {
				return result(compact(await uses(layersFor, args, homedir())))
			} catch (error) {
				return asCliError(error, 'Listing the references loaded failed.')
			}
		},
	})
}

export const auditDeprecation =
	'`reference audit` is deprecated and is removed in the next minor release: use `reference advise <paths>` for the leads and `reference uses <paths>` for the loads.'

/** @deprecated The alias kept for one minor release: `advise` and `uses` in one report, with a notice. */
export function auditCommand(layersFor: LayersFor, path = defaultReferencePath): cli.Command {
	return command({
		name: 'audit',
		description:
			'Deprecated: use `advise` for what the text hard-codes and `uses` for the references it loads. Runs both on the given files or folders and reports them together. Writes nothing.',
		arguments: [pathsArgument],
		options: { root: rootOption, also: alsoOption },
		examples: [{ command: `${path} audit skills/file-bug`, description: 'Deprecated: run advise and uses instead' }],
		async run(args: CommonArgs & PathArgs) {
			try {
				process.stderr.write(`warning: ${auditDeprecation}\n`)
				const home = homedir()
				const report: ReferenceAuditReport = {
					deprecated: auditDeprecation,
					...advise(args.paths, args.also, home),
					...(await uses(layersFor, args, home)),
				}
				return result(compact(report))
			} catch (error) {
				return asCliError(error, 'Audit failed.')
			}
		},
	})
}
