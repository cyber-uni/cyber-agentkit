import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, sep } from 'node:path'
import { editFrontmatter } from './create-reference.js'
import type { LoadReferenceOptions } from './load-reference.js'
import { baseLayers, type GeneratorBase, generatorBase } from './reference-base.js'
import { interfaceLookup } from './reference-check.js'
import type { ReferenceWarning } from './reference-codes.js'
import { hasBody, parseDocument } from './reference-document.js'
import { ReferenceFailure } from './reference-error.js'
import { familyInterfaces } from './reference-implementations.js'
import type { ReferenceLayers } from './reference-layers.js'
import { type FamilyName, isFamilyName, parseFamily } from './reference-name.js'
import {
	generatedFrontmatter,
	isGenerated,
	type ReferenceSource,
	recordedSources,
	sourceCatalog,
} from './reference-sources.js'
import { type ExtendsStep, readExtends } from './reference-stack.js'
import { describeAnswer, hiddenWarning } from './reference-write.js'
import { type CustomizePlan, readExtendsFile, validateWrite } from './reference-write-checks.js'
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
		const content = editFrontmatter(plan.held, { extends: undefined, declined: undefined })
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
	const content = editFrontmatter(plan.held ?? '', { extends: values, declined: declinedBy(plan, values) })
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
 * The package plugins (K36) whose sections a folder target's base holds, each with its installed
 * version, so the section goes stale when one changes (UC21.7). A plugin already in the stack is
 * recorded once.
 */
