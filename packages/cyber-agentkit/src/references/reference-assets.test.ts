import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadAsset } from '../assets/load-asset.js'
import { selectAsset } from '../assets/select-asset.js'
import { loadReference } from './load-reference.js'
import { referenceLayers } from './reference-layers.js'
import { resolveReference } from './resolve-reference.js'

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
		expect(await loadAsset('permissions', base)).toMatchObject({
			status: 'found',
			content: '{"from":"skill"}\n',
			format: 'json',
		})
	})

	it('lets the project, then a plugin below it, override the skill file (R73)', async () => {
		const { base, root, plugin } = setup()
		const withPlugin = { ...base, plugin: { name: 'plugin-a', root: plugin } }
		expect((await loadAsset('permissions', withPlugin)).content).toBe('{"from":"plugin-a"}\n')
		put(root, '.agents/assets/permissions.json', '{"from":"project"}\n')
		expect((await loadAsset('permissions', withPlugin)).content).toBe('{"from":"project"}\n')
	})

	it('reads no references folder in an assets call, and no assets folder otherwise (R73, R72)', async () => {
		const { base, root } = setup()
		put(root, '.agents/references/permissions.json', '{"from":"references"}\n')
		expect((await loadAsset('permissions', base)).content).toBe('{"from":"skill"}\n')
		const { folder: _folder, ...plain } = base
		expect((await loadReference('permissions', plain)).content).toBe('{"from":"references"}\n')
	})

	it('never merges: a Markdown asset above another replaces it whole (R74)', async () => {
		const { base, root, skill } = setup()
		put(skill, 'assets/guide.md', '---\nmerge: combine\n---\n# Guide\n\nlow\n')
		put(root, '.agents/assets/guide.md', '---\nmerge: combine\n---\n# Guide\n\nhigh\n')
		const resolved = await loadAsset('guide', base)
		expect(resolved.content).toBe('---\nmerge: combine\n---\n# Guide\n\nhigh\n')
	})

	it('treats extends as text, not as a selection (R74)', async () => {
		const { base, root, plugin } = setup()
		put(root, '.agents/assets/permissions.md', '---\nextends: [plugin-a]\n---\n')
		const resolved = await loadAsset('permissions', { ...base, plugin: { name: 'plugin-a', root: plugin } })
		expect(resolved.content).toBe('---\nextends: [plugin-a]\n---\n')
	})

	it('makes a name two plugins hold ambiguous until a tier or a qualified name answers (R78)', async () => {
		const { base, root } = setup()
		const a = join(root, 'a')
		const b = join(root, 'b')
		put(a, 'assets/permissions.json', '{"from":"a"}\n')
		put(b, 'assets/permissions.json', '{"from":"b"}\n')
		put(a, 'plugin.json', '{"name":"plugin-a"}')
		const layers = await referenceLayers(base)
		const both = [
			...layers.layers.slice(0, -1),
			{ tier: 'plugin' as const, dir: join(a, 'assets'), plugin: 'plugin-a', whole: true },
			{ tier: 'plugin' as const, dir: join(b, 'assets'), plugin: 'plugin-b', whole: true },
			...layers.layers.slice(-1),
		]
		expect(resolveReference('permissions', both).status).toBe('ambiguous')
		expect(resolveReference('plugin-b/permissions', both).content).toBe('{"from":"b"}\n')
		put(root, '.agents/assets/permissions.json', '{"from":"project"}\n')
		const overridden = await referenceLayers(base)
		const again = [
			...overridden.layers.slice(0, -1),
			{ tier: 'plugin' as const, dir: join(a, 'assets'), plugin: 'plugin-a', whole: true },
			{ tier: 'plugin' as const, dir: join(b, 'assets'), plugin: 'plugin-b', whole: true },
			...overridden.layers.slice(-1),
		]
		expect(resolveReference('permissions', again).content).toBe('{"from":"project"}\n')
	})

	it('select chooses among plugins and the skill file, and clear undoes it (R79)', async () => {
		const { base, root, home } = setup()
		const a = join(root, 'a')
		const b = join(root, 'b')
		put(a, 'assets/permissions.json', '{"from":"a"}\n')
		put(b, 'assets/permissions.json', '{"from":"b"}\n')
		const build = async () => {
			const layers = await referenceLayers(base)
			return {
				...layers,
				layers: [
					...layers.layers.slice(0, -1),
					{ tier: 'plugin' as const, dir: join(a, 'assets'), plugin: 'plugin-a', whole: true },
					{ tier: 'plugin' as const, dir: join(b, 'assets'), plugin: 'plugin-b', whole: true },
					...layers.layers.slice(-1),
				],
			}
		}
		const layers = await build()
		expect(resolveReference('permissions', layers).status).toBe('ambiguous')
		const chosen = selectAsset(layers, { root, home, name: 'permissions', option: 'plugin-b' })
		expect(chosen.path).toBe(join(root, '.agents', 'assets', 'permissions.select'))
		expect(chosen.after.content).toBe('{"from":"b"}\n')
		expect(selectAsset(layers, { root, home, name: 'permissions', option: 'default' }).after.content).toBe(
			'{"from":"skill"}\n',
		)
		expect(() => selectAsset(layers, { root, home, name: 'permissions', option: 'nope' })).toThrow(/cannot be selected/)
		expect(selectAsset(layers, { root, home, name: 'permissions', clear: true }).after.status).toBe('ambiguous')
	})
})
