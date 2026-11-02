import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, sep } from 'node:path'
import { editFrontmatter } from './create-reference.js'
import type { LoadReferenceOptions } from './load-reference.js'
import { baseLayers, type GeneratorBase, generatorBase } from './reference-base.js'
import type { ReferenceWarning } from './reference-codes.js'
import { hasBody, parseDocument } from './reference-document.js'
import type { ReferenceLayers } from './reference-layers.js'
import { generatedFrontmatter, isGenerated, recordedSources, sourceCatalog } from './reference-sources.js'
import { describeAnswer, hiddenWarning } from './reference-write.js'
import { type CustomizePlan, validateWrite } from './reference-write-checks.js'
import type { TargetArgs, WriteScope } from './reference-write-target.js'
import { type ResolvedReference, type ResolveOptions, resolveReference } from './resolve-reference.js'
import { type PlaceOptions, prepareWrite } from './write-reference.js'

export type { GeneratorBase } from './reference-base.js'

export type CustomizeArgs = TargetArgs & {
	name: string
	/** The picks, bottom first: each `<plugin>`, `<plugin>:<merge>`, or `default`; `none` alone removes them. */
	extends?: readonly string[] | undefined
	/** A YAML file holding the whole `extends` list, every step key kept. */
	extendsFile?: string | undefined
	/** The file holding the customizer's request (K22). */
	request?: string | undefined
	/** The file holding the body the generator wrote. */
	body?: string | undefined
	merge?: string | undefined
	implements?: string | undefined
	/** Return the generator's input and write nothing (R84). */
	base?: boolean | undefined
	dryRun?: boolean | undefined
}

/**
 * What `customize` did: printed the generator's input (`base`), wrote picks (`selection`), wrote a
 * generated body (`generated`), or removed the picks (`cleared`).
 */
export type CustomizeAction = 'base' | 'selection' | 'generated' | 'cleared'

export type CustomizeResult = {
	name: string
	scope: WriteScope
	action: CustomizeAction
	/** The file written, removed, or that would be: the Markdown file, a data file, or a metadata file holding picks. */
	path: string
	/** A project section's folder, relative to the root. */
	folder?: string
	/** The text written to `path`; none when the file was deleted. */
	content?: string
	/** A non-Markdown name's metadata file (K31), which holds the generated record (R92). */
	metadataFile?: string
	metadataContent?: string
	/** The picks written, as `extends` holds them. */
	extends?: unknown[]
	/** `--extends none` left the file with nothing in it, so it was deleted. */
	deleted?: boolean
	/** Set on a no-op: `--extends none` with no selection there. */
	code?: 'no-selection'
	/** What the notice says, for a person. */
	message?: string
	dryRun: boolean
	/** Things to know that are not faults, such as a generated body written against the old stack (R83). */
	hints: string[]
	/** Faults that did not stop the write: a contribution above that hides it (R26), or a managed `extends` deciding the stack (R109). */
	warnings: ReferenceWarning[]
	/** `base`: what the generator reads for the target. */
	base?: GeneratorBase
	/** The name resolved again after the write. */
	after?: ResolvedReference
}

/** The skill whose default is in the stack, with the plugin that ships it, when one does (K34). */
function defaultSkill(layers: ReferenceLayers): { skill: string; plugin?: string } | undefined {
	const layer = layers.layers.find(({ tier, skipped }) => tier === 'default' && !skipped)
	if (layer?.skill === undefined) return undefined
	const folder = dirname(layer.dir)
	const shipping = layers.layers.find(
		({ tier, plugin, dir }) => tier === 'plugin' && plugin !== undefined && folder.startsWith(dirname(dir) + sep),
	)
	return shipping?.plugin === undefined ? { skill: layer.skill } : { skill: layer.skill, plugin: shipping.plugin }
}

function bodyOf(plan: CustomizePlan) {
	const document = plan.held === undefined ? undefined : parseDocument(plan.held, () => {})
	const held = plan.format === 'markdown' ? hasBody(document?.body ?? '') : Boolean(plan.existing?.trim())
	return { metadata: document?.metadata ?? {}, held }
}

function write(path: string, content: string): void {
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
}

/**
 * Writes the picks into the target's `extends` (R79): a selection when the file has no body, else
 * only `extends` changes (R83). `--extends none` removes them, deleting a file left with nothing (R80).
 */
function writePicks(
	plan: CustomizePlan,
	layers: ReferenceLayers,
	result: CustomizeResult,
	options: ResolveOptions,
): CustomizeResult {
	const display = options.display ?? ((path: string) => path)
	const { name, holder, picks, before } = plan
	result.path = holder
	const { metadata, held } = bodyOf(plan)
	if (picks === 'none') {
		if (plan.held === undefined || !('extends' in metadata)) {
			return {
				...result,
				action: 'cleared',
				code: 'no-selection',
				message: `${display(holder)} holds no selection of "${name.name}", so nothing was removed. ${describeAnswer(before, options.display)}`,
				after: before,
			}
		}
		const content = editFrontmatter(plan.held, { extends: undefined })
		const deleted = !content.trim()
		result.action = 'cleared'
		if (deleted) result.deleted = true
		else result.content = content
		if (result.dryRun) return result
		if (deleted) rmSync(holder)
		else write(holder, content)
		return after(result, plan, layers, options)
	}
	const values = picks ? picks.values : []
	const content = editFrontmatter(plan.held ?? '', { extends: values })
	Object.assign(result, { action: 'selection', content, extends: values })
	const hidden = hiddenWarning(before, plan.target, holder, display)
	if (hidden) result.warnings.push(hidden)
	if (plan.base.trace.builtBy.startsWith('managed ')) {
		result.warnings.push({
			code: 'extends-not-used',
			message: `the picks are written to ${display(holder)}, but ${plan.base.trace.builtBy}'s extends builds the stack, so they are not used while it does.`,
		})
	}
	if (held && isGenerated(metadata)) {
		result.hints.push(
			`its body was generated from a request against the old stack; customize "${name.name}" again with that request (\`reference customize ${name.name} --request <file> --body <file>\`) to regenerate it on the new picks.`,
		)
	}
	if (result.dryRun) return result
	write(holder, content)
	return after(result, plan, layers, options)
}

