import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isRecord } from './json-file.js'

/**
 * Where a plugin keeps its manifest, relative to its root: the Agent Plugins `plugin.json` at the
 * root (E-VSC-P2, E-COPILOT-P8), then each harness's own folder (E-CODEX-P4, E-CUR-P4, E-COPILOT-P8).
 */
export const pluginManifestPaths: readonly string[] = [
	'plugin.json',
	'.claude-plugin/plugin.json',
	'.cursor-plugin/plugin.json',
	'.codex-plugin/plugin.json',
	'.github/plugin.json',
	'.github/plugin/plugin.json',
]

/** The first plugin manifest a folder holds that gives a `name`. */
function firstManifest(root: string): Record<string, unknown> | undefined {
	for (const path of pluginManifestPaths) {
		let manifest: unknown
		try {
			manifest = JSON.parse(readFileSync(join(root, path), 'utf8'))
		} catch {
			continue
		}
		if (isRecord(manifest) && typeof manifest['name'] === 'string' && manifest['name']) return manifest
	}
	return undefined
}

/**
 * The `name` in the first plugin manifest a folder holds, or `undefined` when it holds none: then
 * the folder is not a plugin, whatever its `package.json` says.
 */
export function pluginManifestName(root: string): string | undefined {
	return firstManifest(root)?.['name'] as string | undefined
}

/** The `version` in the plugin manifest `pluginManifestName` reads, when it gives one. */
export function pluginManifestVersion(root: string): string | undefined {
	const version = firstManifest(root)?.['version']
	return typeof version === 'string' && version ? version : undefined
}

function packageVersion(root: string): string | undefined {
	try {
		const manifest: unknown = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
		const version = isRecord(manifest) ? manifest['version'] : undefined
		return typeof version === 'string' && version ? version : undefined
	} catch {
		return undefined
	}
}

/**
 * A plugin's installed version: the one its harness install record gives, else its plugin
 * manifest's, else its `package.json`'s.
 */
export function pluginVersion(root: string, recorded?: string | undefined): string | undefined {
	return recorded || pluginManifestVersion(root) || packageVersion(root)
}
