import { dirname, resolve } from 'node:path'
import { catalogNames } from '../references/reference-catalog.js'
import type { ReferenceLayers } from '../references/reference-layers.js'
import { resolveReference } from '../references/resolve-reference.js'
import { parseAspectChecks } from './aspect-checks.js'
import type { AspectCheck } from './skill-check-types.js'

/** The family of swappable aspects, and the two core aspects that must be in it. */
export const aspectFamily = 'skill-design.aspects'
export const swappableCore = ['criteria', 'verification'] as const

/** One swappable aspect as the references resolve it. */
export type LoadedAspect = {
	aspect: string
	name: string
	implementation: string
	checks: AspectCheck[]
	/** The check script's absolute path, from `check-script` in the front matter, relative to the document that set it. */
	checkScript?: string
	/** Set when the name did not resolve. */
	problem?: string
	warnings: string[]
}

/** Every `skill-design.aspects.<aspect>` the layers hold, Criteria and Verification first, then the open ones by name. */
export function aspectNames(layers: ReferenceLayers): string[] {
	const open = catalogNames(layers)
		.filter((name) => name.startsWith(`${aspectFamily}.`) && !name.endsWith('.interface'))
		.map((name) => name.slice(aspectFamily.length + 1))
		.filter((aspect) => !aspect.includes('.') && !(swappableCore as readonly string[]).includes(aspect))
		.sort()
	return [...swappableCore, ...new Set(open)].map((aspect) => `${aspectFamily}.${aspect}`)
}

export function loadAspect(name: string, layers: ReferenceLayers, display: (path: string) => string): LoadedAspect {
	const aspect = name.slice(aspectFamily.length + 1)
	const resolved = resolveReference(name, layers, { display })
	const warnings = resolved.warnings.map(({ code, message }) => `${code}: ${message}`)
	if (resolved.status !== 'found' || resolved.content === undefined) {
		return {
			aspect,
			name,
			implementation: 'none',
			checks: [],
			problem: resolved.message ?? `${name} is ${resolved.status}`,
			warnings,
		}
	}
	const used = resolved.trace.layers.filter((layer) => layer.outcome === 'used')
	const top = used[0]
	const implementation = top ? (top.plugin ?? top.tier) : 'unknown'
	const loaded: LoadedAspect = {
		aspect,
		name,
		implementation,
		checks: parseAspectChecks(resolved.content),
		warnings,
	}
	const script = resolved.metadata?.['check-script']
	if (typeof script === 'string' && script.trim()) {
		const from = used.find((layer) => typeof layer.frontmatter?.['check-script'] === 'string')
		if (from) loaded.checkScript = resolve(dirname(from.path), script.trim())
	}
	return loaded
}
