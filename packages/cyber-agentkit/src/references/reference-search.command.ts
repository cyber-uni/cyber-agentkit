import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { empty, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { searchReferences } from './reference-catalog.js'
import {
	asCliError,
	type CommonArgs,
	compact,
	type LayersFor,
	rootOption,
	traceOption,
} from './reference-command-support.js'

export type ReferenceSearchReport = {
	references: {
		name: string
		description?: string
		match: string
		loadedBy?: string
		tier?: string
		plugin?: string
		skill?: string
	}[]
	/** Why some skills' defaults are not searched. */
	defaults?: string
}

export function searchCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'search',
		description: 'Find references by name, description, tags, headings, or body, best match first.',
		arguments: [{ name: 'query', description: 'What the reference is about.', type: t.string() }],
		options: {
			root: rootOption,
			trace: { ...traceOption, description: 'Add the tier and plugin or skill of each match.' },
		},
		async run(args: CommonArgs & { query: string; trace: boolean | undefined }) {
			const query = args.query.trim()
			try {
				const home = homedir()
				const { matches, defaults } = searchReferences(query, await layersFor(args, home), {
					display: (path) => collapseHome(home, path),
				})
				if (!matches.length) {
					return empty(`0 references match "${query}"`, {
						help: [...(defaults ? [defaults] : []), 'Try other words, or run `reference list` for every name.'],
					})
				}
				const report: ReferenceSearchReport = compact({
					references: matches.map(({ name, description, match, tier, plugin, skill, loadedBy }) =>
						compact(
							args.trace
								? { name, description, match, loadedBy, tier, plugin, skill }
								: { name, description, match, loadedBy },
						),
					),
					defaults,
				})
				return result(report)
			} catch (error) {
				return asCliError(error, 'Reference search failed.')
			}
		},
	})
}
