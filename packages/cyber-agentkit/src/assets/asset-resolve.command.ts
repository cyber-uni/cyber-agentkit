import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { type Answer, CliError, document, encode, type Format, isCliError, printAnswer, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { listAssetNames } from './asset-catalog.js'
import { type AssetLayers, type AssetPlugin, type AssetWarning, assetLayers } from './asset-layers.js'
import { parseAssetName } from './asset-name.js'
import { whereAsset } from './asset-where.js'
import { type AssetTrace, type ResolvedAsset, resolveAsset } from './resolve-asset.js'

export type AssetResolveCommandOptions = {
	/** The plugin running the command; see `AssetLayerOptions['plugin']`. */
	plugin?: AssetPlugin | undefined
}

type AssetShowEntry =
	| string
	| {
			name: string
			status: ResolvedAsset['status']
			content?: string
			/** Set when the answer is not Markdown. */
			format?: string
			code?: string
			options?: string[]
			metadata?: Record<string, unknown>
			warnings?: AssetWarning[]
			trace?: AssetTrace
	  }

type CommonArgs = { root: string | undefined }

const rootOption = {
	description:
		'Directory the project tier is read from, and each folder above it up to the repository root; a project write goes to its `.agents/references/`. Defaults to the current directory.',
	type: t.string().optional(),
}

const traceOption = {
	description: 'Add the trace: every layer checked, with its outcome, and how the result was built.',
	type: t.boolean().optional(),
}

const defaultOption = {
	description: "The calling skill's folder: its `references/<name>.default.md` joins as the `default` tier.",
	type: t.string().optional(),
}

type LayersFor = (args: CommonArgs & { default?: string | undefined }, home: string) => Promise<AssetLayers>

function layerSource(plugin: AssetPlugin | undefined): LayersFor {
	return (args, home) =>
		assetLayers({
			root: args.root ?? process.cwd(),
			home,
			platform: process.platform,
			env: process.env,
			plugin,
			defaultSkill: args.default,
		})
}

/** A field with nothing to say is left out: `undefined`, an empty string, or an empty list. */
function compact<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(
			([, field]) => field !== undefined && field !== '' && !(Array.isArray(field) && !field.length),
		),
	) as T
}

/** stderr, not stdout: an agent parses stdout. Rethrows what the cli already reports. */
function fail(error: unknown, fallback: string): never {
	if (isCliError(error)) throw error
	process.stderr.write(`error: ${error instanceof Error ? error.message : fallback}\n`)
	throw CliError.reported(exitCodes.error)
}

function usage(message: string): never {
	process.stderr.write(`error: usage: ${message}\n`)
	throw CliError.reported(exitCodes.usage)
}

/** An answer with a failing exit code: the cli prints only what a returned answer holds, so print it first. */
function answerThenFail(answer: Answer<any>, format: Format): never {
	const text = printAnswer(answer, format)
	if (text !== undefined) process.stdout.write(text)
	throw CliError.reported(exitCodes.error)
}

function writeWarnings(warnings: readonly AssetWarning[]): void {
	for (const { code, message } of warnings) process.stderr.write(`warning: ${code}: ${message}\n`)
}

function displayTrace(trace: AssetTrace, home: string): AssetTrace {
	const show = (path: string) => collapseHome(home, path)
	return {
		...trace,
		contributions: trace.contributions.map((row) => ({ ...row, path: show(row.path) })),
		layers: trace.layers.map((layer) => ({ ...layer, path: show(layer.path) })),
	}
}

/** The text trace: a summary line, then each layer. */
function traceText(resolved: ResolvedAsset, home: string): string {
	const trace = displayTrace(resolved.trace, home)
	const lines = [
		`${resolved.name}: ${resolved.status}; stack: ${trace.stack.join(' → ') || 'none'}; built by ${trace.builtBy}; harnesses: ${trace.harnesses.join(', ') || 'none detected'}`,
	]
	if (resolved.message) lines.push(`  ${resolved.message}`)
	lines.push('layers:')
	for (const layer of trace.layers) {
		const who = layer.plugin ? ` ${layer.plugin}` : layer.skill ? ` ${layer.skill}` : ''
		const how = layer.operation ? `; ${layer.operation} from ${layer.operationFrom}` : ''
		lines.push(`  ${layer.tier}${who} ${layer.path}: ${layer.outcome}${how}`)
	}
	return `${lines.join('\n')}\n`
}

