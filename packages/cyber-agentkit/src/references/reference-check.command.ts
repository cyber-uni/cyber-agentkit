import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { checkReferences } from './reference-check.js'
import type { ReferenceWarning } from './reference-codes.js'
import {
	asCliError,
	type CommonArgs,
	compact,
	type LayersFor,
	rootOption,
	traceOption,
} from './reference-command-support.js'

export type ReferenceCheckReport = {
	failed?: {
		name: string
		loadedBy?: string
		failures: { check: string; message: string }[]
		warnings?: ReferenceWarning[]
	}[]
	/** The entries that pass with a warning, which never fails a check. */
	warned?: { name: string; loadedBy?: string; warnings: ReferenceWarning[] }[]
	passed: number
	references?: {
		name: string
		loadedBy?: string
		kind: string
		status: string
		failures?: { check: string; message: string }[]
		unsupported?: string[]
		warnings?: ReferenceWarning[]
	}[]
}

export function checkCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'check',
		description:
			'Check interface documents and their implementations, each composed as `load` composes it. With no names, checks every one found and warns of hidden files. A failure is an entry in `failed`, not an error; a warning never fails a check.',
		arguments: [
			{
				name: 'names',
				description: 'Reference names, without the `.md` extension; `<plugin>/<name>` builds that plugin’s own stack.',
				type: t.array(t.string()).optional(),
			},
		],
		options: {
			root: rootOption,
			trace: { ...traceOption, description: 'Add every entry checked, with its kind and unsupported sections.' },
		},
		async run(args: CommonArgs & { names?: string[] | undefined; trace: boolean | undefined }) {
			try {
				const home = homedir()
				const entries = checkReferences(await layersFor(args, home), {
					names: args.names ?? [],
					display: (path) => collapseHome(home, path),
				})
				const failing = entries.filter((entry) => entry.status !== 'passed')
				const strip = (failures: { check: string; message: string }[]) =>
					failures.map(({ check, message }) => ({ check, message }))
				const report: ReferenceCheckReport = compact({
					failed: failing.map(({ name, loadedBy, failures, warnings }) =>
						compact({ name, loadedBy, failures: strip(failures), warnings }),
					),
					warned: entries
						.filter((entry) => entry.status === 'passed' && entry.warnings.length)
						.map(({ name, loadedBy, warnings }) => compact({ name, loadedBy, warnings })),
					passed: entries.length - failing.length,
					references: args.trace
						? entries.map(({ name, loadedBy, kind, status, failures, unsupported, warnings }) =>
								compact({ name, loadedBy, kind, status, failures: strip(failures), unsupported, warnings }),
							)
						: undefined,
				})
				return result(report)
			} catch (error) {
				return asCliError(error, 'Reference check failed.')
			}
		},
	})
}
