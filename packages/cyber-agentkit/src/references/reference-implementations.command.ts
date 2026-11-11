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
	defaultReferencePath,
	type LayersFor,
	rootOption,
	traceOption,
} from './reference-command-support.js'
import { ReferenceFailure } from './reference-error.js'
import { type ReferenceImplementations, referenceImplementations } from './reference-implementations.js'

export type ReferenceImplementationsReport = {
	implementations: {
		pin: string
		description?: string
		unsupported?: string[]
		name?: string
		tier?: string
		version?: number
	}[]
	/** A `one` interface's implementation in use (R129): a pin, or `default`; absent when the name is not found. */
	inUse?: string
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

/** `implementations <prefix>.*`: each matched interface in name order, as `implementations <id>` reports it (R134). */
export type ReferenceFamilyImplementationsReport = {
	family: string
	interfaces: (ReferenceImplementationsReport & { interface: string })[]
}

function rowsOf(found: ReferenceImplementations, trace: boolean | undefined) {
	return found.implementations.map(({ pin, description, unsupported, name, tier, version }) =>
		compact(
			trace
				? { pin, description, unsupported, name, tier, version }
				: { pin, ...(tier === 'plugin' ? {} : { tier }), description, unsupported },
		),
	)
}

function reportOf(found: ReferenceImplementations, trace: boolean | undefined): ReferenceImplementationsReport {
	const report: ReferenceImplementationsReport = { implementations: rowsOf(found, trace) }
	if (found.inUse !== undefined) report.inUse = found.inUse
	if (trace) {
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
	return report
}

export function implementationsCommand(layersFor: LayersFor, path = defaultReferencePath): cli.Command {
	return command({
		name: 'implementations',
		description:
			'List the implementations of an interface a consumer can load, each with its pin, description, and unsupported sections.',
		arguments: [
			{
				name: 'id',
				description:
					'Interface id, the name of its `<id>.interface` document without the suffix; or a family, `<prefix>.*`, for every interface under the prefix.',
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
				command: `${path} implementations my-interface`,
				description: 'List what implements an interface',
			},
			{
				command: `${path} implementations my-skill.aspects.*`,
				description: 'List, for every interface under a prefix, what implements it and which one is in use',
			},
		],
		async run(args: CommonArgs & { id: string; accept: string | undefined; trace: boolean | undefined }) {
			try {
				const accept = parseAccept(args.accept)
				const home = homedir()
				const options = { accept, display: (path: string) => collapseHome(home, path) }
				const found = referenceImplementations(args.id, await layersFor(args, home), options)
				if ('family' in found) {
					const family = found
					const shown: ReferenceFamilyImplementationsReport = {
						family: family.family,
						interfaces: family.interfaces.map((each) => ({ ...reportOf(each, args.trace), interface: each.interface })),
					}
					return result(shown)
				}
				const report = reportOf(found, args.trace)
				if (!report.implementations.length && report.inUse === undefined && !args.trace) {
					return empty(`0 implementations of ${args.id}`, {
						help: `Run \`reference implementations ${args.id} --trace\` for the ones left out, with why.`,
					})
				}
				return result(report)
			} catch (error) {
				return asCliError(error, 'Implementation lookup failed.')
			}
		},
	})
}
