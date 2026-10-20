import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { type Answer, CliError, document, encode, type Format, isCliError, printAnswer, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { listReferences, searchReferences } from './reference-catalog.js'
import { checkReferences, checkResolved, interfaceLookup } from './reference-check.js'
import { referenceImplementations } from './reference-implementations.js'
import { type ReferenceLayers, type ReferencePlugin, referenceLayers } from './reference-layers.js'
import { parseReferenceName } from './reference-name.js'
import type { ReferenceWarning } from './reference-warning.js'
import { whereReference } from './reference-where.js'
import {
	createContribution,
	type DeleteResult,
	deleteContribution,
	describeAnswer,
	ReferenceWriteError,
	selectContribution,
} from './reference-write.js'
import { type ReferenceTrace, type ResolvedReference, resolveReference } from './resolve-reference.js'

/** `show`'s entry for a name: its content alone when `found` with nothing else to say, else a record. */
export type ReferenceShowEntry =
	| string
	| {
			name: string
			status: ResolvedReference['status']
			content?: string
			code?: string
			options?: string[]
			metadata?: Record<string, unknown>
			warnings?: ReferenceWarning[]
			trace?: ReferenceTrace
	  }

export type ReferenceListReport = {
	/** A string when nothing matches, so a run states its zero explicitly. */
	references: { name: string; description?: string; status?: string; options?: string[] }[] | string
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

export type ReferenceSearchReport = {
	references:
		| {
				name: string
				description?: string
				match: string
				loadedBy?: string
				tier?: string
				plugin?: string
				skill?: string
		  }[]
		| string
	/** Why some skills' defaults are not searched. */
	defaults?: string
}

export type ReferenceCheckReport = {
	failed?: { name: string; loadedBy?: string; failures: { check: string; message: string }[] }[]
	passed: number
	references?: {
		name: string
		loadedBy?: string
		kind: string
		status: string
		failures?: { check: string; message: string }[]
		unsupported?: string[]
	}[]
}

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

export type ReferenceWhereOutput = {
	name: string
	status: string
	places: { scope: string; path: string; reaches: string; status: string; sections?: string[] }[]
	options?: string[]
	layers?: ReferenceTrace['layers']
	warnings?: ReferenceWarning[]
}

/** The fields of `create`, `select`, and `delete` are not a contract yet (spec Q4). */
export type ReferenceCreateReport = {
	path: string
	hint: string
	content?: string
	hints?: string[]
	trace?: ReferenceTrace
}

export type ReferenceSelectReport = {
	path: string
	extends?: string[]
	deleted?: boolean
	status: string
	stack?: string[]
	answer: string
}

export type ReferenceDeleteReport = {
	path: string
	dryRun?: boolean
	status: string
	stack?: string[]
	answer: string
	selection?: string
	options?: string[]
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

type LayersFor = (args: CommonArgs & { default?: string | undefined }, home: string) => Promise<ReferenceLayers>

function layerSource(plugin: ReferencePlugin | undefined): LayersFor {
	return (args, home) =>
		referenceLayers({
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
	if (error instanceof ReferenceWriteError) {
		process.stderr.write(`error: ${error.code}: ${error.message}\n`)
		throw CliError.reported(error.usage ? exitCodes.usage : exitCodes.error)
	}
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

function writeWarnings(warnings: readonly ReferenceWarning[]): void {
	for (const { code, message } of warnings) process.stderr.write(`warning: ${code}: ${message}\n`)
}

function displayTrace(trace: ReferenceTrace, home: string): ReferenceTrace {
	const show = (path: string) => collapseHome(home, path)
	return {
		...trace,
		contributions: trace.contributions.map((row) => ({ ...row, path: show(row.path) })),
		layers: trace.layers.map((layer) => ({ ...layer, path: show(layer.path) })),
	}
}

/** The text trace: a summary line, then each section with its contributions, then each layer. */
export function traceText(resolved: ResolvedReference, home: string): string {
	const trace = displayTrace(resolved.trace, home)
	const lines = [
		`${resolved.name}: ${resolved.status}; stack: ${trace.stack.join(' → ') || 'none'}; built by ${trace.builtBy}; harnesses: ${trace.harnesses.join(', ') || 'none detected'}`,
	]
	if (resolved.message) lines.push(`  ${resolved.message}`)
	if (trace.sections.length) {
		lines.push('sections:')
		for (const section of trace.sections) {
			const how = section.removedBy
				? `removed by ${section.removedBy}`
				: section.contributions.map(({ contribution, operation }) => `${contribution} (${operation})`).join(', ') ||
					'no text'
			lines.push(`  ${section.path}: ${how}`)
		}
	}
	lines.push('layers:')
	for (const layer of trace.layers) {
		const who = layer.plugin ? ` ${layer.plugin}` : layer.skill ? ` ${layer.skill}` : ''
		const how = layer.operation ? `; ${layer.operation} from ${layer.operationFrom}` : ''
		const extendsNote = layer.extendsOutcome ? `; extends ${layer.extendsOutcome}` : ''
		const selection = layer.selection ? '; selection' : ''
		const frontmatter =
			layer.frontmatter && Object.keys(layer.frontmatter).length ? ` ${JSON.stringify(layer.frontmatter)}` : ''
		lines.push(`  ${layer.tier}${who} ${layer.path}: ${layer.outcome}${how}${extendsNote}${selection}${frontmatter}`)
	}
	return `${lines.join('\n')}\n`
}

/** A name not found, for a person: the name, why, and, when ambiguous, the options `reference select` takes. */
function errorText(entry: ResolvedReference): string {
	const options = entry.options?.length ? `; options: ${entry.options.join(', ')}` : ''
	return `${entry.name}: ${entry.message}${options}`
}

type ShowFlags = { metadata: boolean; trace: boolean }

function showEntry(resolved: ResolvedReference, home: string, { metadata, trace }: ShowFlags): ReferenceShowEntry {
	if (resolved.status === 'found' && !resolved.warnings.length && !metadata && !trace) return resolved.content as string
	return compact({
		name: resolved.name,
		status: resolved.status,
		content: resolved.content,
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

function showCommand(layersFor: LayersFor): cli.Command {
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

function listCommand(layersFor: LayersFor): cli.Command {
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
				const report: ReferenceListReport = compact({
					references: listing.references.length
						? listing.references.map((row) =>
								compact({
									name: row.name,
									description: row.description,
									status: row.status === 'found' ? undefined : row.status,
									options: row.options,
								}),
							)
						: args.pattern
							? `0 references match "${args.pattern}"`
							: '0 references — no layer holds one',
					defaults: listing.defaults,
				})
				if (args.trace) report.layers = listing.layers.map((row) => compact({ ...row, path: display(row.path) }))
				if (listing.warnings.length) report.warnings = listing.warnings
				return result(report)
			} catch (error) {
				return fail(error, 'Reference listing failed.')
			}
		},
	})
}

function searchCommand(layersFor: LayersFor): cli.Command {
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
			if (!query) usage('search needs a query.')
			try {
				const home = homedir()
				const { matches, defaults } = searchReferences(query, await layersFor(args, home), {
					display: (path) => collapseHome(home, path),
				})
				const report: ReferenceSearchReport = compact({
					references: matches.length
						? matches.map(({ name, description, match, tier, plugin, skill, loadedBy }) =>
								compact(
									args.trace
										? { name, description, match, loadedBy, tier, plugin, skill }
										: { name, description, match, loadedBy },
								),
							)
						: `0 references match "${query}"`,
					defaults,
				})
				return result(report)
			} catch (error) {
				return fail(error, 'Reference search failed.')
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
				const report = whereReference(args.name, await layersFor(args, home), {
					root: resolve(args.root ?? process.cwd()),
					display,
				})
				const output: ReferenceWhereOutput = compact({
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
				process.stderr.write(`error: reference-invalid: ${parseReferenceName(args.name).invalid}\n`)
				return answerThenFail(answer, format)
			} catch (error) {
				return fail(error, 'Reference placement lookup failed.')
			}
		},
	})
}

function parseAccept(value: string | undefined): number[] | undefined {
	if (value === undefined) return undefined
	const versions = value.split(',').map((part) => part.trim())
	if (!versions.length || versions.some((part) => !/^[1-9]\d*$/.test(part))) {
		usage(`--accept is a comma-separated list of versions, such as 1,2; got "${value}".`)
	}
	return versions.map(Number)
}

function implementationsCommand(layersFor: LayersFor): cli.Command {
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

function checkCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'check',
		description:
			'Check interface documents and their implementations, each composed as `show` composes it. With no names, checks every one found. Exits 1 on any failure.',
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
		async run(args: CommonArgs & { names?: string[] | undefined; trace: boolean | undefined }) {
			const format = this.format
			try {
				const home = homedir()
				const entries = checkReferences(await layersFor(args, home), {
					names: args.names ?? [],
					display: (path) => collapseHome(home, path),
				})
				const failing = entries.filter((entry) => entry.status !== 'passed')
				const strip = (failures: { check: string; message: string }[]) =>
					failures.map(({ check, message }) => ({ check, message }))
				const report: ReferenceCheckReport = compact({
					failed: failing.map(({ name, loadedBy, failures }) => compact({ name, loadedBy, failures: strip(failures) })),
					passed: entries.length - failing.length,
					references: args.trace
						? entries.map(({ name, loadedBy, kind, status, failures, unsupported }) =>
								compact({ name, loadedBy, kind, status, failures: strip(failures), unsupported }),
							)
						: undefined,
				})
				const answer = result(report)
				if (!failing.length) return answer
				if (format === 'text') {
					process.stderr.write(
						`error: interface-check: ${failing.length} of ${entries.length} references fail their check.\n`,
					)
				}
				return answerThenFail(answer, format)
			} catch (error) {
				return fail(error, 'Reference check failed.')
			}
		},
	})
}

const scopeOption = {
	description: 'Tier to write: project (default), `.agents/references/` at the root, or user, `~/.agents/references/`.',
	type: t.string().optional(),
}

const pluginOption = {
	description: "A plugin's source folder in this repository: acts on its `references/<name>.md`.",
	type: t.string().optional(),
}

const skillOption = {
	description: "A skill's source folder in this repository: acts on its `references/<name>.default.md`.",
	type: t.string().optional(),
}

type CreateArgs = CommonArgs & {
	name: string
	scope: string | undefined
	plugin: string | undefined
	default: string | undefined
	merge: string | undefined
	template: string | undefined
	implements: string | undefined
	'dry-run': boolean | undefined
	trace: boolean | undefined
}

function createCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'create',
		description:
			"Start a contribution in the project or user tier, or in a plugin's or a skill's source folder, from a template or an interface. Never overwrites a file with a body.",
		arguments: [{ name: 'name', description: 'Reference name, without the `.md` extension.', type: t.string() }],
		options: {
			root: rootOption,
			scope: scopeOption,
			plugin: pluginOption,
			default: skillOption,
			merge: {
				description:
					'How it applies over what is below: replace, patch (default), combine, or remove. remove writes no body.',
				type: t.string().optional(),
			},
			template: {
				description:
					'File whose text is written as it is, frontmatter included. Defaults to a built-in template of top-level `##` sections.',
				type: t.string().optional(),
			},
			implements: {
				description:
					"Interface id to implement: the interface's sections become `##` headings, each stubbed `**Unsupported.**`, with `merge: replace`. Not with --template.",
				type: t.string().optional(),
			},
			'dry-run': {
				description: 'Print the target path and the exact content, and write nothing.',
				type: t.boolean().optional(),
			},
			trace: { ...traceOption, description: 'After the write, add the trace, in which the new file applies.' },
		},
		async run(args: CreateArgs) {
			const format = this.format
			try {
				const home = homedir()
				const root = resolve(args.root ?? process.cwd())
				const display = (path: string) => collapseHome(home, path)
				const layers = await layersFor({ root, default: args.default }, home)
				const created = createContribution(
					layers,
					{
						root,
						home,
						name: args.name,
						scope: args.scope,
						plugin: args.plugin,
						default: args.default,
						merge: args.merge,
						template: args.template,
						implements: args.implements,
						dryRun: args['dry-run'],
					},
					{ display },
				)
				const report: ReferenceCreateReport = compact({
					path: display(created.path),
					hint: created.dryRun
						? 'Nothing was written. Run again without --dry-run to write it.'
						: `Run \`show ${created.name}\` for the composed document.`,
					content: created.dryRun ? created.content : undefined,
					hints: created.hints,
					trace: args.trace && created.after ? displayTrace(created.after.trace, home) : undefined,
				})
				if (format !== 'text') return result(report)
				for (const hint of created.hints) process.stderr.write(`hint: ${hint}\n`)
				if (args.trace && created.after) process.stderr.write(traceText(created.after, home))
				return document(created.dryRun ? `${report.path}\n\n${created.content}` : `${report.path}\n\n${report.hint}\n`)
			} catch (error) {
				return fail(error, 'Reference creation failed.')
			}
		},
	})
}

function selectCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'select',
		description:
			'Choose what a name builds on: write an `extends` listing the options, bottom first, in the project or user file. Its body and other keys are kept.',
		arguments: [
			{ name: 'name', description: 'Reference name, without the `.md` extension.', type: t.string() },
			{
				name: 'options',
				description: 'Bottom first: each a plugin holding the name (or `<plugin>/<name>`), or `default`.',
				type: t.array(t.string()).optional(),
			},
		],
		options: {
			root: rootOption,
			scope: scopeOption,
			clear: {
				description: 'Remove the selection; a file left with nothing in it is deleted.',
				type: t.boolean().optional(),
			},
		},
		async run(
			args: CommonArgs & {
				name: string
				options?: string[] | undefined
				scope: string | undefined
				clear: boolean | undefined
			},
		) {
			const format = this.format
			try {
				const home = homedir()
				const root = resolve(args.root ?? process.cwd())
				const display = (path: string) => collapseHome(home, path)
				const selected = selectContribution(
					await layersFor({ root }, home),
					{ root, home, name: args.name, options: args.options ?? [], scope: args.scope, clear: args.clear },
					{ display },
				)
				const report: ReferenceSelectReport = compact({
					path: display(selected.path),
					extends: selected.extends,
					deleted: selected.deleted || undefined,
					status: selected.after.status,
					stack: selected.after.trace.stack,
					answer: describeAnswer(selected.after, display),
				})
				if (format !== 'text') return result(report)
				writeWarnings(selected.after.warnings)
				const what = args.clear
					? selected.deleted
						? 'selection cleared; the file was left empty and deleted'
						: 'selection cleared'
					: `extends: [${selected.extends.join(', ')}]`
				return document(`${report.path}\n\n${what}. ${report.answer}\n`)
			} catch (error) {
				return fail(error, 'Reference selection failed.')
			}
		},
	})
}

