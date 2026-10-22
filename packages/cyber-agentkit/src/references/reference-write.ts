import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { pluginManifestName } from '../plugins/plugin-manifest.js'
import { skillName } from '../skills/skill-folder.js'
import {
	editFrontmatter,
	hasDescription,
	implementationTemplate,
	readTemplate,
	type Template,
	titleOf,
} from './create-reference.js'
import { interfaceLookup } from './reference-check.js'
import { hasBody, isMergeOperation, type MergeOperation, parseDocument } from './reference-document.js'
import { dataExtensions } from './reference-format.js'
import { fitsName, type ReferenceInterface } from './reference-interface.js'
import {
	canonical,
	projectReferencesDir,
	type ReferenceLayers,
	repositoryRoot,
	userReferencesDir,
} from './reference-layers.js'
import { parseReferenceName, type ReferenceName } from './reference-name.js'
import { type ResolvedReference, type ResolveOptions, readExtends, resolveReference } from './resolve-reference.js'

/** A write refused. `usage` marks a wrong invocation (exit 2) rather than a refusal (exit 1). */
export class ReferenceWriteError extends Error {
	readonly code: string
	readonly usage: boolean
	constructor(code: string, message: string, usage = false) {
		super(message)
		this.code = code
		this.usage = usage
	}
}

/** Where a write lands: the project or user tier, or a plugin's or a skill's source folder in the repository. */
export type WriteScope = 'project' | 'user' | 'plugin' | 'default'

export type WriteTarget = {
	scope: WriteScope
	/** The `references/` folder written to. */
	dir: string
	/** The file written or deleted. */
	path: string
}

export type WhereArgs = {
	root: string
	home: string
	scope?: string | undefined
	plugin?: string | undefined
	default?: string | undefined
	/** Act on the `assets/` folders in place of `references/`. */
	assets?: boolean | undefined
}

/** A bare, valid name, or a refusal naming the bare name to use. */
export function bareName(value: string): ReferenceName {
	const name = parseReferenceName(value)
	if (name.invalid) throw new ReferenceWriteError('reference-invalid', name.invalid)
	if (name.plugin !== undefined) {
		throw new ReferenceWriteError(
			'reference-qualified',
			`a contribution is written under the bare name, which every tier resolves; ask for "${name.name}".`,
		)
	}
	return name
}

/** The repository the root sits in: a write to a source folder must land inside it, and never in an installed copy. */
export function insideRepository(folder: string, root: string): boolean {
	const repository = canonical(repositoryRoot(root) ?? resolve(root))
	const target = canonical(folder)
	if (target !== repository && !target.startsWith(repository + sep)) return false
	return !target.slice(repository.length).split(sep).includes('node_modules')
}

/** Resolves `--scope`, `--plugin`, and `--default` to the file a write acts on; more than one is a usage error. */
export function writeTarget(
	name: ReferenceName,
	{ root, home, scope, plugin, default: skill, assets }: WhereArgs,
): WriteTarget {
	const folderName = assets ? 'assets' : 'references'
	const given = [scope, plugin, skill].filter((value) => value !== undefined)
	if (given.length > 1) {
		throw new ReferenceWriteError('options-conflict', 'pass one of --scope, --plugin, and --default.', true)
	}
	if (plugin !== undefined) {
		const folder = resolve(plugin)
		if (!pluginManifestName(folder)) {
			throw new ReferenceWriteError(
				'folder-invalid',
				`${folder} holds no plugin manifest, so it is not a plugin folder.`,
			)
		}
		if (!insideRepository(folder, root)) {
			throw new ReferenceWriteError(
				'folder-invalid',
				`${folder} is outside the repository, such as an installed copy; write to the plugin's source instead.`,
			)
		}
		const dir = join(folder, folderName)
		return { scope: 'plugin', dir, path: join(dir, `${name.name}.md`) }
	}
	if (skill !== undefined) {
		const folder = resolve(skill)
		if (skillName(folder) === undefined) {
			throw new ReferenceWriteError('folder-invalid', `${folder} holds no SKILL.md, so it is not a skill folder.`)
		}
		if (!insideRepository(folder, root)) {
			throw new ReferenceWriteError(
				'folder-invalid',
				`${folder} is outside the repository, such as an installed copy; write to the skill's source instead.`,
			)
		}
		const dir = join(folder, folderName)
		return { scope: 'default', dir, path: join(dir, `${name.name}${assets ? '' : '.default'}.md`) }
	}
	if (scope !== undefined && scope !== 'project' && scope !== 'user') {
		throw new ReferenceWriteError('options-invalid', '--scope is project or user.', true)
	}
	const base = scope === 'user' ? userReferencesDir(home) : projectReferencesDir(resolve(root))
	const dir = assets ? join(dirname(base), 'assets') : base
	return { scope: scope === 'user' ? 'user' : 'project', dir, path: join(dir, `${name.name}.md`) }
}

