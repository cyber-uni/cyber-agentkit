import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadReference } from './load-reference.js'
import { referenceLayers } from './reference-layers.js'
import { selectContribution } from './reference-write.js'

function put(root: string, file: string, content: string) {
	mkdirSync(dirname(join(root, file)), { recursive: true })
	writeFileSync(join(root, file), content)
}

function setup() {
	const root = mkdtempSync(join(tmpdir(), 'reference-assets-'))
	mkdirSync(join(root, '.git'))
	const home = join(root, 'home')
	mkdirSync(home)
	const skill = join(root, 'skills', 'demo')
	put(skill, 'SKILL.md', '---\nname: demo\ndescription: d\n---\n')
	put(skill, 'assets/permissions.json', '{"from":"skill"}\n')
	const plugin = join(root, 'plugin-a')
	put(plugin, 'assets/permissions.json', '{"from":"plugin-a"}\n')
	const base = { root, home, platform: 'linux' as const, env: {}, defaultSkill: skill, folder: 'assets' as const }
	return { root, home, skill, plugin, base }
}

describe('assets by name (R73 to R77)', () => {
	it('answers from the skill assets as its default, with no .default marker (R74)', async () => {
		const { base } = setup()
		expect(await loadReference('permissions', base)).toMatchObject({
			status: 'found',
			content: '{"from":"skill"}\n',
			format: 'json',
		})
	})

	it('lets the project, then a plugin below it, override the skill file (R73)', async () => {
		const { base, root, plugin } = setup()
		const withPlugin = { ...base, plugin: { name: 'plugin-a', root: plugin } }
		expect((await loadReference('permissions', withPlugin)).content).toBe('{"from":"plugin-a"}\n')
		put(root, '.agents/assets/permissions.json', '{"from":"project"}\n')
		expect((await loadReference('permissions', withPlugin)).content).toBe('{"from":"project"}\n')
	})

	it('reads no references folder in an assets call, and no assets folder otherwise (R73, R72)', async () => {
		const { base, root } = setup()
		put(root, '.agents/references/permissions.json', '{"from":"references"}\n')
		expect((await loadReference('permissions', base)).content).toBe('{"from":"skill"}\n')
		const { folder: _folder, ...plain } = base
		expect((await loadReference('permissions', plain)).content).toBe('{"from":"references"}\n')
	})

	it('select with assets writes under .agents/assets (R75)', async () => {
		const { base, root, home, plugin } = setup()
		const withPlugin = { ...base, plugin: { name: 'plugin-a', root: plugin } }
		const layers = await referenceLayers(withPlugin)
		const selected = selectContribution(layers, {
			root,
			home,
			name: 'permissions',
			options: ['default'],
			assets: true,
		})
		expect(selected.path).toBe(join(root, '.agents', 'assets', 'permissions.md'))
		expect(readFileSync(selected.path, 'utf8')).toContain('default')
		expect(selected.after.content).toBe('{"from":"skill"}\n')
	})
})