/** A name not found, for a person: the name, why, and, when ambiguous, the options `asset select` takes. */
function errorText(entry: ResolvedAsset): string {
	const options = entry.options?.length ? `; options: ${entry.options.join(', ')}` : ''
	return `${entry.name}: ${entry.message}${options}`
}

type ShowFlags = { metadata: boolean; trace: boolean }

function showEntry(resolved: ResolvedAsset, home: string, { metadata, trace }: ShowFlags): AssetShowEntry {
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
	toon: (entries: AssetShowEntry[]) => encode(entries, 'toon'),
	json: (entries: AssetShowEntry[]) => encode(entries, 'json'),
}

function showText(resolved: readonly ResolvedAsset[]): Answer<string> | undefined {
	if (resolved.length === 1) {
		const [only] = resolved as [ResolvedAsset]
		return only.content === undefined ? undefined : document(only.content)
	}
	const blocks = resolved.map((entry) =>
		entry.content === undefined
			? `<reference name="${entry.name}" status="${entry.status}" />`
			: `<reference name="${entry.name}">\n${entry.content}</reference>`,
	)
	return document(blocks.join('\n\n'))
}

function loadCommand(layersFor: LayersFor): cli.Command {
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
			if (!args.names.length) usage('name at least one reference.')
			try {
				const home = homedir()
				const layers = await layersFor(args, home)
				const display = (path: string) => collapseHome(home, path)
				const resolved = args.names.map((name) => resolveAsset(parseAssetName(name), layers, { display }))
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

function namesCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'names',
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
				const listing = listAssetNames(await layersFor(args, home), { display, pattern: args.pattern })
				const report = compact({
					references: listing.references.length
						? listing.references.map((row) =>
								compact({
									name: row.name,
									format: row.format,
									status: row.status === 'found' ? undefined : row.status,
									options: row.options,
								}),
							)
						: args.pattern
							? `0 references match "${args.pattern}"`
							: '0 references — no layer holds one',
				}) as Record<string, unknown>
				if (args.trace) report['layers'] = listing.layers.map((row) => compact({ ...row, path: display(row.path) }))
				if (listing.warnings.length) report['warnings'] = listing.warnings
				return result(report)
			} catch (error) {
				return fail(error, 'Reference listing failed.')
			}
		},
	})
}

function whereCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'where',
		description:
			'Give the project and user files a customization or a selection of a reference is written to, who each reaches, and the heading paths of the document below each.',
		arguments: [
			{
				name: 'name',
				description: 'Reference name, without the `.md` extension.',
				type: t.string(),
			},
		],
		options: {
			root: rootOption,
			default: defaultOption,
			trace: { ...traceOption, description: 'Add every layer checked, with its outcome.' },
		},
		async run(args: CommonArgs & { name: string; default: string | undefined; trace: boolean | undefined }) {
			const format = this.format
			try {
				const home = homedir()
				const display = (path: string) => collapseHome(home, path)
				const report = whereAsset(args.name, await layersFor(args, home), {
					root: resolve(args.root ?? process.cwd()),
					display,
				})
				const output = compact({
					name: report.name,
					status: report.status,
					places: report.places.map((place) => compact(place)),
					options: report.options,
					layers: args.trace ? report.layers.map((layer) => ({ ...layer, path: display(layer.path) })) : undefined,
					warnings: report.warnings,
				})
				if (format === 'text') writeWarnings(report.warnings)
				const answer = result(output)
				if (report.status !== 'invalid') return answer
				process.stderr.write(`error: reference-invalid: ${parseAssetName(args.name).invalid}\n`)
				return answerThenFail(answer, format)
			} catch (error) {
				return fail(error, 'Reference placement lookup failed.')
			}
		},
	})
}

export type AssetResolveCommands = { load: cli.Command; names: cli.Command; where: cli.Command }

/** The tiered, by-name commands over `assets/` folders. `asset`'s own commands act on a path. */
export function createAssetResolveCommands({ plugin }: AssetResolveCommandOptions = {}): AssetResolveCommands {
	const layersFor = layerSource(plugin)
	return { load: loadCommand(layersFor), names: namesCommand(layersFor), where: whereCommand(layersFor) }
}
