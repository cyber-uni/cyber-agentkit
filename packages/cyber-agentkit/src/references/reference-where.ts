import { join, relative } from 'node:path'
import type { ReferenceWarning } from './reference-codes.js'
import { headingPaths } from './reference-document.js'
import { hiderLabel, hidingLayer, projectHidingLayer } from './reference-hiding.js'
import { type ReferenceLayer, type ReferenceLayers, repoReferencesDir } from './reference-layers.js'
import { type ReferenceName, requireName } from './reference-name.js'
import { answeringFile, inFolder, reachOf, type WriteTarget } from './reference-write-target.js'
import {
	parseReferenceName,
	type ReferenceStatus,
	type ReferenceTraceLayer,
	resolveReference,
} from './resolve-reference.js'

/** A file a customization or a selection of the name is written to. A plugin's or a default's is read-only, never one. */
export type ReferenceWhereFile = {
	/** `repo`, `user`, or the `--in` folder, relative to the root with `/`. */
	scope: string
	/** The file that answers there now, else the `<name>.md` a write creates; relative to the root, except a `user` one. */
	path: string
	/** Who a file there reaches. */
	reaches: string
	/** The contribution above that hides a file there, file there or not (R57, UC2.10). */
	hiddenBy?: string
}

export type ReferenceWhereReport = {
	name: string
	status: ReferenceStatus
	files: ReferenceWhereFile[]
	/** The main document's heading paths, which a section operation can target. */
	headings: string[]
	/** The plugins and `default` the stack uses, bottom first: read-only. */
	used: string[]
	/** When `ambiguous`: the options a selection written to a file chooses between. */
	options?: string[]
	/** Every layer checked, highest first; a plugin's or a default contribution is read-only. */
	layers: ReferenceTraceLayer[]
	warnings: ReferenceWarning[]
}

export type WhereOptions = {
	/** Absolute; a repo write goes to its `.agents/references/`, and a repo path is shown relative to it. */
	root: string
	/** How a path outside the project is shown, such as with the home directory collapsed to `~`. */
	display?: ((path: string) => string) | undefined
	/** A folder strictly below the root, whose project section file is also given (`in-not-below-root` otherwise). */
	in?: string | undefined
}

/**
 * The files a customization of `name` is written to, `repo` and `user` and, with `in`, that folder's
 * project section, each with who it reaches and what hides it; the main document's heading paths;
 * and the plugins the stack uses, which are read-only. An `ambiguous` name is an answer, with its
 * options.
 */
export function whereReference(
	input: string | ReferenceName,
	source: ReferenceLayers | readonly ReferenceLayer[],
	{ root, display = (path) => path, in: folder }: WhereOptions,
): ReferenceWhereReport {
	if (typeof input === 'string') requireName(input)
	const project = folder === undefined ? undefined : inFolder(folder, root)
	const name = typeof input === 'string' ? parseReferenceName(input) : input
	const resolved = resolveReference(name, source, { display })
	const report: ReferenceWhereReport = {
		name: name.raw,
		status: resolved.status,
		files: [],
		headings: resolved.status === 'found' && resolved.format === 'markdown' ? headingPaths(resolved.content ?? '') : [],
		used: resolved.trace.stack,
		layers: resolved.trace.layers,
		warnings: resolved.warnings,
	}
	if (resolved.options) report.options = resolved.options
	if (name.invalid) return report
	const layers = Array.isArray(source) ? (source as readonly ReferenceLayer[]) : (source as ReferenceLayers).layers
	const userDir = layers.find(({ tier }) => tier === 'user')?.dir
	const targets: WriteTarget[] = [
		{ scope: 'repo', dir: repoReferencesDir(root), path: '' },
		...(userDir ? [{ scope: 'user' as const, dir: userDir, path: '' }] : []),
		...(project
			? [
					{
						scope: 'project' as const,
						dir: join(project.path, '.agents', 'references'),
						path: '',
						folder: project.folder,
					},
				]
			: []),
	]
	for (const target of targets) {
		const path = answeringFile(target, name.name) ?? join(target.dir, `${name.name}.md`)
		const hider = target.scope === 'project' ? projectHidingLayer(resolved) : hidingLayer(resolved, target.dir, path)
		const file: ReferenceWhereFile = {
			scope: target.folder ?? target.scope,
			path: target.scope === 'user' ? display(path) : relative(root, path),
			reaches: reachOf(target),
		}
		if (hider) file.hiddenBy = hiderLabel(hider, display)
		report.files.push(file)
	}
	return report
}