/**
 * Writes a generated body (R81): the body as given, with frontmatter recording the picks it was
 * built on, each source with its installed version (K34), the request, and `merge`; a whole
 * implementation records `implements` and `merge: replace` and no sources (R111); a project section
 * records only its sources and request (K24). A non-Markdown name's body is written whole, its
 * record in the metadata file beside it (R92).
 */
function writeGenerated(
	plan: CustomizePlan,
	layers: ReferenceLayers,
	result: CustomizeResult,
	options: ResolveOptions,
): CustomizeResult {
	const display = options.display ?? ((path: string) => path)
	const { target, base, picks } = plan
	const project = target.scope === 'project'
	const implementing = !project && plan.implementsValue !== undefined
	const { metadata } = bodyOf(plan)
	const picked = picks && picks !== 'none' ? picks.values : metadata['extends']
	const sources =
		implementing || base.status !== 'found'
			? []
			: recordedSources(
					base.trace.stack,
					sourceCatalog(baseLayers(layers, target), { tier: target.scope === 'user' ? 'user' : 'repo' }),
					defaultSkill(layers),
				)
	const record = {
		extends: project || implementing ? undefined : picked,
		sources: undefined,
		request: undefined,
		...generatedFrontmatter({ sources, request: plan.request as string }),
	}
	const body = plan.body as string
	result.action = 'generated'
	result.path = plan.file
	if (plan.format === 'markdown') {
		const merge = project ? undefined : implementing ? 'replace' : (plan.merge ?? 'patch')
		const implementsValue = implementing ? plan.implementsValue : undefined
		result.content = editFrontmatter(body, { merge, implements: implementsValue, ...record })
	} else {
		result.content = body
		result.metadataFile = plan.holder
		result.metadataContent = editFrontmatter(plan.held ?? '', { merge: undefined, implements: undefined, ...record })
	}
	const hidden = hiddenWarning(plan.before, target, plan.file, display)
	if (hidden) result.warnings.push(hidden)
	if (result.dryRun) return result
	write(plan.file, result.content)
	if (result.metadataContent !== undefined) write(plan.holder, result.metadataContent)
	return after(result, plan, layers, options)
}

/** The name resolved again; a new project folder is found only by a fresh discovery. */
function after(
	result: CustomizeResult,
	plan: CustomizePlan,
	layers: ReferenceLayers,
	options: ResolveOptions,
): CustomizeResult {
	return { ...result, after: resolveReference(plan.name, { ...layers, projects: new Map() }, options) }
}

/**
 * Customizes a name for the `repo` or `user` tier or a folder's project section, running no model:
 * writes the picks (a selection), or a body the generator wrote with its record, or, with `base`,
 * returns what the generator reads and writes nothing. Every check runs first, in the order
 * `validateWrite` gives; a file a contribution above hides is written all the same, with a warning.
 */
export function customizeContribution(
	layers: ReferenceLayers,
	args: CustomizeArgs,
	options: ResolveOptions = {},
): CustomizeResult {
	const plan = validateWrite({ command: 'customize', ...args }, layers, options)
	const result: CustomizeResult = {
		name: plan.name.name,
		scope: plan.target.scope,
		action: 'base',
		path: plan.file,
		dryRun: Boolean(args.dryRun),
		hints: [],
		warnings: [],
	}
	if (plan.target.folder !== undefined) result.folder = plan.target.folder
	if (args.base) return { ...result, base: generatorBase(plan.base, plan.iface) }
	if (plan.request !== undefined) return writeGenerated(plan, layers, result, options)
	return writePicks(plan, layers, result, options)
}

export type CustomizeReferenceOptions = LoadReferenceOptions &
	Omit<PlaceOptions, 'pluginFolder'> & {
		/** The picks, bottom first: each `<plugin>`, `<plugin>:<merge>`, or `default`; `['none']` removes them. */
		extends?: readonly string[] | undefined
		/** A YAML file holding the whole `extends` list. */
		extendsFile?: string | undefined
		/** The file holding the customizer's request; pass it with `body`. */
		request?: string | undefined
		/** The file holding the body to write; pass it with `request`. */
		body?: string | undefined
		/** How a generated body applies over what is below: `patch` (default), `combine`, `replace`, or `remove`. */
		merge?: string | undefined
		/** An interface id: the body is a whole implementation of it. */
		implements?: string | undefined
		/** Return the generator's input (R84) and write nothing. */
		base?: boolean | undefined
	}

/**
 * Customizes a name the way `reference customize` does and returns its record: what was written,
 * its warnings (such as `reference-hidden`), and the name resolved after; with `base`, the
 * generator's input. A refused customization throws `ReferenceError` with its code, marked `usage`
 * for a wrong call.
 */
export async function customizeReference(name: string, options: CustomizeReferenceOptions): Promise<CustomizeResult> {
	const { layers, args } = await prepareWrite('customize', name, options)
	return customizeContribution(layers, args)
}
