import type { ReferenceWarning, ReferenceWarningCode } from './reference-codes.js'
import { hiderLabel, hidingLayer, projectHidingLayer } from './reference-hiding.js'
import type { ReferenceLayer, ReferenceLayers } from './reference-layers.js'
import { compareSources, readGeneratedRecord, sourceCatalog } from './reference-sources.js'
import type { ResolvedReference } from './resolve-reference.js'

/**
 * How `check` treats a warning composing a checked document raised (UC6.8). A `defect` is a fault
 * in the document itself, so it fails the `compose` check. An `environment` warning depends on what
 * is installed or chosen: it is passed on and never fails a check. A `project-section` warning is
 * about a project section, which `check` does not check (R33).
 */
export type CheckWarningClass = 'defect' | 'environment' | 'project-section'

export const checkWarningClass = {
	'frontmatter-invalid': 'defect',
	'merge-unknown': 'defect',
	'marker-unknown': 'defect',
	'marker-unmatched': 'defect',
	'heading-repeated': 'defect',
	'remove-body-ignored': 'defect',
	'extends-invalid': 'defect',
	'extends-self': 'defect',
	'extends-step-missing': 'environment',
	'extends-all-missing': 'environment',
	'extends-not-used': 'environment',
	'section-not-held': 'environment',
	'default-not-selected': 'environment',
	'plugin-not-selected': 'environment',
	'default-folder-missing': 'environment',
	'default-in-tier': 'defect',
	'file-ignored': 'defect',
	'format-mismatch': 'defect',
	'metadata-ignored': 'defect',
	'project-section-key-ignored': 'project-section',
	'interface-not-composed': 'defect',
	'interface-check': 'environment',
	'base-moved': 'environment',
	'reference-stale': 'environment',
	'reference-renamed': 'environment',
	'alias-not-used': 'environment',
	'alias-invalid': 'defect',
	'project-section-not-markdown': 'project-section',
	'reference-hidden': 'environment',
	'repo-hides-user': 'environment',
} as const satisfies Record<ReferenceWarningCode, CheckWarningClass>

/** The warnings composing raised, split into the defects that fail `compose` and the ones passed on. */
export function splitComposeWarnings(warnings: readonly ReferenceWarning[]): {
	defects: ReferenceWarning[]
	passed: ReferenceWarning[]
} {
	const defects: ReferenceWarning[] = []
	const passed: ReferenceWarning[] = []
	for (const warning of warnings) {
		const kind: CheckWarningClass = checkWarningClass[warning.code]
		if (kind === 'defect') defects.push(warning)
		else if (kind === 'environment') passed.push(warning)
	}
	return { defects, passed }
}

type Display = (path: string) => string

/**
 * A warning for each `repo` or `user` file, and each project section, that a `replace` or `remove`
 * above hides (R112), naming the nearest one (J6). A `user` file under this repository's `repo`
 * contribution is `repo-hides-user`. Only the managed contribution applies over a project section.
 */
export function hiddenWarnings(resolved: ResolvedReference, display: Display): ReferenceWarning[] {
	const warnings: ReferenceWarning[] = []
	const message = (path: string, label: string) =>
		`${display(path)} is hidden: ${label} applies above it, so load does not read it until that contribution changes`
	for (const layer of resolved.trace.layers) {
		if ((layer.tier !== 'repo' && layer.tier !== 'user') || !layer.file) continue
		const hider = hidingLayer(resolved, layer.path, layer.path)
		if (!hider) continue
		warnings.push({
			code: layer.tier === 'user' && hider.tier === 'repo' ? 'repo-hides-user' : 'reference-hidden',
			message: message(layer.path, hiderLabel(hider, display)),
		})
	}
	const managed = projectHidingLayer(resolved)
	if (managed) {
		for (const section of resolved.trace.projectSections) {
			// A package plugin's file is the plugin's, not a customizer's to move.
			if (!section.file || section.plugin !== undefined || !section.outcome.startsWith('shadowed by')) continue
			warnings.push({ code: 'reference-hidden', message: message(section.path, hiderLabel(managed, display)) })
		}
	}
	return warnings
}

/**
 * A warning for each plugin's or default's file the document uses whose recorded `sources` name a
 * plugin at a version other than the one installed (R86): the delta was written against another
 * base. Only `check` raises it; `load` compares only a `repo` or `user` document's sources (R101).
 */
export function baseMovedWarnings(
	resolved: ResolvedReference,
	source: ReferenceLayers | readonly ReferenceLayer[],
): ReferenceWarning[] {
	const warnings: ReferenceWarning[] = []
	let catalog: ReturnType<typeof sourceCatalog> | undefined
	for (const layer of resolved.trace.layers) {
		if (layer.tier !== 'plugin' && layer.tier !== 'default') continue
		if (!layer.file || !layer.frontmatter || (layer.outcome !== 'used' && layer.outcome !== 'stale')) continue
		const { sources } = readGeneratedRecord(layer.frontmatter)
		if (!sources) continue
		catalog ??= sourceCatalog(source, { tier: 'plugin' })
		const owner = layer.tier === 'plugin' ? `plugin ${layer.plugin}` : `default of ${layer.skill}`
		for (const row of compareSources(sources, catalog)) {
			if (row.status !== 'changed') continue
			const base =
				row.default !== undefined ? `the default of ${row.default} (plugin ${row.plugin})` : `plugin ${row.plugin}`
			warnings.push({
				code: 'base-moved',
				message: `${owner}: it records ${base} at ${row.recorded}, and ${row.installed ?? 'a version with no number'} is installed; review it against the installed base and record the new version`,
			})
		}
	}
	return warnings
}