function deleteReport(deleted: DeleteResult, home: string): ReferenceDeleteReport {
	const selection = deleted.selection
		? `the selection extends: [${deleted.selection.join(', ')}] went with it; run \`reference select ${deleted.name} <option>...\` to restore it`
		: undefined
	return compact({
		path: collapseHome(home, deleted.path),
		dryRun: deleted.dryRun || undefined,
		status: deleted.after.status,
		stack: deleted.after.trace.stack,
		answer: describeAnswer(deleted.after, (path) => collapseHome(home, path)),
		selection,
		options: deleted.after.options,
	})
}

function deleteCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'delete',
		description:
			"Delete a project or user contribution, or one in a plugin's or a skill's source folder, and report what answers the name afterwards. Never deletes an installed or managed one.",
		arguments: [{ name: 'name', description: 'Reference name, without the `.md` extension.', type: t.string() }],
		options: {
			root: rootOption,
			scope: { ...scopeOption, description: 'Tier to delete from: project (default) or user.' },
			plugin: pluginOption,
			default: skillOption,
			'dry-run': {
				description: 'Print the file that would be deleted and what would answer the name then, and delete nothing.',
				type: t.boolean().optional(),
			},
		},
		async run(
			args: CommonArgs & {
				name: string
				scope: string | undefined
				plugin: string | undefined
				default: string | undefined
				'dry-run': boolean | undefined
			},
		) {
			const format = this.format
			try {
				const home = homedir()
				const root = resolve(args.root ?? process.cwd())
				const deleted = deleteContribution(
					await layersFor({ root, default: args.default }, home),
					{
						root,
						home,
						name: args.name,
						scope: args.scope,
						plugin: args.plugin,
						default: args.default,
						dryRun: args['dry-run'],
					},
					{ display: (path) => collapseHome(home, path) },
				)
				const report = deleteReport(deleted, home)
				if (format !== 'text') return result(report)
				const selection = report.selection ? ` Also, ${report.selection}.` : ''
				return document(
					`${report.path}\n\n${deleted.dryRun ? 'would delete' : 'deleted'}. ${report.answer}${selection}\n`,
				)
			} catch (error) {
				return fail(error, 'Reference deletion failed.')
			}
		},
	})
}

