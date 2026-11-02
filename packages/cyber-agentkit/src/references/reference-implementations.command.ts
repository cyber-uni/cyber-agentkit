import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import {
	type CommonArgs,
	compact,
	fail,
	type LayersFor,
	rootOption,
	traceOption,
	usage,
} from './reference-command-support.js'
import { referenceImplementations } from './reference-implementations.js'
import type { ReferenceWarning } from './reference-warning.js'

export type ReferenceImplementationsReport = {
	implementations:
		| { pin: string; description?: string; unsupported?: string[]; name?: string; tier?: string; version?: number }[]
		| string
	interface?: string
	cardinality?: string
	accept?: number[]
	excluded?: { name: string; reasons: string[] }[]
	warnings?: ReferenceWarning[]
}

function parseAccept(value: string | undefined): number[] | undefined {
	if (value === undefined) return undefined
	const versions = value.split(',').map((part) => part.trim())
	if (!versions.length || versions.some((part) => !/^[1-9]\d*$/.test(part))) {
		usage(`--accept is a comma-separated list of versions, such as 1,2; got "${value}".`)
	}
	return versions.map(Number)
}

export function implementationsCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'implementations',
		description:
			'List the implementations of an interface a consumer can load, each with its pin, description, and unsupported sections.',
		arguments: [
			{
				name: 'id',
				description: 'Interface id, the name of its `<id>.interface` document without the suffix.',
				type: t.string(),
			},
		],
		options: {
			root: rootOption,
			accept: {
				description:
					"Versions the consumer knows, comma-separated, such as 1,2. Defaults to the interface's `versions`.",
				type: t.string().optional(),
			},
			trace: {
				...traceOption,
				description:
					"Add each one's name, tier, and version, the interface's cardinality and accepted versions, and the ones left out with why.",
			},
		},
		async run(args: CommonArgs & { id: string; accept: string | undefined; trace: boolean | undefined }) {
			const accept = parseAccept(args.accept)
			try {
				const home = homedir()
				const found = referenceImplementations(args.id, await layersFor(args, home), {
					accept,
					display: (path) => collapseHome(home, path),
				})
				const rows = found.implementations.map(({ pin, description, unsupported, name, tier, version }) =>
					compact(
						args.trace ? { pin, description, unsupported, name, tier, version } : { pin, description, unsupported },
					),
				)
				const report: ReferenceImplementationsReport = {
					implementations: rows.length ? rows : `0 implementations of ${args.id}`,
				}
				if (args.trace) {
					Object.assign(
						report,
						compact({
							interface: found.interface,
							cardinality: found.cardinality,
							accept: found.accept,
							excluded: found.excluded,
							warnings: found.warnings,
						}),
					)
				}
				return result(report)
			} catch (error) {
				return fail(error, 'Implementation lookup failed.')
			}
		},
	})
}
