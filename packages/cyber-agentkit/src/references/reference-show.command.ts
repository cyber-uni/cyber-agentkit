import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { type Answer, CliError, document, encode, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { checkResolved, interfaceLookup } from './reference-check.js'
import {
	answerThenFail,
	type CommonArgs,
	compact,
	defaultOption,
	displayTrace,
	errorText,
	fail,
	type LayersFor,
	rootOption,
	traceOption,
	traceText,
	usage,
	writeWarnings,
} from './reference-command-support.js'
import { parseReferenceName } from './reference-name.js'
import type { ReferenceWarning } from './reference-warning.js'
import { type ReferenceTrace, type ResolvedReference, resolveReference } from './resolve-reference.js'

/** `show`'s entry for a name: its content alone when `found` with nothing else to say, else a record. */
export type ReferenceShowEntry =
	| string
	| {
			name: string
			status: ResolvedReference['status']
			content?: string
			/** Set when the answer is not Markdown. */
			format?: string
			code?: string
			options?: string[]
			metadata?: Record<string, unknown>
			warnings?: ReferenceWarning[]
			trace?: ReferenceTrace
	  }

type ShowFlags = { metadata: boolean; trace: boolean }

function showEntry(resolved: ResolvedReference, home: string, { metadata, trace }: ShowFlags): ReferenceShowEntry {
	if (resolved.status === 'found' && !resolved.warnings.length && !metadata && !trace && resolved.format === 'markdown')
		return resolved.content as string
	return compact({
		name: resolved.name,
		status: resolved.status,
		content: resolved.content,
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
	toon: (entries: ReferenceShowEntry[]) => encode(entries, 'toon'),
	json: (entries: ReferenceShowEntry[]) => encode(entries, 'json'),
}

function showText(resolved: readonly ResolvedReference[]): Answer<string> | undefined {
	if (resolved.length === 1) {
		const [only] = resolved as [ResolvedReference]
		return only.content === undefined ? undefined : document(only.content)
	}
	const blocks = resolved.map((entry) =>
		entry.content === undefined
			? `<reference name="${entry.name}" status="${entry.status}" />`
			: `<reference name="${entry.name}">\n${entry.content}</reference>`,
	)
	return document(blocks.join('\n\n'))
}

export function showCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'show',
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
			if (!args.names.length) usage('name at least one reference.')
			try {
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
				const ok = resolved.every((entry) => entry.status === 'found')
				if (format === 'text') {
					for (const entry of resolved) {
						writeWarnings(entry.warnings)
						if (entry.status !== 'found') process.stderr.write(`error: ${entry.code}: ${errorText(entry)}\n`)
						if (args.trace) process.stderr.write(traceText(entry, home))
					}
					const answer = showText(resolved)
					if (answer === undefined) throw CliError.reported(exitCodes.error)
					return ok ? answer : answerThenFail(answer, format)
				}
				const flags = { metadata: Boolean(args.metadata), trace: Boolean(args.trace) }
				const answer = result(
					resolved.map((entry) => showEntry(entry, home, flags)),
					{ render: bareArray },
				)
				return ok ? answer : answerThenFail(answer, format)
			} catch (error) {
				return fail(error, 'Reference lookup failed.')
			}
		},
	})
}
