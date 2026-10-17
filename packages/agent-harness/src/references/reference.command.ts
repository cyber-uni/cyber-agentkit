import { mkdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { type Answer, CliError, document, encode, type Format, isCliError, printAnswer, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { readTemplate, templateWarnings, withMergeSections } from './create-reference.js'
import { listReferences, type ReferenceRow, type SearchMatch, searchReferences } from './reference-catalog.js'
import { checkReferences, checkResolved, interfaceLookup, type ReferenceCheckEntry } from './reference-check.js'
import { type ReferenceImplementations, referenceImplementations } from './reference-implementations.js'
import {
	projectReferencesDir,
	type ReferenceLayer,
	type ReferencePlugin,
	type ReferenceTier,
	referenceLayers,
} from './reference-layers.js'
import { whereReference } from './reference-where.js'
import {
	parseReferenceName,
	type ResolvedReference,
	resolveReference,
	type TraceEntry,
	type UsedLayer,
} from './resolve-reference.js'

export type { ReferenceWhereReport, ReferenceWhereSlot } from './reference-where.js'

/** One per name asked, in the order asked — the contract the `reference` skill's Load mode builds on. */
export type ReferenceShowEntry = {
	name: string
	status: ResolvedReference['status']
	tier?: ReferenceTier
	plugin?: string
	path?: string
	merge?: string
	metadata?: Record<string, unknown>
	content?: string
	layers?: UsedLayer[]
	warnings: string[]
	suggestions?: string[]
	plugins?: string[]
	trace?: Omit<TraceEntry, 'description'>[]
}

export type ReferenceListReport = {
	layers: { tier: ReferenceTier; plugin: string; path: string; status: string }[]
	/** Emitted even when empty, so a healthy run states its zero explicitly. */
	references: ReferenceRow[] | string
	warnings?: string[]
}

export type ReferenceCreateReport = {
	name: string
	scope: CreateScope
	path: string
	dryRun: boolean
	content: string
	warnings: string[]
	/** Only after a write: the name resolved again, the new file's step `used`. */
	trace?: Omit<TraceEntry, 'description'>[]
}

/** What answers a name once its copy is gone. */
export type ReferenceDeleteNext = {
	status: ResolvedReference['status']
	tier?: ReferenceTier
	plugin?: string
	path?: string
	plugins?: string[]
}

export type ReferenceDeleteReport = {
	name: string
	scope: CreateScope
	path: string
	dryRun: boolean
	next: ReferenceDeleteNext
	/** The name resolved without the deleted file. */
	trace: Omit<TraceEntry, 'description'>[]
}

export type ReferenceSearchReport = { query: string; references: SearchMatch[] | string }

export type ReferenceImplementationsReport = ReferenceImplementations

export type ReferenceCheckReport = {
	/** Emitted even when empty, so a healthy run states its zero explicitly. */
	references: ReferenceCheckEntry[] | string
	failed: number
}

type CommonArgs = { root: string | undefined }

const rootOption = {
	description:
		'Directory the project tier is read from, and each folder above it up to the repository root. Defaults to the current directory.',
	type: t.string().optional(),
}

type LayersFor = (args: CommonArgs, home: string) => Promise<ReferenceLayer[]>

function layerSource(plugin: ReferencePlugin | undefined): LayersFor {
	return (args, home) =>
		referenceLayers({
			root: args.root ?? process.cwd(),
			home,
			platform: process.platform,
			programData: process.env['ProgramData'],
			env: process.env,
			plugin,
		})
}

/** stderr, not stdout: an agent parses stdout. Rethrows what the cli already reports. */
function fail(error: unknown, fallback: string): never {
	if (isCliError(error)) throw error
	process.stderr.write(`error: ${error instanceof Error ? error.message : fallback}\n`)
	throw CliError.reported(exitCodes.error)
}

/** An answer with a failing exit code: the cli prints only what a returned answer holds, so print it first. */
function answerThenFail(answer: Answer<any>, format: Format): never {
	const text = printAnswer(answer, format)
	if (text !== undefined) process.stdout.write(text)
	throw CliError.reported(exitCodes.error)
}

/** `text` for a trace or a report: core's text encoding of one keyed value. */
function textOf(value: object): string {
	return encode(value, 'text')
}

function traceOf(resolved: ResolvedReference, home: string): Omit<TraceEntry, 'description'>[] {
	return resolved.trace.map(({ description: _, ...step }) => ({ ...step, path: collapseHome(home, step.path) }))
}

function showEntry(
	resolved: ResolvedReference,
	home: string,
	suggestions: string[],
	trace: boolean,
): ReferenceShowEntry {
	const entry: ReferenceShowEntry = { name: resolved.name, status: resolved.status, warnings: [] }
	if (resolved.status === 'found') {
		Object.assign(entry, {
			tier: resolved.tier,
			plugin: resolved.plugin,
			path: collapseHome(home, resolved.path as string),
			merge: resolved.merge,
			metadata: resolved.metadata,
			content: resolved.content,
			layers: resolved.layers.map((layer) => ({ ...layer, path: collapseHome(home, layer.path) })),
		})
	}
	if (resolved.status === 'missing') entry.suggestions = suggestions
	if (resolved.status === 'ambiguous') entry.plugins = resolved.plugins
	entry.warnings = resolved.warnings
	if (trace) entry.trace = traceOf(resolved, home)
	return entry
}

function missReason(entry: ReferenceShowEntry): string {
	if (entry.status === 'ambiguous') {
		return `"${entry.name}" is held by more than one plugin; ask for one of ${(entry.plugins as string[]).join(', ')}.`
	}
	const hint = entry.suggestions?.length ? ` Did you mean: ${entry.suggestions.join(', ')}?` : ''
	return `no reference named "${entry.name}" in any tier.${hint}`
}

/** One entry per name asked, as the array itself rather than under a `result` key. */
const bareArray = {
	toon: (entries: ReferenceShowEntry[]) => encode(entries, 'toon'),
	json: (entries: ReferenceShowEntry[]) => encode(entries, 'json'),
}

function showText(entries: readonly ReferenceShowEntry[]): Answer<string> | undefined {
	if (entries.length === 1) {
		const [entry] = entries as [ReferenceShowEntry]
		return entry.content === undefined ? undefined : document(entry.content)
	}
	const blocks = entries.map((entry) =>
		entry.content === undefined
			? `<reference name="${entry.name}" status="${entry.status}" />`
			: `<reference name="${entry.name}" tier="${entry.tier}">\n${entry.content}</reference>`,
	)
	return document(blocks.join('\n\n'))
}

function writeShowStderr(entries: readonly ReferenceShowEntry[], format: Format): void {
	for (const entry of entries) {
		if (format === 'text') {
			for (const warning of entry.warnings) process.stderr.write(`warning: ${warning}\n`)
			if (entry.trace) process.stderr.write(`${textOf({ [`trace ${entry.name}`]: entry.trace })}\n`)
		}
		if (entry.status !== 'found') process.stderr.write(`error: ${missReason(entry)}\n`)
	}
}

function showCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'show',
		description: 'Print one or more references, each resolved through the tiers and combined as its layers ask.',
		arguments: [
			{
				name: 'names',
				description: 'Reference names, without the `.md` extension; `<plugin>/<name>` picks one plugin.',
				type: t.array(t.string()),
			},
		],
		options: {
			root: rootOption,
			trace: {
				description: 'Report every path checked, the file that matched, the merge mode, and why a layer was dropped.',
				type: t.boolean().optional(),
			},
		},
		async run(args: CommonArgs & { names: string[]; trace: boolean | undefined }) {
			const format = this.format
			try {
				const names = args.names.map(parseReferenceName)
				if (!names.length) throw new Error('Name at least one reference.')
				const home = homedir()
				const layers = await layersFor(args, home)
				const display = (path: string) => collapseHome(home, path)
				const lookup = interfaceLookup(layers, { display })
				const entries = names.map((name) => {
					const resolved = resolveReference(name, layers, { display })
					for (const failure of checkResolved(resolved, lookup)) {
						resolved.warnings.push(`${resolved.name} fails its interface check (${failure.check}): ${failure.message}`)
					}
					const suggestions =
						resolved.status === 'missing'
							? searchReferences(name.name, layers, { display })
									.slice(0, 3)
									.map((match) => match.name)
							: []
					return showEntry(resolved, home, suggestions, Boolean(args.trace))
				})
				const answer = format === 'text' ? showText(entries) : result(entries, { render: bareArray })
				writeShowStderr(entries, format)
				const ok = entries.every((entry) => entry.status === 'found')
				if (answer === undefined) {
					if (ok) return undefined
					throw CliError.reported(exitCodes.error)
				}
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
			'List every layer, and every reference at every layer that holds it, marked used or shadowed. A pattern keeps only the names it matches exactly.',
		arguments: [
			{
				name: 'pattern',
				description:
					'Exact name pattern, where `*` stands for any run of characters, such as `project-tracker.capabilities.*`.',
				type: t.string().optional(),
			},
		],
		options: { root: rootOption },
		async run(args: CommonArgs & { pattern?: string | undefined }) {
			try {
				const home = homedir()
				const layers = await layersFor(args, home)
				const { rows, warnings } = listReferences(layers, {
					display: (path) => collapseHome(home, path),
					...(args.pattern ? { pattern: args.pattern } : {}),
				})
				const report: ReferenceListReport = {
					layers: layers.map(({ tier, plugins, dir, status }) => ({
						tier,
						plugin: plugins[0] ?? '',
						path: collapseHome(home, dir),
						status,
					})),
					references: rows.length
						? rows.map((row) => ({ ...row, path: collapseHome(home, row.path) }))
						: args.pattern
							? `0 references match "${args.pattern}"`
							: '0 references — no layer holds one',
				}
				if (warnings.length) report.warnings = warnings
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
		options: { root: rootOption },
		async run(args: CommonArgs & { query: string }) {
			try {
				const query = args.query.trim()
				if (!query) throw new Error('Search needs a query.')
				const home = homedir()
				const matches = searchReferences(query, await layersFor(args, home), {
					display: (path) => collapseHome(home, path),
				})
				const report: ReferenceSearchReport = {
					query,
					references: matches.length ? matches : `0 references match "${query}"`,
				}
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
			'List the project and user files an override of a reference can be written to, highest precedence first, with the copy each overrides and who it applies to.',
		arguments: [
			{
				name: 'name',
				description: 'Reference name, without the `.md` extension; `<plugin>/<name>` picks one plugin.',
				type: t.string(),
			},
		],
		options: {
			root: rootOption,
			caller: {
				description:
					"Folder of the skill that loads the reference, so its own copy is reported as the reference skill's Load mode reads it.",
				type: t.string().optional(),
			},
		},
		async run(args: CommonArgs & { name: string; caller: string | undefined }) {
			const format = this.format
			try {
				const name = parseReferenceName(args.name)
				const home = homedir()
				const layers = await layersFor(args, home)
				const report = whereReference(name, layers, {
					root: resolve(args.root ?? process.cwd()),
					caller: args.caller === undefined ? undefined : resolve(args.caller),
					display: (path) => collapseHome(home, path),
				})
				const answer = result(report)
				if (!report.plugins) return answer
				process.stderr.write(
					`error: ${missReason({ name: name.raw, status: 'ambiguous', plugins: report.plugins, warnings: [] })}\n`,
				)
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
		throw new Error(`--accept is a comma-separated list of versions, such as 1,2; got "${value}".`)
	}
	return versions.map(Number)
}

function implementationsCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'implementations',
		description:
			'List the implementations of an interface a consumer can load, each with its pin, tier, description, and unsupported sections, and the ones left out with why.',
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
		},
		async run(args: CommonArgs & { id: string; accept: string | undefined }) {
			try {
				const accept = parseAccept(args.accept)
				const home = homedir()
				const report: ReferenceImplementationsReport = referenceImplementations(args.id, await layersFor(args, home), {
					accept,
					display: (path) => collapseHome(home, path),
				})
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
			'Check interface documents and their implementations, each resolved with every override merged. With no names, checks every one found. Exits 1 on any failure.',
		arguments: [
			{
				name: 'names',
				description: 'Reference names, without the `.md` extension; `<plugin>/<name>` picks one plugin.',
				type: t.array(t.string()).optional(),
			},
		],
		options: { root: rootOption },
		async run(args: CommonArgs & { names?: string[] | undefined }) {
			const format = this.format
			try {
				const names = (args.names ?? []).map((name) => parseReferenceName(name).raw)
				const home = homedir()
				const entries = checkReferences(await layersFor(args, home), {
					names,
					display: (path) => collapseHome(home, path),
				})
				const failed = entries.filter((entry) => entry.status !== 'passed').length
				const report: ReferenceCheckReport = {
					references: entries.length ? entries : '0 references — no interface document or implementation found',
					failed,
				}
				const answer = result(report)
				if (!failed) return answer
				process.stderr.write(`error: ${failed} of ${entries.length} references fail their interface check.\n`)
				return answerThenFail(answer, format)
			} catch (error) {
				return fail(error, 'Reference check failed.')
			}
		},
	})
}

type CreateScope = 'project' | 'user'

function parseScope(value: string | undefined): CreateScope {
	if (value !== 'project' && value !== 'user') throw new Error('--scope must be project or user.')
	return value
}

type CreateArgs = CommonArgs & {
	name: string
	template: string | undefined
	scope: string | undefined
	'dry-run': boolean | undefined
}

function createCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'create',
		description:
			'Start a new reference in the project or user tier from a template, marked merge-sections when it overrides a copy below. Never overwrites.',
		arguments: [{ name: 'name', description: 'Reference name, without the `.md` extension.', type: t.string() }],
		options: {
			root: rootOption,
			template: {
				description:
					'File whose text is written as it is, frontmatter included. Defaults to a built-in template of top-level `##` sections with no `#` title.',
				type: t.string().optional(),
			},
			scope: {
				description:
					'Tier to write: project (default), `.agents/references/` at the root, or user, `~/.agents/references/`.',
				type: t.string().optional(),
				default: 'project',
			},
			'dry-run': {
				description: 'Print the target path and the exact content, and write nothing.',
				type: t.boolean().optional(),
			},
		},
		async run(args: CreateArgs) {
			const format = this.format
			try {
				const name = parseReferenceName(args.name)
				if (name.plugin !== undefined) {
					throw new Error(
						`an override is written under the bare name, which every tier resolves; ask for "${name.name}".`,
					)
				}
				const scope = parseScope(args.scope)
				const template = readTemplate(args.template === undefined ? undefined : resolve(args.template))
				const home = homedir()
				const dir = scopeDir(scope, args.root, home)
				const target = join(dir, `${name.name}.md`)
				const display = (path: string) => collapseHome(home, path)
				const layers = await layersFor(args, home)
				const { trace } = resolveReference(name, layers, { display })
				const at = layers.findIndex((layer) => layer.dir === dir)
				if (trace[at]?.found) {
					throw new Error(
						`${display(trace[at].path)} already holds "${name.name}"; change it with the reference skill's Update mode.`,
					)
				}
				const shadow = trace.slice(0, at).find((step) => step.found && step.merge === 'first-wins')
				if (shadow) {
					throw new Error(
						`the ${shadow.tier} copy ${display(shadow.path)} is first-wins, so nothing would read a new ${scope} file; change that copy instead.`,
					)
				}
				const overrides = trace.slice(at + 1).some((step) => step.found)
				const content =
					overrides && template.metadata['merge'] === undefined ? withMergeSections(template.content) : template.content
				const warnings = templateWarnings(template)
				const report: ReferenceCreateReport = {
					name: name.name,
					scope,
					path: display(target),
					dryRun: Boolean(args['dry-run']),
					content,
					warnings,
				}
				if (!report.dryRun) {
					mkdirSync(dir, { recursive: true })
					writeFileSync(target, content, { flag: 'wx' })
					report.trace = traceOf(resolveReference(name, layers, { display }), home)
				}
				if (format !== 'text') return result(report)
				for (const warning of warnings) process.stderr.write(`warning: ${warning}\n`)
				return document(
					report.trace ? `${report.path}\n\n${textOf({ trace: report.trace })}` : `${report.path}\n\n${content}`,
				)
			} catch (error) {
				return fail(error, 'Reference creation failed.')
			}
		},
	})
}

function scopeDir(scope: CreateScope, root: string | undefined, home: string): string {
	return scope === 'project'
		? projectReferencesDir(resolve(root ?? process.cwd()))
		: join(home, '.agents', 'references')
}

function nextOf(resolved: ResolvedReference, home: string): ReferenceDeleteNext {
	const next: ReferenceDeleteNext = { status: resolved.status }
	if (resolved.status === 'found') {
		Object.assign(next, {
			tier: resolved.tier,
			plugin: resolved.plugin,
			path: collapseHome(home, resolved.path as string),
		})
	}
	if (resolved.status === 'ambiguous') next.plugins = resolved.plugins
	return next
}

function describeNext(name: string, next: ReferenceDeleteNext): string {
	if (next.status === 'found') return `"${name}" is then answered by the ${next.tier} copy ${next.path}.`
	if (next.status === 'ambiguous') {
		return `"${name}" is then held by more than one plugin: ${(next.plugins as string[]).join(', ')}.`
	}
	return `no copy of "${name}" is left in any tier.`
}

type DeleteArgs = CommonArgs & { name: string; scope: string | undefined; 'dry-run': boolean | undefined }

function deleteCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'delete',
		description:
			'Delete the project or user copy of a reference, and report which copy answers the name afterwards. Never deletes a plugin-shipped or managed copy.',
		arguments: [{ name: 'name', description: 'Reference name, without the `.md` extension.', type: t.string() }],
		options: {
			root: rootOption,
			scope: {
				description:
					'Tier to delete from: project (default), `.agents/references/` at the root, or user, `~/.agents/references/`.',
				type: t.string().optional(),
				default: 'project',
			},
			'dry-run': {
				description: 'Print the file that would be deleted and what would answer the name then, and delete nothing.',
				type: t.boolean().optional(),
			},
		},
		async run(args: DeleteArgs) {
			const format = this.format
			try {
				const name = parseReferenceName(args.name)
				if (name.plugin !== undefined) {
					throw new Error(
						`a project or user copy is held under the bare name; ask for "${name.name}". A plugin's copy is never deleted.`,
					)
				}
				const scope = parseScope(args.scope)
				const home = homedir()
				const dir = scopeDir(scope, args.root, home)
				const display = (path: string) => collapseHome(home, path)
				const layers = await layersFor(args, home)
				const before = resolveReference(name, layers, { display })
				const step = before.trace[layers.findIndex((layer) => layer.dir === dir)]
				if (!step?.found) {
					const answer = before.status === 'found' ? ` ${describeNext(name.name, nextOf(before, home))}` : ''
					throw new Error(
						`${display(join(dir, `${name.name}.md`))} does not exist, so there is no ${scope} copy of "${name.name}" to delete.${answer} Delete never removes a plugin-shipped or managed copy.`,
					)
				}
				const target = step.path
				const dryRun = Boolean(args['dry-run'])
				if (!dryRun) {
					rmSync(target)
					// A folder-form copy leaves its folder behind; remove it only when nothing else is in it.
					if (dirname(target) !== dir) {
						try {
							rmdirSync(dirname(target))
						} catch {}
					}
				}
				const after = resolveReference(name, layers, { display, without: dryRun ? target : undefined })
				const report: ReferenceDeleteReport = {
					name: name.name,
					scope,
					path: display(target),
					dryRun,
					next: nextOf(after, home),
					trace: traceOf(after, home),
				}
				if (format !== 'text') return result(report)
				return document(
					`${report.path}\n\n${dryRun ? 'would delete' : 'deleted'}. ${describeNext(report.name, report.next)}\n\n${textOf({ trace: report.trace })}`,
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
		delete: deleteCommand(layersFor),
		check: checkCommand(layersFor),
		implementations: implementationsCommand(layersFor),
	}
}

export function createReferenceCommand(options: ReferenceCommandOptions = {}): cli.Command {
	const { show, list, search, where, create, delete: remove, check, implementations } = createReferenceCommands(options)
	return command({
		name: 'reference',
		description:
			'Read on-demand reference documents by name, layered across the managed, project, user, and plugin tiers, and start or delete one in the project or user tier.',
		commands: [show, list, search, where, create, remove, implementations, check],
	})
}
