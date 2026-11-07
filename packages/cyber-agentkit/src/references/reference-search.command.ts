import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { empty, fullOption, result, truncateList } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { searchReferences } from './reference-catalog.js'
import {
	asCliError,
	type CommonArgs,
	compact,
	defaultReferencePath,
	type LayersFor,
	rootOption,
	traceOption,
} from './reference-command-support.js'

export type ReferenceSearchReport = {
	/** `10 of 21 total`, when more matched than are shown. */
	count?: string
	references: {
		name: string
		description?: string
		match: string
		folder?: string
		loadedBy?: string
		tier?: string
		plugin?: string
		skill?: string
	}[]
	/** Why some skills' defaults are not searched. */
	defaults?: string
}

/** The matches shown without `--full`. They come best first, so the cut keeps the best ones. */
export const searchLimit = 10

export function searchCommand(layersFor: LayersFor, path = defaultReferencePath): cli.Command {
	return command({
		name: 'search',
		description: 'Find references by name, description, tags, headings, or body, best match first.',
		arguments: [{ name: 'query', description: 'What the reference is about.', type: t.string() }],
		options: {
			root: rootOption,
			trace: { ...traceOption, description: 'Add the tier and plugin or skill of each match.' },
			full: { ...fullOption, description: `Show every match, not only the best ${searchLimit}.` },
		},
		examples: [{ command: `${path} search "worktree leases"`, description: 'Find references by topic' }],
		async run(args: CommonArgs & { query: string; trace: boolean | undefined; full: boolean | undefined }) {
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
				const shown = truncateList(matches, { limit: searchLimit, full: args.full })
				const report: ReferenceSearchReport = compact({
					count: shown.truncated ? shown.count : undefined,
					references: shown.items.map(({ name, description, match, folder, tier, plugin, skill, loadedBy }) =>
						compact(
							args.trace
								? { name, description, match, folder, loadedBy, tier, plugin, skill }
								: { name, description, match, folder, loadedBy },
						),
					),
					defaults,
				})
				return shown.truncated
					? result(report, { help: [`Run \`reference search ${JSON.stringify(query)} --full\` for every match.`] })
					: result(report)
			} catch (error) {
				return asCliError(error, 'Reference search failed.')
			}
		},
	})
}