function packageSources(base: ResolvedReference): ReferenceSource[] {
	const inStack = new Set(base.trace.stack)
	const used = new Set(base.projectSections.flatMap(({ plugin }) => (plugin === undefined ? [] : [plugin])))
	const sources = new Map<string, ReferenceSource>()
	for (const { plugin, version } of base.trace.projectSections) {
		if (plugin === undefined || !used.has(plugin) || inStack.has(plugin) || sources.has(plugin)) continue
		sources.set(plugin, version === undefined ? { plugin } : { plugin, version })
	}
	return [...sources.values()]
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
			: [
					...recordedSources(
						base.trace.stack,
						sourceCatalog(baseLayers(layers, target), { tier: target.scope === 'user' ? 'user' : 'repo' }),
						defaultSkill(layers),
					),
					...(project ? packageSources(base) : []),
				]
	const written = !project && !implementing && picked !== undefined
	const record = {
		extends: written ? picked : undefined,
		declined: written ? declinedBy(plan, picked) : undefined,
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

/**
 * The plugins the written picks leave out (R114): each plugin that holds the name now and the stack
 * those picks build does not place, so load stops asking about them (R113). The picks are expanded
 * themselves, so a managed `extends` building the stack in their place (R109) changes nothing here.
 * `undefined` when none.
 */
function declinedBy(plan: CustomizePlan, picks: unknown): string[] | undefined {
	const steps = readExtends(picks, () => {})
	if (!steps) return undefined
	const own = new Map<string, unknown>()
	// The base reads the plugins the target's tier can pick: a `user` one, only the enabled plugins (R84).
	for (const { tier, plugin, file, outcome, frontmatter } of plan.base.trace.layers) {
		if (tier !== 'plugin' || plugin === undefined || file === undefined || outcome.startsWith('not read')) continue
		if (!own.has(plugin)) own.set(plugin, frontmatter?.['extends'])
	}
	const placed = new Set<string>()
	const place = (list: readonly ExtendsStep[]): void => {
		for (const step of list) {
			if (placed.has(step.target)) continue
			placed.add(step.target)
			place(step.extends ?? readExtends(own.get(step.target), () => {}) ?? [])
		}
	}
	place(steps)
	const declined = [...own.keys()].filter((plugin) => !placed.has(plugin))
	return declined.length ? declined : undefined
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

/** What `customize <family>` did for one interface of the family (R131 to R133). */
export type FamilyCustomizeEntry = {
	interface: string
	/** `written`: the picks went to the file (R131). `kept`: no step can answer it (R132). `skipped`: it is a `many` interface (R133). */
	outcome: 'written' | 'kept' | 'skipped'
	/** Why nothing was written, for `kept` and `skipped`. */
	reason?: string
	/** What `customize <id>` with the same steps returned, for `written`. */
	result?: CustomizeResult
}

/** What `customize <prefix>.*` did: one entry per matched interface, in name order (UC24). */
export type FamilyCustomizeResult = {
	family: string
	scope: WriteScope
	dryRun: boolean
	interfaces: FamilyCustomizeEntry[]
}

/** Whether a step, at any depth, gives `sections`: they differ per interface, so a family takes none (UC24.4). */
function givesSections(value: unknown): boolean {
	if (Array.isArray(value)) return value.some(givesSections)
	if (typeof value !== 'object' || value === null) return false
	return Object.values(value).some((keys) => {
		if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) return false
		const record = keys as Record<string, unknown>
		return record['sections'] !== undefined || givesSections(record['extends'])
	})
}

/**
 * Customizes every `one` interface of a family (K39) with the same steps (R131): for each, the file
 * `customize <id>` with those steps writes, in the tier asked. An interface no step can answer keeps
 * what it had (R132); a `many` interface is skipped (R133). Every interface is planned first, so a
 * refusal for any of them, a family matching none (R135), or a step giving `sections` leaves every
 * file as it was.
 */
export function customizeFamily(
	layers: ReferenceLayers,
	args: CustomizeArgs,
	options: ResolveOptions = {},
): FamilyCustomizeResult {
	const parsed = parseFamily(args.name)
	if (parsed.invalid !== undefined) throw new ReferenceFailure('name-invalid', parsed.invalid)
	// Usage errors first, as for one name; the prefix stands in for the name.
	const usage = validateWrite({ command: 'customize', ...args, name: parsed.prefix })
	const given = [args.base, args.request, args.body, args.implements, args.merge].some((value) => value !== undefined)
	if (given) {
		throw new ReferenceFailure(
			'options-conflict',
			'a family takes only picks: --extends or --extends-file, with --scope and --dry-run; a body, a merge, or a base is per name.',
		)
	}
	const picks = args.extendsFile === undefined ? usage.picks : readExtendsFile(args.extendsFile)
	if (picks !== undefined && picks !== 'none' && givesSections(picks.values)) {
		throw new ReferenceFailure(
			'step-invalid',
			`a step of ${args.name} gives sections, which differ per interface; pick for one interface at a time to change sections.`,
		)
	}
	const lookup = interfaceLookup(layers, options)
	const ids = familyInterfaces(args.name, layers, options)
	const planned = ids.map((id): FamilyCustomizeEntry & { answer?: CustomizeArgs } => {
		const cardinality = lookup(id).value?.cardinality
		if (cardinality === 'many') {
			return { interface: id, outcome: 'skipped', reason: `${id} is a many interface, which has no single pick.` }
		}
		const each = { ...args, name: id }
		try {
			const plan = validateWrite({ command: 'customize', ...each }, layers, options)
			if (picks !== 'none' && plan.base.status !== 'found') {
				return { interface: id, outcome: 'kept', reason: `no step holds ${id}; it keeps what it had.` }
			}
		} catch (error) {
			if (error instanceof ReferenceFailure && error.code === 'step-invalid') {
				return { interface: id, outcome: 'kept', reason: `${error.message} It keeps what it had.` }
			}
			throw error
		}
		return { interface: id, outcome: 'written', answer: each }
	})
	const interfaces = planned.map(({ answer, ...entry }) =>
		answer === undefined ? entry : { ...entry, result: customizeSingle(layers, answer, options) },
	)
	return { family: args.name, scope: (args.scope ?? 'repo') as WriteScope, dryRun: Boolean(args.dryRun), interfaces }
}

/**
 * What customizing a name of type `Name` returns: the family's result for a `<prefix>.*` literal, a
 * single name's for any other literal, and either for a plain `string` (a name built at runtime),
 * which `'family' in result` tells apart.
 */
export type CustomizationOf<Name extends string> = string extends Name
	? CustomizeResult | FamilyCustomizeResult
	: Name extends FamilyName
		? FamilyCustomizeResult
		: CustomizeResult

/**
 * Customizes a name for the `repo` or `user` tier or a folder's project section, running no model:
 * writes the picks (a selection), or a body the generator wrote with its record, or, with `base`,
 * returns what the generator reads and writes nothing. Every check runs first, in the order
 * `validateWrite` gives; a file a contribution above hides is written all the same, with a warning.
 */
export function customizeContribution<Name extends string>(
	layers: ReferenceLayers,
	args: CustomizeArgs & { name: Name },
	options?: ResolveOptions,
): CustomizationOf<Name>
export function customizeContribution(
	layers: ReferenceLayers,
	args: CustomizeArgs,
	options: ResolveOptions = {},
): CustomizeResult | FamilyCustomizeResult {
	if (isFamilyName(args.name) || args.name.includes('*')) return customizeFamily(layers, args, options)
	return customizeSingle(layers, args, options)
}

/** Customizes one name that is not a family. */
function customizeSingle(layers: ReferenceLayers, args: CustomizeArgs, options: ResolveOptions): CustomizeResult {
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
 * generator's input. Given a family (`<prefix>.*`, K39) it customizes every `one` interface under the
 * prefix with the same picks and returns a {@link FamilyCustomizeResult}; a name held in a
 * `string` is typed as either result; tell them apart with `'family' in result`.
 * A refused customization throws `ReferenceError` with its code, marked `usage`
 * for a wrong call.
 */
export async function customizeReference<Name extends string>(
	name: Name,
	options: CustomizeReferenceOptions,
): Promise<CustomizationOf<Name>>
export async function customizeReference(
	name: string,
	options: CustomizeReferenceOptions,
): Promise<CustomizeResult | FamilyCustomizeResult> {
	const { layers, args } = await prepareWrite('customize', name, options)
	return customizeContribution(layers, args)
}
