import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { dataExtensions } from '../references/reference-format.js'
import { projectReferencesDir, type ReferenceLayers, userReferencesDir } from '../references/reference-layers.js'
import { parseReferenceName } from '../references/reference-name.js'
import { resolveReference } from '../references/resolve-reference.js'
import { AssetError } from './skill-assets.js'

export type CopyAssetArgs = {
	root: string
	home: string
	name: string
	/** `project` or `user`: the tier folder the new file goes in. */
	scope: string | undefined
	/** A plugin's manifest name, `default`, `project`, or `user`. Never `managed`. */
	copy: string
}

export type CopyAssetResult = { path: string; source: string; from: string }

/**
 * Creates `<name>.<ext>` in the project or user `assets/` folder as a copy of the file another tier or
 * plugin holds, so it can be edited as an override. The managed tier is never a source: it is policy an
 * administrator keeps out of repositories and home folders, and a copy would show stale text as if it
 * were in effect (the managed file would still win).
 */
export function copyAsset(layers: ReferenceLayers, args: CopyAssetArgs): CopyAssetResult {
	const name = parseReferenceName(args.name)
	if (name.invalid || name.plugin !== undefined) {
		throw new AssetError('name-invalid', name.invalid ?? 'create takes a bare name.', true)
	}
	if (args.scope !== 'project' && args.scope !== 'user') {
		throw new AssetError('options-invalid', '--scope is project or user.', true)
	}
	if (args.copy === 'managed') {
		throw new AssetError(
			'managed-copy-refused',
			'the managed tier is policy and is never copied into a project or user folder. Ask the administrator, or read it with "asset load".',
		)
	}
	const found = resolveReference(name.name, layers).trace.layers.filter(({ file }) => file)
	const source = found.find((layer) =>
		args.copy === 'default' || args.copy === 'project' || args.copy === 'user'
			? layer.tier === args.copy
			: layer.tier === 'plugin' && layer.plugin === args.copy,
	)
	if (!source) {
		const held = found.map((layer) => (layer.tier === 'plugin' ? (layer.plugin as string) : layer.tier))
		throw new AssetError(
			'no-source',
			`"${args.copy}" holds no asset "${name.name}". Held by: ${held.filter((tier) => tier !== 'managed').join(', ') || 'nothing'}.`,
		)
	}
	const extension = extname(source.path)
	if (source.file && ![...dataExtensions.map((item) => item.extension), '.md'].includes(extension)) {
		throw new AssetError('no-source', `${basename(source.path)} is not a file an asset name resolves to.`)
	}
	const base = args.scope === 'user' ? userReferencesDir(args.home) : projectReferencesDir(resolve(args.root))
	const dir = join(dirname(base), 'assets')
	const taken = ['.md', ...dataExtensions.map((item) => item.extension)]
		.map((item) => join(dir, `${name.name}${item}`))
		.find((path) => existsSync(path))
	if (taken) {
		throw new AssetError('exists', `${taken} already exists; edit it, or delete it first.`)
	}
	const path = join(dir, `${name.name}${extension}`)
	mkdirSync(dir, { recursive: true })
	copyFileSync(source.path, path)
	return { path, source: source.path, from: args.copy }
}