export type ReferenceCommandOptions = {
	/** The plugin running the command; see `ReferenceLayerOptions['plugin']`. */
	plugin?: ReferencePlugin | undefined
}

export type ReferenceCommands = {
	show: cli.Command
	list: cli.Command
	search: cli.Command
	where: cli.Command
	create: cli.Command
	select: cli.Command
	delete: cli.Command
	check: cli.Command
	implementations: cli.Command
}

/** A factory, so each host CLI names itself as the plugin whose own references come first. */
export function createReferenceCommands({ plugin }: ReferenceCommandOptions = {}): ReferenceCommands {
	const layersFor = layerSource(plugin)
	return {
		show: showCommand(layersFor),
		list: listCommand(layersFor),
		search: searchCommand(layersFor),
		where: whereCommand(layersFor),
		create: createCommand(layersFor),
		select: selectCommand(layersFor),
		delete: deleteCommand(layersFor),
		check: checkCommand(layersFor),
		implementations: implementationsCommand(layersFor),
	}
}

export function createReferenceCommand(options: ReferenceCommandOptions = {}): cli.Command {
	const {
		show,
		list,
		search,
		where,
		create,
		select,
		delete: remove,
		check,
		implementations,
	} = createReferenceCommands(options)
	return command({
		name: 'reference',
		description:
			'Read reference documents by name, composed from the managed, project, user, plugin, and default tiers, and write, select, or delete a contribution.',
		commands: [show, list, search, where, create, select, remove, implementations, check],
	})
}
