import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceLayer } from './reference-layers.js'
import { layerNames, parseReferenceName, referenceNames, resolveReference } from './resolve-reference.js'

function tempDir(prefix = 'resolve-reference-'): string {
	return mkdtempSync(join(tmpdir(), prefix))
}

function write(root: string, relPath: string, content: string): string {
	const path = join(root, relPath)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
	return path
}

function layer(tier: ReferenceLayer['tier'], dir: string): ReferenceLayer {
	return { tier, dir, plugins: [], status: '' }
}

describe('resolveReference', () => {
	it('displays a path as-is when no display function is given', () => {
		const dir = tempDir()
		write(dir, 'name.md', '# doc\n')

		const resolved = resolveReference(parseReferenceName('name'), [layer('project', dir)])

		expect(resolved.status).toBe('found')
		expect(resolved.path).toBe(join(dir, 'name.md'))
	})
})

describe('layerNames and referenceNames', () => {
	it('skips an entry whose name is not a reference name', () => {
		const dir = tempDir()
		write(dir, 'name.md', '# doc\n')
		write(dir, '.hidden.md', '# hidden\n')

		expect(layerNames(dir)).toEqual(['name'])
	})

	it('skips a folder candidate that holds none of the folder file names', () => {
		const dir = tempDir()
		write(dir, 'name.md', '# doc\n')
		mkdirSync(join(dir, 'empty-folder'), { recursive: true })
		write(dir, 'a-folder/README.md', '# folder doc\n')

		const names = layerNames(dir)
		expect(names).toContain('a-folder')
		expect(names).not.toContain('empty-folder')
	})

	it('reads every name any layer holds, deduplicated and sorted', () => {
		const dirA = tempDir()
		const dirB = tempDir()
		write(dirA, 'b.md', '# b\n')
		write(dirB, 'a.md', '# a\n')
		write(dirB, 'b.md', '# b again\n')

		expect(referenceNames([layer('project', dirA), layer('user', dirB)])).toEqual(['a', 'b'])
	})
})

