import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { empty, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import type { ReferenceWarning } from './reference-codes.js'
import {
	asCliError,
	type CommonArgs,
	compact,
	type LayersFor,
	rootOption,
	traceOption,
} from './reference-command-support.js'
import { ReferenceFailure } from './reference-error.js'
import { referenceImplementations } from './reference-implementations.js'

export type ReferenceImplementationsReport = {
	implementations: {
		pin: string
		description?: string
		unsupported?: string[]
		name?: string
		tier?: string
		version?: number
	}[]
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
		throw new ReferenceFailure(
			'option-invalid',
			`--accept is a comma-separated list of versions, such as 1,2; got "${value}".`,
			{ details: { option: '--accept', value } },
		)
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
		examples: [
			{
				command: 'cyber-agentkit reference implementations my-interface',
				description: 'List what implements an interface',
			},
		],
		async run(args: CommonArgs & { id: string; accept: string | undefined; trace: boolean | undefined }) {
			try {
				const accept = parseAccept(args.accept)
				const home = homedir()
				const found = referenceImplementations(args.id, await layersFor(args, home), {
					accept,
					display: (path) => collapseHome(home, path),
				})
				const rows = found.implementations.map(({ pin, description, unsupported, name, tier, version }) =>
					compact(
						args.trace
							? { pin, description, unsupported, name, tier, version }
							: { pin, ...(tier === 'plugin' ? {} : { tier }), description, unsupported },
					),
				)
				if (!rows.length && !args.trace) {
					return empty(`0 implementations of ${args.id}`, {
						help: `Run \`reference implementations ${args.id} --trace\` for the ones left out, with why.`,
					})
				}
				const report: ReferenceImplementationsReport = { implementations: rows }
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
				return asCliError(error, 'Implementation lookup failed.')
			}
		},
	})
}
