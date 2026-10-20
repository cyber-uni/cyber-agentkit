import { join, relative } from 'node:path'
import { headingPaths } from './reference-document.js'
import { projectReferencesDir, type ReferenceLayer, type ReferenceLayers } from './reference-layers.js'
import type { ReferenceName } from './reference-name.js'
import type { ReferenceWarning } from './reference-warning.js'
import {
	parseReferenceName,
	type ReferenceStatus,
	type ReferenceTraceLayer,
	resolveReference,
} from './resolve-reference.js'

/** A file a customization or a selection of the name is written to. */
export type ReferenceWherePlace = {
	scope: 'project' | 'user'
	/** The project path is relative to the root; the user path is shown as the command displays it. */
	path: string
	reaches: string
	/** `used`, `shadowed by ...`, or `not used (...)` when the file exists; `empty` when it does not. */
	status: string
	/** The heading paths of the document below it, which a section operation can target. */
	sections: string[]
}

export type ReferenceWhereReport = {
	name: string
	status: ReferenceStatus
	places: ReferenceWherePlace[]
	/** When `ambiguous`: the options a selection written to a place chooses between. */
	options?: string[]
	/** Every layer checked, highest first; a plugin's or a default contribution is read-only. */
	layers: ReferenceTraceLayer[]
	warnings: ReferenceWarning[]
}

export type WhereOptions = {
	/** Absolute; a project write goes to its `.agents/references/`, and a project path is shown relative to it. */
	root: string
	/** How a path outside the project is shown, such as with the home directory collapsed to `~`. */
	display?: ((path: string) => string) | undefined
}

const reaches = {
	project: 'everyone working in this repository',
	user: 'only you, in every repository',
} as const

/** The project and user files a customization of `name` is written to, with the document below each. */
export function whereReference(
	input: string | ReferenceName,
	source: ReferenceLayers | readonly ReferenceLayer[],
	{ root, display = (path) => path }: WhereOptions,
): ReferenceWhereReport {
	const name = typeof input === 'string' ? parseReferenceName(input) : input
	const resolved = resolveReference(name, source, { display })
	const report: ReferenceWhereReport = {
		name: name.raw,
		status: resolved.status,
		places: [],
		layers: resolved.trace.layers,
		warnings: resolved.warnings,
	}
	if (resolved.options) report.options = resolved.options
	if (name.invalid) return report
	const layers = Array.isArray(source) ? (source as readonly ReferenceLayer[]) : (source as ReferenceLayers).layers
	const projectDir = projectReferencesDir(root)
	const userDir = layers.find(({ tier }) => tier === 'user')?.dir
	const targets: { scope: 'project' | 'user'; dir: string }[] = [
		{ scope: 'project', dir: projectDir },
		...(userDir ? [{ scope: 'user' as const, dir: userDir }] : []),
	]
	for (const { scope, dir } of targets) {
		const path = join(dir, `${name.name}.md`)
		const entry = resolved.trace.layers.find((layer) => layer.path === path)
		const below = resolveReference(name, source, { display, below: dir })
		report.places.push({
			scope,
			path: scope === 'project' ? relative(root, path) : display(path),
			reaches: reaches[scope],
			status: entry?.file ? entry.outcome : 'empty',
			sections: below.status === 'found' ? headingPaths(below.content ?? '') : [],
		})
	}
	return report
}
