import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { editFrontmatter, hasDescription, type Template } from './create-reference.js'
import type { ReferenceWarning } from './reference-codes.js'
import { parseDocument } from './reference-document.js'
import { ReferenceFailure } from './reference-error.js'
import { formatOfFile } from './reference-format.js'
import { hiderLabel, hidingLayer, projectHidingLayer } from './reference-hiding.js'
import type { ReferenceLayers } from './reference-layers.js'
import { generatedFrontmatter, recordedSources, sourceCatalog } from './reference-sources.js'
import { validateWrite, type WritePlan } from './reference-write-checks.js'
import {
	answeringFile,
	bareName,
	checkScope,
	metadataFile,
	type TargetArgs,
	type WriteScope,
	type WriteTarget,
	writeTarget,
} from './reference-write-target.js'
import { type ResolvedReference, type ResolveOptions, readExtends, resolveReference } from './resolve-reference.js'

export type { WriteScope, WriteTarget } from './reference-write-target.js'
export { insideRepository } from './reference-write-target.js'

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
			: undefined
		const stack = resolved.trace.stack.length ? `, on the stack ${resolved.trace.stack.join(' → ')}` : ''
		const folders = resolved.projectSections.map(({ folder }) => folder)
		if (!by) return `"${resolved.name}" is answered only by the project sections of ${folders.join(', ')}.`
		const sections = folders.length ? `, with the project sections of ${folders.join(', ')}` : ''
		return `"${resolved.name}" is answered by ${by}${stack}${sections}.`
	}
	if (resolved.status === 'ambiguous') {
		return `"${resolved.name}" is ambiguous: ${resolved.message}; the options are ${(resolved.options ?? []).join(', ')}.`
	}
	return `"${resolved.name}" is ${resolved.status}: ${resolved.message}.`
}

export type CreateArgs = TargetArgs & {
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
	/** A project section's folder, relative to the root. */
	folder?: string
	content: string
	dryRun: boolean
	/** Things to know that are not faults, such as a missing `description`. */
	hints: string[]
	/** Faults that did not stop the write, such as a contribution above that hides the file (R26). */
	warnings: ReferenceWarning[]
	/** The name resolved again after the write, when the file is a layer the stack reads or a project section. */
	after?: ResolvedReference
}

/** Keys only a main-document contribution carries (K24): a project section a `create --in` writes drops them. */
const mainDocumentKeys = ['merge', 'extends', 'implements', 'aliases'] as const

/** A selection-only file keeps its own keys, `extends` among them; the template adds the keys it lacks. */
function selectionKeys(existing: string, template: Template): Record<string, unknown> {
	const held = parseDocument(existing, () => {}).metadata
	const keys: Record<string, unknown> = {}
	for (const [key, value] of Object.entries(template.metadata)) {
		if (key !== 'merge' && !(key in held)) keys[key] = value
	}
	return keys
}

function withBody(head: string, body: string): string {
	const text = body.replace(/^(?:[ \t]*\r?\n)+/, '')
	return text ? `${head.replace(/\s*$/, '')}\n\n${text}` : head
}

/** The warning for a file written under a contribution that hides it (R26), or none. */
function hiddenWarning(plan: WritePlan, display: (path: string) => string): ReferenceWarning | undefined {
	const { before, target } = plan
	const hider = target.scope === 'project' ? projectHidingLayer(before) : hidingLayer(before, target.dir, target.path)
	if (!hider) return undefined
	const code = target.scope === 'user' && hider.tier === 'repo' ? 'repo-hides-user' : 'reference-hidden'
	return {
		code,
		message: `${display(target.path)} is written, but ${hiderLabel(hider, display)} applies above it, so load does not read it until that contribution changes.`,
	}
}

/**
 * Starts a contribution: in the `repo` or `user` tier, a folder's project section, or a plugin's or
 * a skill's source folder, from a template or an interface's stub. Every check runs first, in the
 * order `validateWrite` gives; a file a contribution above hides is written all the same, with a
 * warning naming it (R26).
 */
export function createContribution(
	layers: ReferenceLayers,
	args: CreateArgs,
	options: ResolveOptions = {},
): CreateResult {
	const plan = validateWrite({ command: 'create', ...args }, layers, options)
	const { name, target, existing, operation } = plan
	const template = plan.template as Template
	const display = options.display ?? ((path: string) => path)
	const warnings: ReferenceWarning[] = []
	const edits: Record<string, unknown> = { merge: operation }
	if (target.scope === 'project') {
		for (const key of mainDocumentKeys) {
			edits[key] = undefined
			if (plan.iface || !(key in template.metadata)) continue
			warnings.push({
				code: 'project-section-key-ignored',
				message: `\`${key}\` is dropped from the project section for ${target.folder}: a project section states only what differs in its folder.`,
			})
		}
	}
	if ((target.scope === 'plugin' || target.scope === 'default') && plan.extended.length) {
		const sources = recordedSources(plan.extended, sourceCatalog(layers, { tier: target.scope }))
		Object.assign(edits, generatedFrontmatter({ sources }))
	}
	const content =
		existing === undefined
			? editFrontmatter(template.content, edits)
			: withBody(editFrontmatter(existing, { ...selectionKeys(existing, template), ...edits }), template.body)
	const hidden = hiddenWarning(plan, display)
	if (hidden) warnings.push(hidden)
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
		warnings,
	}
	if (target.folder !== undefined) result.folder = target.folder
	if (result.dryRun) return result
	mkdirSync(target.dir, { recursive: true })
	writeFileSync(target.path, content, existing === undefined ? { flag: 'wx' } : {})
	const read =
		target.scope === 'project' ||
		plan.before.trace.layers.some((layer) => layer.path === target.dir || layer.path === target.path)
	// A new project folder is found only by a fresh discovery.
	if (read) result.after = resolveReference(name, { ...layers, projects: new Map() }, options)
	return result
}