function tryRead(path: string): string | undefined {
	try {
		return readFileSync(path, 'utf8')
	} catch {
		return undefined
	}
}

/** What answers a name, in one sentence a person reads. */
export function describeAnswer(
	resolved: ResolvedReference,
	display: (path: string) => string = (path) => path,
): string {
	if (resolved.status === 'found') {
		const top = resolved.trace.contributions.at(-1)
		const by = top
			? top.tier === 'plugin'
				? `plugin ${top.plugin}`
				: top.tier === 'default'
					? `the default of ${top.skill}`
					: `the ${top.tier} file ${display(top.path)}`
			: 'nothing'
		const stack = resolved.trace.stack.length ? `, on the stack ${resolved.trace.stack.join(' → ')}` : ''
		return `"${resolved.name}" is answered by ${by}${stack}.`
	}
	if (resolved.status === 'ambiguous') {
		return `"${resolved.name}" is ambiguous: ${resolved.message}; the options are ${(resolved.options ?? []).join(', ')}.`
	}
	return `"${resolved.name}" is ${resolved.status}: ${resolved.message}.`
}

/** The interface `create --implements` starts an implementation of, once the new name fits it. */
function interfaceFor(id: string, name: string, layers: ReferenceLayers, options: ResolveOptions): ReferenceInterface {
	const parsed = parseReferenceName(id)
	if (parsed.invalid || parsed.plugin !== undefined)
		throw new ReferenceWriteError('interface-invalid', `"${id}" is not an interface id.`)
	const iface = interfaceLookup(layers, options)(id)
	if (!iface.value) throw new ReferenceWriteError('interface-invalid', iface.failure?.message ?? `no interface ${id}`)
	if (!fitsName(iface.value, name)) {
		throw new ReferenceWriteError(
			'interface-invalid',
			`an implementation of ${id} is named ${iface.value.cardinality === 'one' ? id : `${id}.<key>`}, not "${name}".`,
		)
	}
	return iface.value
}

export type CreateArgs = WhereArgs & {
	name: string
	merge?: string | undefined
	template?: string | undefined
	implements?: string | undefined
	dryRun?: boolean | undefined
}

export type CreateResult = {
	name: string
	scope: WriteScope
	path: string
	content: string
	dryRun: boolean
	/** Things to know that are not faults, such as a missing `description`. */
	hints: string[]
	/** The name resolved again after the write, when the file is a layer the stack reads. */
	after?: ResolvedReference
}

/**
 * Hides the new file: a `replace` with a body, or a `remove`, that applies above it. A folder that
 * is not a layer the stack reads has nothing above it.
 */
function hiddenBy(resolved: ResolvedReference, dir: string, path: string): string | undefined {
	const layers = resolved.trace.layers
	const at = layers.findIndex((layer) => layer.path === dir || layer.path === path)
	if (at === -1) return undefined
	const target = layers[at]
	const tiered = (tier: string) => tier === 'managed' || tier === 'project' || tier === 'user'
	const stackAt =
		target && !tiered(target.tier)
			? resolved.trace.stack.indexOf(target.tier === 'default' ? 'default' : (target.plugin ?? ''))
			: -1
	const above = layers.filter((layer, index) => {
		if (!layer.file || layer.outcome !== 'used') return false
		if (target && tiered(target.tier)) return index < at && tiered(layer.tier)
		if (tiered(layer.tier)) return true
		const position = resolved.trace.stack.indexOf(layer.tier === 'default' ? 'default' : (layer.plugin ?? ''))
		return stackAt !== -1 && position > stackAt
	})
	const hider = above.find((layer) => layer.operation === 'remove' || (layer.operation === 'replace' && !layer.empty))
	return hider ? `${hider.tier}${hider.plugin ? ` ${hider.plugin}` : ''} ${hider.path} (${hider.operation})` : undefined
}