describe('cross-plugin overrides', () => {
	function plugin(plugins: string[], documents: Record<string, string>): ReferenceLayer {
		const dir = tempDir()
		for (const [name, content] of Object.entries(documents)) write(dir, `${name}.md`, content)
		return { tier: 'plugin', dir, plugins, status: '' }
	}

	const base = '---\ndescription: base\n---\n\n## Create\n\nbase create\n\n## Close\n\nbase close\n'
	const house = (overrides: string, merge = 'merge-sections') =>
		`---\noverrides: ${overrides}\nmerge: ${merge}\n---\n\n## Create\n\nhouse create\n`
	const name = 'project-tracker.capabilities.github'

	function resolve(value: string, layers: ReferenceLayer[]) {
		return resolveReference(parseReferenceName(value), layers)
	}

	it('layers the copy that overrides every other holder above them, with its merge mode', () => {
		const layers = [
			plugin(['@repobuddy/buddy', 'repobuddy'], { [name]: base }),
			plugin(['@unional/skills'], { [name]: house('[repobuddy]') }),
		]

		const resolved = resolve(name, layers)

		expect(resolved.status).toBe('found')
		expect(resolved.plugin).toBe('@unional/skills')
		expect(resolved.content).toBe('## Create\n\nhouse create\n\n## Close\n\nbase close\n')
		expect(resolved.trace.map(({ outcome }) => outcome)).toEqual(['used', 'used (overrides repobuddy)'])
		expect(resolved.layers.map(({ plugin }) => plugin)).toEqual(['@unional/skills', '@repobuddy/buddy'])
	})

	it('replaces the overridden copy whole when the overlay is first-wins', () => {
		const layers = [
			plugin(['repobuddy'], { [name]: base }),
			plugin(['house'], { [name]: house('repobuddy', 'first-wins') }),
		]

		const resolved = resolve(name, layers)

		expect(resolved.content).toBe('\n## Create\n\nhouse create\n')
		expect(resolved.trace.map(({ outcome }) => outcome)).toEqual([
			'shadowed by plugin (first-wins)',
			'used (overrides repobuddy)',
		])
	})

	it('stacks a chain of overrides, each above every holder below it', () => {
		const layers = [
			plugin(['a'], { [name]: base }),
			plugin(['c'], { [name]: '---\noverrides: [a, b]\nmerge: merge-sections\n---\n\n## Close\n\nc close\n' }),
			plugin(['b'], { [name]: house('[a]') }),
		]

		const resolved = resolve(name, layers)

		expect(resolved.content).toBe('## Create\n\nhouse create\n\n## Close\n\nc close\n')
		expect(resolved.layers.map(({ plugin }) => plugin)).toEqual(['c', 'b', 'a'])
		expect(resolved.trace.map(({ outcome }) => outcome)).toEqual([
			'used',
			'used (overrides a, b)',
			'used (overrides a)',
		])
	})

	it('stays ambiguous when two plugins override each other', () => {
		const layers = [plugin(['a'], { [name]: house('[b]') }), plugin(['b'], { [name]: house('[a]') })]

		const resolved = resolve(name, layers)

		expect(resolved.status).toBe('ambiguous')
		expect(resolved.plugins).toEqual([`a/${name}`, `b/${name}`])
	})

	it('stays ambiguous when a third holder is named by neither, offering the holders that override none', () => {
		const layers = [
			plugin(['repobuddy'], { [name]: base }),
			plugin(['house'], { [name]: house('[repobuddy]') }),
			plugin(['other'], { [name]: base }),
		]

		const resolved = resolve(name, layers)

		expect(resolved.status).toBe('ambiguous')
		expect(resolved.plugins).toEqual([`repobuddy/${name}`, `other/${name}`])
	})

	it('applies the overlays that name a plugin to a pin to that plugin', () => {
		const layers = [
			plugin(['repobuddy'], { [name]: base }),
			plugin(['house'], { [name]: house('[repobuddy]') }),
			plugin(['other'], { [name]: base }),
		]

		const resolved = resolve(`repobuddy/${name}`, layers)

		expect(resolved.status).toBe('found')
		expect(resolved.content).toBe('## Create\n\nhouse create\n\n## Close\n\nbase close\n')
		expect(resolved.trace.map(({ plugin, outcome }) => `${plugin} ${outcome}`)).toEqual([
			'repobuddy used',
			'house used (overrides repobuddy)',
		])
		expect(resolve(`other/${name}`, layers).content).toBe(base.replace(/^---[\s\S]*?---\n/, ''))
	})

	it('matches a plugin by any of its names', () => {
		const layers = [
			plugin(['@repobuddy/buddy', 'repobuddy'], { [name]: base }),
			plugin(['house'], { [name]: house('["@repobuddy/buddy"]') }),
		]

		expect(resolve(`repobuddy/${name}`, layers).layers.map(({ plugin }) => plugin)).toEqual([
			'house',
			'@repobuddy/buddy',
		])
		expect(resolve(name, layers).status).toBe('found')
	})

	it('reads a pinned plugin alone when it overrides the overlay back', () => {
		const layers = [plugin(['a'], { [name]: house('[b]') }), plugin(['b'], { [name]: house('[a]') })]

		const resolved = resolve(`a/${name}`, layers)

		expect(resolved.trace.map(({ plugin, outcome }) => `${plugin} ${outcome}`)).toEqual([
			'a used',
			'b not read — it and a override each other',
		])
	})

	it('reads no overlay when the pinned plugin holds no copy', () => {
		const layers = [plugin(['repobuddy'], {}), plugin(['house'], { [name]: house('[repobuddy]') })]

		const resolved = resolve(`repobuddy/${name}`, layers)

		expect(resolved.status).toBe('missing')
		expect(resolved.trace.map(({ outcome }) => outcome)).toEqual(['missing', 'not read — repobuddy holds no copy'])
	})

	it('applies overlays that do not order among themselves in plugin order, with a warning', () => {
		const layers = [
			plugin(['repobuddy'], { [name]: base }),
			plugin(['x'], { [name]: '---\noverrides: [repobuddy]\nmerge: merge-sections\n---\n\n## Close\n\nx close\n' }),
			plugin(['y'], { [name]: house('[repobuddy]') }),
		]

		const resolved = resolve(`repobuddy/${name}`, layers)

		expect(resolved.layers.map(({ plugin }) => plugin)).toEqual(['x', 'y', 'repobuddy'])
		expect(resolved.warnings).toEqual([
			`repobuddy/${name}: x, y each override repobuddy but not one another; they apply in plugin order`,
		])
		expect(resolve(name, layers).status).toBe('ambiguous')
	})

	it('keeps the tiers above overriding the stacked plugin copies', () => {
		const layers = [
			{ tier: 'project', dir: tempDir(), plugins: [], status: '' } as ReferenceLayer,
			plugin(['repobuddy'], { [name]: base }),
			plugin(['house'], { [name]: house('[repobuddy]') }),
		]
		write(layers[0]?.dir as string, `${name}.md`, '---\nmerge: merge-sections\n---\n\n## Close\n\nproject close\n')

		expect(resolve(name, layers).content).toBe('## Create\n\nhouse create\n\n## Close\n\nproject close\n')
	})

	it('ignores overrides outside the plugin tier, or when malformed, with a warning', () => {
		const project = layer('project', tempDir())
		write(project.dir, `${name}.md`, house('[repobuddy]', 'first-wins'))
		const layers = [
			project,
			plugin(['a'], { [name]: '---\noverrides: {b: 1}\n---\n\n## A\n' }),
			plugin(['b'], { [name]: base }),
		]

		const resolved = resolve(name, layers)

		expect(resolved.status).toBe('found')
		expect(resolved.warnings).toEqual([
			`${join(project.dir, `${name}.md`)}: \`overrides\` applies only to a plugin's copy; it is ignored`,
			`${join(layers[1]?.dir as string, `${name}.md`)}: \`overrides\` is not a list of plugin names; it is ignored`,
		])
		project.dir = tempDir()
		expect(resolve(name, layers).status).toBe('ambiguous')
	})

	it('never lets an interface document override another plugin', () => {
		const iface = '---\noverrides: [a]\ninterface:\n  cardinality: one\n  version: 1\n  sections: [A]\n---\n'
		const layers = [plugin(['a'], { 'x.interface': iface }), plugin(['b'], { 'x.interface': iface })]

		const resolved = resolve('x.interface', layers)

		expect(resolved.status).toBe('ambiguous')
		expect(resolved.warnings).toHaveLength(2)
		expect(resolve('a/x.interface', layers).trace).toHaveLength(1)
	})
})
