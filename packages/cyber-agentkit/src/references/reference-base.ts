import { implementationTemplate } from './create-reference.js'
import { type Contribution, contributionLabel } from './reference-contribution.js'
import type { ReferenceInterface } from './reference-interface.js'
import type { ReferenceLayer, ReferenceLayers } from './reference-layers.js'
import type { ReferenceName } from './reference-name.js'
import type { WriteTarget } from './reference-write-target.js'
import {
	type ContributionAdjust,
	type ExtendsStep,
	type ResolvedProjectSection,
	type ResolvedReference,
	type ResolveOptions,
	resolveAdjusted,
} from './resolve-reference.js'

/** What the generator reads for a target (R84): the interface's stub when one is named, then the main document. */
export type GeneratorBase = {
	/** The stub, then the main document built for the target; empty when neither is there. */
	content: string
	/** For a folder target: the project sections of the folders above it, then the package plugins' for its own, in path order. */
	projectSections: ResolvedProjectSection[]
	/** The interface's stub, when one is named. */
	stub?: string
	/** The main document built for the target, which a request records the sources of. */
	resolved: ResolvedReference
}

/**
 * The layers the generator reads for a target (R84): never the tier above it, nor personal text in a
 * shared file. A `repo` or folder target leaves out the `user` tier; a `user` target leaves out the
 * `repo` tier and every plugin found only through a repository's `package.json` (R13).
 */
export function baseLayers(layers: ReferenceLayers, target: Pick<WriteTarget, 'scope'>): ReferenceLayers {
	const user = target.scope === 'user'
	const kept = layers.layers.filter((layer: ReferenceLayer) => {
		if (user) return layer.tier !== 'repo' && !(layer.tier === 'plugin' && layer.origin === 'dependency')
		return layer.tier !== 'user'
	})
	const plugins = user ? layers.plugins?.filter(({ origin }) => origin !== 'dependency') : layers.plugins
	return { ...layers, layers: kept, ...(plugins ? { plugins } : {}) }
}

/** A contribution's text left out, its `extends` kept: what a managed contribution or the target gives the base. */
function structureOnly(contribution: Contribution, steps: ExtendsStep[] | undefined): Contribution {
	contribution.entry.empty = true
	return { ...contribution, body: '', hasBody: false, merge: undefined, steps }
}

/**
 * The name resolved for the generator (R84, J4): managed text is left out though a managed `extends`
 * still builds the stack, and the target file adds only its `extends`, or `steps` in its place (the
 * picks; `null` for none). For a folder target, the main document is followed by the project sections
 * of the folders above it and the package plugins' sections for its own folder (R84), never the
 * target's own or a deeper one; a `repo` or `user` target gets the main document alone.
 */
export function resolveBase(
	name: ReferenceName,
	layers: ReferenceLayers,
	target: WriteTarget,
	steps: ExtendsStep[] | null | undefined,
	options: ResolveOptions = {},
): ResolvedReference {
	const display = options.display ?? ((path: string) => path)
	const adjust: ContributionAdjust = (layer, read, entry) => {
		if (layer.tier === 'managed') {
			if (!read) return undefined
			if (read.whole) {
				entry.outcome = 'not read (managed text is left out)'
				return undefined
			}
			return structureOnly(read, read.steps)
		}
		if (target.scope === 'project' || layer.dir !== target.dir) return read
		const picks = steps === undefined ? read?.steps : (steps ?? undefined)
		if (!picks) {
			if (read) entry.outcome = 'not read (the target is left out)'
			return undefined
		}
		if (read && !read.whole) return structureOnly(read, picks)
		Object.assign(entry, { path: target.path, file: `${name.name}.md`, outcome: '', selection: true })
		return {
			layer,
			entry,
			label: contributionLabel(layer, target.path, display),
			path: target.path,
			metadata: {},
			body: '',
			hasBody: false,
			format: 'markdown',
			whole: false,
			merge: undefined,
			steps: picks,
		}
	}
	const resolved = resolveAdjusted(name, baseLayers(layers, target), options, adjust)
	const folder = target.folder
	const projectSections =
		folder === undefined
			? []
			: resolved.projectSections.filter(
					(section) =>
						folder.startsWith(`${section.folder}/`) || (section.folder === folder && section.plugin !== undefined),
				)
	return { ...resolved, projectSections }
}

/** The generator's input: the interface's stub, when one is named, followed by the resolved base when it is found. */
export function generatorBase(resolved: ResolvedReference, iface: ReferenceInterface | undefined): GeneratorBase {
	const stub = iface ? implementationTemplate(iface).body.trim() : undefined
	const main = resolved.status === 'found' ? (resolved.content ?? '').trim() : ''
	const parts = [stub, main].filter((part): part is string => Boolean(part))
	const base: GeneratorBase = {
		content: parts.length ? `${parts.join('\n\n')}\n` : '',
		projectSections: resolved.status === 'found' ? resolved.projectSections : [],
		resolved,
	}
	if (stub !== undefined) base.stub = `${stub}\n`
	return base
}
