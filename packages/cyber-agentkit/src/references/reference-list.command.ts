import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { empty, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { listReferences } from './reference-catalog.js'
import type { ReferenceStatusCode, ReferenceWarning } from './reference-codes.js'
import {
	asCliError,
	type CommonArgs,
	compact,
	type LayersFor,
	rootOption,
	traceOption,
} from './reference-command-support.js'

export type ReferenceListReport = {
	references: {
		name: string
		description?: string
		format?: string
		status?: string
		code?: ReferenceStatusCode
		options?: string[]
	}[]
	/** Why some skills' defaults are not listed; left out when every detected harness's skill folders were read. */
	defaults?: string
	layers?: {
		name: string
		tier: string
		plugin?: string
		skill?: string
		path: string
		description?: string
		outcome: string
		selection?: boolean
		reachedBy?: string
	}[]
	warnings?: ReferenceWarning[]
}

export function listCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'list',
		description:
			'List every reference name, one row each, with its description, and its status when not found. A pattern keeps only the names it matches exactly.',
		arguments: [
			{
				name: 'pattern',
				description:
					'Exact name pattern, where `*` stands for any run of characters, such as `project-tracker.capabilities.*`.',
				type: t.string().optional(),
			},
		],
		options: {
			root: rootOption,
			trace: { ...traceOption, description: 'Add one row per name per layer holding it, with its outcome.' },
		},
		async run(args: CommonArgs & { pattern?: string | undefined; trace: boolean | undefined }) {
			try {
				const home = homedir()
				const display = (path: string) => collapseHome(home, path)
				const listing = listReferences(await layersFor(args, home), { display, pattern: args.pattern })
				const traced = args.trace && listing.layers.length > 0
				if (!listing.references.length && !traced && !listing.warnings.length) {
					return empty(args.pattern ? `0 references match "${args.pattern}"` : '0 references — no layer holds one', {
						help: [
							...(listing.defaults ? [listing.defaults] : []),
							args.pattern
								? 'Run `reference list` with no pattern for every name, or `reference search <query>` by topic.'
								: 'Run `reference create <name>` to start one.',
						],
					})
				}
				const report: ReferenceListReport = {
					references: listing.references.map((row) =>
						compact({
							name: row.name,
							description: row.description,
							format: row.format,
							status: row.status === 'found' ? undefined : row.status,
							code: row.code,
							options: row.options,
						}),
					),
				}
				if (listing.defaults) report.defaults = listing.defaults
				if (args.trace) report.layers = listing.layers.map((row) => compact({ ...row, path: display(row.path) }))
				if (listing.warnings.length) report.warnings = listing.warnings
				return result(report)
			} catch (error) {
				return asCliError(error, 'Reference listing failed.')
			}
		},
	})
}
