import { join, relative } from 'node:path'
import { type AssetLayer, type AssetLayers, type AssetWarning, projectAssetsDir } from './asset-layers.js'
import { type AssetName, assetDataExtensions, parseAssetName } from './asset-name.js'
import { type AssetStatus, type AssetTraceLayer, resolveAsset } from './resolve-asset.js'

/** A file an override or a selection of the name is written to. */
export type AssetWherePlace = {
	scope: 'project' | 'user'
	/** The project path is relative to the root; the user path is shown as the command displays it. */
	path: string
	reaches: string
	/** `used`, `shadowed by ...`, or `not used (...)` when the file exists; `empty` when it does not. */
	status: string
	sections: string[]
}

export type AssetWhereReport = {
	name: string
	status: AssetStatus
	places: AssetWherePlace[]
	/** When `ambiguous`: the options a selection written to a place chooses between. */
	options?: string[]
	/** Every layer checked, highest first; a plugin's or a default file is read-only. */
	layers: AssetTraceLayer[]
	warnings: AssetWarning[]
}

export type AssetWhereOptions = {
	/** Absolute; a project write goes to its `.agents/assets/`, and a project path is shown relative to it. */
	root: string
	/** How a path outside the project is shown, such as with the home directory collapsed to `~`. */
	display?: ((path: string) => string) | undefined
}

const reaches = {
	project: 'everyone working in this repository',
	user: 'only you, in every repository',
} as const

/** The project and user folders an override of the asset `name` is written to. */
export function whereAsset(
	input: string | AssetName,
	source: AssetLayers | readonly AssetLayer[],
	{ root, display = (path) => path }: AssetWhereOptions,
): AssetWhereReport {
	const name = typeof input === 'string' ? parseAssetName(input) : input
	const resolved = resolveAsset(name, source, { display })
	const report: AssetWhereReport = {
		name: name.raw,
		status: resolved.status,
		places: [],
		layers: resolved.trace.layers,
		warnings: resolved.warnings,
	}
	if (resolved.options) report.options = resolved.options
	if (name.invalid) return report
	const layers = Array.isArray(source) ? (source as readonly AssetLayer[]) : (source as AssetLayers).layers
	const userDir = layers.find(({ tier }) => tier === 'user')?.dir
	const targets: { scope: 'project' | 'user'; dir: string }[] = [
		{ scope: 'project', dir: projectAssetsDir(root) },
		...(userDir ? [{ scope: 'user' as const, dir: userDir }] : []),
	]
	for (const { scope, dir } of targets) {
		const held = [
			join(dir, `${name.name}.md`),
			...assetDataExtensions.map(({ extension }) => join(dir, `${name.name}${extension}`)),
		]
		const entry = resolved.trace.layers.find((layer) => held.includes(layer.path))
		report.places.push({
			scope,
			path: `${scope === 'project' ? relative(root, dir) : display(dir)}/${name.name}.<ext>`,
			reaches: reaches[scope],
			status: entry?.file ? entry.outcome : 'empty',
			sections: [],
		})
	}
	return report
}
