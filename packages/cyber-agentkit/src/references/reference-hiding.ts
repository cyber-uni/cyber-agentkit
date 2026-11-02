import type { ReferenceTier } from './reference-layers.js'
import type { ReferenceTraceLayer, ResolvedReference } from './resolve-reference.js'

/** The tiers that apply over the stack, highest first; a plugin and `default` sit on the stack under them. */
function isTiered(tier: ReferenceTier): boolean {
	return tier === 'managed' || tier === 'repo' || tier === 'project' || tier === 'user'
}

/** A contribution that drops everything below it: a `replace` with a body, or a `remove`. */
function hides(layer: ReferenceTraceLayer): boolean {
	// A stale document is still used, so it still hides (R101).
	if (!layer.file || (layer.outcome !== 'used' && layer.outcome !== 'stale')) return false
	return layer.operation === 'remove' || (layer.operation === 'replace' && !layer.empty)
}

function stackTarget(layer: ReferenceTraceLayer): string {
	return layer.tier === 'default' ? 'default' : (layer.plugin ?? '')
}

/**
 * The contributions above the file at `dir` or `path`, nearest first. Over a tier stand the tiers
 * above it; over a stack entry stand the entries above it on the stack, then every tier from `user`
 * up. A folder that is not a layer the name reads has nothing above it.
 */
function above(resolved: ResolvedReference, dir: string, path: string): ReferenceTraceLayer[] {
	const layers = resolved.trace.layers
	const at = layers.findIndex((layer) => layer.path === dir || layer.path === path)
	const target = layers[at]
	if (!target) return []
	const tiersAbove = (end: number) =>
		layers
			.slice(0, end)
			.filter(({ tier }) => isTiered(tier))
			.reverse()
	if (isTiered(target.tier)) return tiersAbove(at)
	const { stack } = resolved.trace
	const position = stack.indexOf(stackTarget(target))
	const higher =
		position === -1
			? []
			: layers
					.filter((layer) => !isTiered(layer.tier) && stack.indexOf(stackTarget(layer)) > position)
					.sort((a, b) => stack.indexOf(stackTarget(a)) - stack.indexOf(stackTarget(b)))
	return [...higher, ...tiersAbove(layers.length)]
}

/** How a hiding contribution is named: `<tier>[ <plugin>] <path> (<operation>)`. */
export function hiderLabel(layer: ReferenceTraceLayer, display: (path: string) => string = (path) => path): string {
	return `${layer.tier}${layer.plugin ? ` ${layer.plugin}` : ''} ${display(layer.path)} (${layer.operation})`
}

/**
 * The contribution that hides the file at `dir` or `path`: the nearest `replace` with a body or
 * `remove` above it (J6); `undefined` when nothing does, or when the folder is not a layer the name
 * reads.
 */
export function hidingLayer(resolved: ResolvedReference, dir: string, path: string): ReferenceTraceLayer | undefined {
	return above(resolved, dir, path).find(hides)
}

/**
 * What hides a project section: only the managed contribution applies over one, so a managed
 * `replace` with a body or a managed `remove` (UC10.4).
 */
export function projectHidingLayer(resolved: ResolvedReference): ReferenceTraceLayer | undefined {
	return resolved.trace.layers.find((layer) => layer.tier === 'managed' && hides(layer))
}

/**
 * What hides the file at `dir` or `path`: the nearest `replace` with a body or `remove` above it
 * (J6), labeled `<tier>[ <plugin>] <path> (<operation>)`; `undefined` when nothing does.
 */
export function hiddenBy(resolved: ResolvedReference, dir: string, path: string): string | undefined {
	const hider = hidingLayer(resolved, dir, path)
	return hider ? hiderLabel(hider) : undefined
}
