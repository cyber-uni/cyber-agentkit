import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pluginManifestName } from './plugin-manifest.js'

function folder(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), 'plugin-manifest-'))
	for (const [path, content] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true })
		writeFileSync(join(root, path), content)
	}
	return root
}

describe('pluginManifestName', () => {
	it('reads the root plugin.json first', () => {
		const root = folder({
			'plugin.json': JSON.stringify({ name: 'root-name' }),
			'.claude-plugin/plugin.json': JSON.stringify({ name: 'claude-name' }),
		})

		expect(pluginManifestName(root)).toBe('root-name')
	})

	it("falls back to a harness's own manifest folder", () => {
		expect(pluginManifestName(folder({ '.cursor-plugin/plugin.json': JSON.stringify({ name: 'cursor-name' }) }))).toBe(
			'cursor-name',
		)
	})

	it('skips a manifest that is not JSON or names nothing, and is undefined with none', () => {
		const root = folder({
			'plugin.json': '{ not json',
			'.claude-plugin/plugin.json': JSON.stringify({ name: '' }),
			'.github/plugin/plugin.json': JSON.stringify({ name: 'copilot-name' }),
		})

		expect(pluginManifestName(root)).toBe('copilot-name')
		expect(pluginManifestName(folder({ 'package.json': JSON.stringify({ name: 'pkg' }) }))).toBeUndefined()
	})
})
