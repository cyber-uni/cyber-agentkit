import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { type Answer, document, encode, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { checkResolved, interfaceLookup } from './reference-check.js'
import type { ReferenceStatusCode, ReferenceWarning } from './reference-codes.js'
import {
	asCliError,
	type CommonArgs,
	compact,
	defaultOption,
	deliveredText,
	displayTrace,
	type LayersFor,
	notFoundTag,
	referenceTag,
	rootOption,
	traceOption,
	traceText,
	writeWarnings,
} from './reference-command-support.js'
import { ReferenceFailure } from './reference-error.js'
import { parseReferenceName, requireName } from './reference-name.js'
import { type ReferenceTrace, type ResolvedReference, resolveReference } from './resolve-reference.js'

/** `load`'s entry for a name: its content alone when `found` with nothing else to say, else a record. */
export type ReferenceLoadEntry =
	| string
	| {
			name: string
			status: ResolvedReference['status']
			content?: string
			/** What each folder below the root adds after the main document, in path order. */
			projectSections?: { folder: string; content: string }[]
			/** Set when the answer is not Markdown. */
			format?: string
			code?: ReferenceStatusCode
			options?: string[]
			metadata?: Record<string, unknown>
			warnings?: ReferenceWarning[]
			trace?: ReferenceTrace
	  }

type LoadFlags = { metadata: boolean; trace: boolean }

function loadEntry(resolved: ResolvedReference, home: string, { metadata, trace }: LoadFlags): ReferenceLoadEntry {
	if (
		resolved.status === 'found' &&
		!resolved.warnings.length &&
		!resolved.projectSections.length &&
		!metadata &&
		!trace &&
		resolved.format === 'markdown'
	)
		return resolved.content as string
	return compact({
		name: resolved.name,
		status: resolved.status,
		content: resolved.content,
		projectSections: resolved.projectSections.map(({ folder, content }) => ({ folder, content })),
		format: resolved.format === 'markdown' ? undefined : resolved.format,
		code: resolved.code,
		options: resolved.options,
		metadata: metadata ? resolved.metadata : undefined,
		warnings: resolved.warnings,
		trace: trace ? displayTrace(resolved.trace, home) : undefined,
	})
}

/** One entry per name asked, as the array itself rather than under a `result` key. */
const bareArray = {
	toon: (entries: ReferenceLoadEntry[]) => encode(entries, 'toon'),
	json: (entries: ReferenceLoadEntry[]) => encode(entries, 'json'),
}

/** One found name prints alone; several, and any name not `found`, print as `<reference>` tags in the order asked. */
function loadText(resolved: readonly ResolvedReference[]): Answer<string> {
	const tag = (entry: ResolvedReference) =>
		entry.status === 'found' ? referenceTag(entry.name, deliveredText(entry)) : notFoundTag(entry)
	if (resolved.length === 1) {
		const [only] = resolved as [ResolvedReference]
		return document(only.status === 'found' ? deliveredText(only) : notFoundTag(only))
	}
	return document(resolved.map(tag).join('\n\n'))
}

export function loadCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'load',
		description:
			'Print one or more references, each composed from its contributions as their extends and merge declare.',
		arguments: [
			{
				name: 'names',
				description: 'Reference names, without the `.md` extension; `<plugin>/<name>` builds that plugin’s own stack.',
				type: t.array(t.string()),
			},
		],
		options: {
			root: rootOption,
			default: defaultOption,
			metadata: {
				description: 'Make every entry a record with its status and composed frontmatter.',
				type: t.boolean().optional(),
			},
			trace: traceOption,
		},
		async run(
			args: CommonArgs & {
				names: string[]
				default: string | undefined
				metadata: boolean | undefined
				trace: boolean | undefined
			},
		) {
			const format = this.format
			try {
				if (!args.names.length) {
					throw new ReferenceFailure('name-missing', 'name at least one reference to load.', {
						help: 'Run `reference load <name>...`, or `reference list` for every name.',
					})
				}
				for (const name of args.names) requireName(name)
				const home = homedir()
				const layers = await layersFor(args, home)
				const display = (path: string) => collapseHome(home, path)
				const lookup = interfaceLookup(layers, { display })
				const resolved = args.names.map((name) => {
					const entry = resolveReference(parseReferenceName(name), layers, { display })
					for (const failure of checkResolved(entry, lookup).failures) {
						if (failure.check === 'compose') continue
						entry.warnings.push({
							code: 'interface-check',
							message: `it fails its interface check (${failure.check}): ${failure.message}`,
						})
					}
					return entry
				})
				if (format === 'text') {
					for (const entry of resolved) {
						writeWarnings(entry.warnings)
						if (args.trace) process.stderr.write(traceText(entry, home))
					}
					return loadText(resolved)
				}
				const flags = { metadata: Boolean(args.metadata), trace: Boolean(args.trace) }
				return result(
					resolved.map((entry) => loadEntry(entry, home, flags)),
					{ render: bareArray },
				)
			} catch (error) {
				return asCliError(error, 'Reference lookup failed.')
			}
		},
	})
}