/** A selection-only file keeps its own keys, `extends` among them; the template adds the keys it lacks. */
function selectionKeys(
	existing: string,
	template: Template,
	merge: MergeOperation | undefined,
): Record<string, unknown> {
	const held = parseDocument(existing, () => {}).metadata
	const keys: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(template.metadata)) {
		if (key !== 'merge' && !(key in held)) keys[key] = value
	}
	keys['merge'] = merge
	return keys
}

function withBody(head: string, body: string): string {
	const text = body.replace(/^(?:[ \t]*\r?\n)+/, '')
	return text ? `${head.replace(/\s*$/, '')}\n\n${text}` : head
}

export function createContribution(
	layers: ReferenceLayers,
	args: CreateArgs,
	options: ResolveOptions = {},
): CreateResult {
	const name = bareName(args.name)
	const target = writeTarget(name, args)
	if (args.merge !== undefined && !isMergeOperation(args.merge)) {
		throw new ReferenceWriteError(
			'options-invalid',
			`--merge is replace, patch, combine, or remove; got "${args.merge}".`,
			true,
		)
	}
	const merge = args.merge as MergeOperation | undefined
	if (args.template !== undefined && args.implements !== undefined) {
		throw new ReferenceWriteError('options-conflict', 'pass --template or --implements, not both.')
	}
	if (merge === 'remove' && args.template !== undefined) {
		throw new ReferenceWriteError('options-conflict', '--merge remove writes no body, so it takes no --template.')
	}
	if (merge !== undefined && target.scope === 'default') {
		throw new ReferenceWriteError('options-conflict', 'a default is written with no merge; drop --merge.')
	}
	const existing = tryRead(target.path)
	if (existing !== undefined && hasBody(parseDocument(existing, () => {}).body)) {
		throw new ReferenceWriteError(
			'file-exists',
			`${(options.display ?? ((path: string) => path))(target.path)} already holds "${name.name}"; change it with the reference skill's Update mode.`,
		)
	}
	const template: Template =
		args.implements !== undefined
			? implementationTemplate(interfaceFor(args.implements, name.name, layers, options))
			: merge === 'remove'
				? { content: '', metadata: {}, body: '' }
				: readTemplate(args.template === undefined ? undefined : resolve(args.template))
	const title = titleOf(template)
	if (title) {
		throw new ReferenceWriteError(
			'template-title',
			`the template's top level is the single heading "${title}" holding the others; patch matches by heading path, so make its sections top-level.`,
		)
	}
	const before = resolveReference(name, layers, options)
	const hider = hiddenBy(before, target.dir, target.path)
	if (hider) {
		throw new ReferenceWriteError(
			'hidden',
			`${hider} applies above it, so nothing would read the new file; change that contribution instead.`,
		)
	}
	const operation: MergeOperation | undefined =
		target.scope === 'default'
			? undefined
			: args.implements !== undefined
				? 'replace'
				: (merge ??
					(isMergeOperation(template.metadata['merge']) ? template.metadata['merge'] : undefined) ??
					(target.scope === 'plugin' ? undefined : 'patch'))
	const content =
		existing === undefined
			? editFrontmatter(template.content, { merge: operation })
			: withBody(editFrontmatter(existing, selectionKeys(existing, template, operation)), template.body)
	const hints = hasDescription(parseDocument(content, () => {}))
		? []
		: ['it has no `description` in its frontmatter, so `list` and `search` show it blank']
	const result: CreateResult = {
		name: name.name,
		scope: target.scope,
		path: target.path,
		content,
		dryRun: Boolean(args.dryRun),
		hints,
	}
	if (result.dryRun) return result
	mkdirSync(target.dir, { recursive: true })
	writeFileSync(target.path, content, existing === undefined ? { flag: 'wx' } : {})
	if (before.trace.layers.some((layer) => layer.path === target.dir || layer.path === target.path)) {
		result.after = resolveReference(name, layers, options)
	}
	return result
}

export type SelectArgs = {
	root: string
	home: string
	name: string
	options: readonly string[]
	scope?: string | undefined
	clear?: boolean | undefined
	assets?: boolean | undefined
}

export type SelectResult = {
	name: string
	scope: 'project' | 'user'
	path: string
	/** The options written, bottom first; empty after `--clear`. */
	extends: string[]
	/** `--clear` left the file with nothing in it, so it was deleted. */
	deleted: boolean
	after: ResolvedReference
}