export type SelectArgs = {
	root: string
	home: string
	name: string
	options: readonly string[]
	scope?: string | undefined
	clear?: boolean | undefined
}

export type SelectResult = {
	name: string
	scope: 'repo' | 'user'
	path: string
	/** The options written, bottom first; empty after `--clear`. */
	extends: string[]
	/** `--clear` left the file with nothing in it, so it was deleted. */
	deleted: boolean
	/** Set on a no-op: `--clear` with no selection there. */
	code?: 'no-selection'
	/** What the notice says, for a person. */
	message?: string
	after: ResolvedReference
}

export function selectContribution(
	layers: ReferenceLayers,
	args: SelectArgs,
	options: ResolveOptions = {},
): SelectResult {
	const name = bareName(args.name)
	checkScope(args.scope)
	const target = writeTarget(name, { root: args.root, home: args.home, scope: args.scope })
	const scope = target.scope as 'repo' | 'user'
	const existing = tryRead(target.path)
	if (args.clear) {
		if (args.options.length) throw new ReferenceFailure('options-conflict', '--clear takes no option.')
		const steps =
			existing === undefined ? undefined : readExtends(parseDocument(existing, () => {}).metadata['extends'], () => {})
		if (!steps) {
			const after = resolveReference(name, layers, options)
			return {
				name: name.name,
				scope,
				path: target.path,
				extends: [],
				deleted: false,
				code: 'no-selection',
				message: `the ${scope} tier holds no selection of "${name.name}", so nothing was cleared. ${describeAnswer(after, options.display)}`,
				after,
			}
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
		throw new ReferenceFailure('options-missing', 'name at least one option: a plugin or default.')
	const before = resolveReference(name, layers, options)
	const holders = new Set(
		before.trace.layers.flatMap(({ plugin, file }) => (plugin !== undefined && file ? [plugin] : [])),
	)
	const picked = args.options.map((option) =>
		option.endsWith(`/${name.name}`) ? option.slice(0, -name.name.length - 1) : option,
	)
	const wrong = picked.filter((option) => option !== 'default' && !holders.has(option))
	if (wrong.length) {
		throw new ReferenceFailure(
			'step-invalid',
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

export type DeleteArgs = TargetArgs & { name: string; dryRun?: boolean | undefined }

export type DeleteResult = {
	name: string
	scope: WriteScope
	/** The file deleted, or the one looked for when there was none. */
	path: string
	/** A project section's folder, relative to the root. */
	folder?: string
	/** The metadata file (K31) that went with a non-Markdown file (R95). */
	metadataFile?: string
	dryRun: boolean
	/** The file held a selection (`extends`), which went with it. */
	selection?: string[]
	/** Set on a no-op: no file there to delete. */
	code?: 'no-file'
	/** What the notice says, for a person. */
	message?: string
	/** What answers the name once the file is gone. */
	after: ResolvedReference
}

function placeOf(target: WriteTarget): string {
	if (target.scope === 'project') return `project section for ${target.folder}`
	if (target.scope === 'default') return 'default'
	return `${target.scope} contribution`
}

/**
 * Deletes the file that answers the name at one place, `<name>/README.md` or a data file included
 * (J7), with the metadata file beside a non-Markdown one (R95); a metadata file alone, a selection,
 * goes by itself. A managed contribution or an installed copy is never deleted (R30).
 */
export function deleteContribution(
	layers: ReferenceLayers,
	args: DeleteArgs,
	options: ResolveOptions = {},
): DeleteResult {
	const { name, target, before } = validateWrite({ command: 'delete', ...args }, layers, options)
	const shown = options.display ?? ((path: string) => path)
	const dryRun = Boolean(args.dryRun)
	const file = answeringFile(target, name.name, options.without)
	const meta = metadataFile(target, name.name)
	const metaHeld = meta !== options.without && existsSync(meta)
	const path = file ?? (metaHeld ? meta : undefined)
	const place: Pick<DeleteResult, 'name' | 'scope' | 'folder'> = { name: name.name, scope: target.scope }
	if (target.folder !== undefined) place.folder = target.folder
	if (!path) {
		return {
			...place,
			path: target.path,
			dryRun,
			code: 'no-file',
			message: `${shown(target.path)} does not exist, so there is no ${placeOf(target)} of "${name.name}" to delete; nothing was deleted. ${describeAnswer(before, options.display)} An installed plugin's, a managed, or an installed skill's contribution is never deleted.`,
			after: before,
		}
	}
	const sidecar = file && formatOfFile(file) !== 'markdown' && metaHeld ? meta : undefined
	const frontmatter = formatOfFile(path) === 'markdown' ? path : sidecar
	const steps =
		frontmatter === undefined
			? undefined
			: readExtends(parseDocument(tryRead(frontmatter) ?? '', () => {}).metadata['extends'], () => {})
	if (!dryRun) {
		rmSync(path)
		if (sidecar) rmSync(sidecar)
		// A folder-form contribution leaves its folder behind; remove it only when nothing else is in it.
		if (dirname(path) !== target.dir) {
			try {
				rmdirSync(dirname(path))
			} catch {}
		}
	}
	const result: DeleteResult = {
		...place,
		path,
		dryRun,
		after: resolveReference(
			name,
			{ ...layers, projects: new Map() },
			{ ...options, without: dryRun ? path : undefined },
		),
	}
	if (sidecar) result.metadataFile = sidecar
	if (steps) result.selection = steps.map(({ target: step }) => step)
	return result
}
