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
	defaultReferencePath,
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

export function checkCommand(layersFor: LayersFor, path = defaultReferencePath): cli.Command {
	return command({
		name: 'check',
		description:
			'Check references, each composed as `load` composes it: an interface document against its shape, an implementation against its interface, and every document for the defects composing it raises. With no names, checks every name found. Every warning `load` raises is reported. A failure is an entry in `failed`, not an error; a warning never fails a check.',
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
		examples: [{ command: `${path} check`, description: 'Check every reference against its interface' }],
		async run(args: CommonArgs & { names?: string[] | undefined; trace: boolean | undefined }) {
			try {
				const home = homedir()
				const entries = checkReferences(await layersFor(args, home), {
					names: args.names ?? [],
					display: (path) => collapseHome(home, path),
				})
				const failing = entries.filter((entry) => entry.failures.length)
				const strip = (failures: { check: string; message: string }[]) =>
					failures.map(({ check, message }) => ({ check, message }))
				const report: ReferenceCheckReport = compact({
					failed: failing.map(({ name, loadedBy, failures, warnings }) =>
						compact({ name, loadedBy, failures: strip(failures), warnings }),
					),
					warned: entries
						.filter((entry) => !entry.failures.length && entry.warnings.length)
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