export function selectContribution(
	layers: ReferenceLayers,
	args: SelectArgs,
	options: ResolveOptions = {},
): SelectResult {
	const name = bareName(args.name)
	const target = writeTarget(name, { root: args.root, home: args.home, scope: args.scope, assets: args.assets })
	const scope = target.scope as 'project' | 'user'
	const existing = tryRead(target.path)
	if (args.clear) {
		if (args.options.length) throw new ReferenceWriteError('options-conflict', '--clear takes no option.', true)
		const steps =
			existing === undefined ? undefined : readExtends(parseDocument(existing, () => {}).metadata['extends'], () => {})
		if (!steps) {
			throw new ReferenceWriteError(
				'no-selection',
				`the ${scope} tier holds no selection of "${name.name}". ${describeAnswer(resolveReference(name, layers, options), options.display)}`,
			)
		}
		const content = editFrontmatter(existing as string, { extends: undefined })
		const deleted = !content.trim()
		if (deleted) rmSync(target.path)
		else writeFileSync(target.path, content)
		return {
			name: name.name,
			scope,
			path: target.path,
			extends: [],
			deleted,
			after: resolveReference(name, layers, options),
		}
	}
	if (!args.options.length)
		throw new ReferenceWriteError('options-missing', 'name at least one option: a plugin or default.', true)
	const before = resolveReference(name, layers, options)
	const holders = new Set(
		before.trace.layers.flatMap(({ plugin, file }) => (plugin !== undefined && file ? [plugin] : [])),
	)
	const picked = args.options.map((option) =>
		option.endsWith(`/${name.name}`) ? option.slice(0, -name.name.length - 1) : option,
	)
	const wrong = picked.filter((option) => option !== 'default' && !holders.has(option))
	if (wrong.length) {
		throw new ReferenceWriteError(
			'option-invalid',
			`${wrong.join(', ')} ${wrong.length === 1 ? 'is' : 'are'} neither default nor a plugin holding "${name.name}"${holders.size ? `; the plugins holding it are ${[...holders].join(', ')}` : ''}.`,
		)
	}
	const content = editFrontmatter(existing ?? '', { extends: picked })
	mkdirSync(target.dir, { recursive: true })
	writeFileSync(target.path, content)
	return {
		name: name.name,
		scope,
		path: target.path,
		extends: picked,
		deleted: false,
		after: resolveReference(name, layers, options),
	}
}

/** The data files that can answer a name in a folder. */
function dataFiles(dir: string, name: string): string[] {
	return dataExtensions.map(({ extension }) => join(dir, `${name}${extension}`))
}

export type DeleteArgs = WhereArgs & { name: string; dryRun?: boolean | undefined }

export type DeleteResult = {
	name: string
	scope: WriteScope
	path: string
	dryRun: boolean
	/** The file held a selection (`extends`), which went with it. */
	selection?: string[]
	/** What answers the name once the file is gone. */
	after: ResolvedReference
}

export function deleteContribution(
	layers: ReferenceLayers,
	args: DeleteArgs,
	options: ResolveOptions = {},
): DeleteResult {
	const name = bareName(args.name)
	const target = writeTarget(name, args)
	const shown = options.display ?? ((path: string) => path)
	const before = resolveReference(name, layers, options)
	const candidates =
		target.scope === 'project' || target.scope === 'user'
			? [target.path, join(target.dir, name.name, 'README.md'), ...dataFiles(target.dir, name.name)]
			: [target.path]
	const path = candidates.find((candidate) => candidate !== options.without && existsSync(candidate))
	if (!path) {
		throw new ReferenceWriteError(
			'no-file',
			`${shown(target.path)} does not exist, so there is no ${target.scope} contribution of "${name.name}" to delete. ${describeAnswer(before, options.display)} An installed plugin's, a managed, or an installed skill's contribution is never deleted.`,
		)
	}
	const steps = readExtends(parseDocument(tryRead(path) ?? '', () => {}).metadata['extends'], () => {})
	const dryRun = Boolean(args.dryRun)
	if (!dryRun) {
		rmSync(path)
		// A folder-form contribution leaves its folder behind; remove it only when nothing else is in it.
		if (dirname(path) !== target.dir) {
			try {
				rmdirSync(dirname(path))
			} catch {}
		}
	}
	const result: DeleteResult = {
		name: name.name,
		scope: target.scope,
		path,
		dryRun,
		after: resolveReference(name, layers, { ...options, without: dryRun ? path : undefined }),
	}
	if (steps) result.selection = steps.map(({ target: step }) => step)
	return result
}
