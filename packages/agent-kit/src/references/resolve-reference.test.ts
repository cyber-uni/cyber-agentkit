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

function layer(tier: ReferenceLayer['tier'], documents: Record<string, string> = {}): ReferenceLayer {
	const dir = tempDir()
	for (const [file, content] of Object.entries(documents)) write(dir, file, content)
	return { tier, dir }
}

function plugin(name: string, documents: Record<string, string> = {}): ReferenceLayer {
	return { ...layer('plugin', documents), plugin: name }
}

function skillDefault(skill: string, documents: Record<string, string> = {}): ReferenceLayer {
	return { ...layer('default', documents), skill }
}

const name = 'project-tracker'

function doc(frontmatter: string, body: string): string {
	return frontmatter ? `---\n${frontmatter}\n---\n\n${body}` : body
}

function resolve(layers: ReferenceLayer[], value = name) {
	return resolveReference(value, layers)
}

function codes(resolved: ReturnType<typeof resolve>) {
	return resolved.warnings.map(({ code }) => code)
}

const base = '## Create\n\nbase create\n\n## Close\n\nbase close\n'

describe('names (R1)', () => {
	it.each([
		['a file name', 'name.md'],
		['a default file', 'name.default'],
		['a path', 'a/b/c'],
		['a backslash path', 'a\\b'],
		['a bad character', 'na me'],
		['an npm-scoped qualifier', '@scope/pkg/name'],
	])('reads %s as invalid, reading nothing', (_, value) => {
		const resolved = resolve([layer('project', { 'name.md': 'x' })], value)

		expect(resolved).toMatchObject({ status: 'invalid', code: 'reference-invalid' })
		expect(resolved.trace.layers).toEqual([])
	})

	it('parses a qualified name to its plugin', () => {
		expect(parseReferenceName('repobuddy/tracker')).toEqual({
			raw: 'repobuddy/tracker',
			name: 'tracker',
			plugin: 'repobuddy',
		})
	})
})

describe('composition (R3 to R7, R42, R49, R50)', () => {
	it('patches by default: a section replaces the text it matches, and the rest is kept', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: '## Create\n\nmine\n' }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.status).toBe('found')
		expect(resolved.content).toBe('## Create\n\nmine\n\n## Close\n\nbase close\n')
		expect(resolved.trace.layers.map(({ outcome }) => outcome)).toEqual(['used', 'used'])
		expect(resolved.trace.layers.map(({ operationFrom }) => operationFrom)).toEqual(['default', 'default'])
	})

	it('matches a heading path from each document’s own top level', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: '# Create\n\nmine\n' }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.content).toBe('## Create\n\nmine\n\n## Close\n\nbase close\n')
	})

	it('keeps the text below a patched section with empty text, and patches its subsections', () => {
		const below = '## Review\n\nintro\n\n### Steps\n\nold steps\n\n### Notes\n\nnotes\n'
		const resolved = resolve([
			layer('project', { [`${name}.md`]: '## Review\n\n### Steps\n\nnew steps\n' }),
			plugin('a', { [`${name}.md`]: below }),
		])

		expect(resolved.content).toBe('## Review\n\nintro\n\n### Steps\n\nnew steps\n\n### Notes\n\nnotes\n')
	})

	it('adds a section that matches nothing at the end, with no warning', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: '## Extra\n\nextra\n' }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.content).toBe(`${base}\n## Extra\n\nextra\n`)
		expect(resolved.warnings).toEqual([])
	})

	it('combines lower text first and says once that the later text wins', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('merge: combine', '## Create\n\nmine\n') }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.content).toBe(
			'> Where combined text conflicts, the later text wins.\n\n## Create\n\nbase create\n\nmine\n\n## Close\n\nbase close\n',
		)
	})

	it('replaces everything below, shadowing it', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('merge: replace', '## Only\n\nmine\n') }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.content).toBe('## Only\n\nmine\n')
		expect(resolved.trace.layers[1]?.outcome).toMatch(/^shadowed by project .*\(replace\)$/)
	})

	it('turns a name off with remove when nothing above has a body, naming the remove', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('merge: remove', 'ignored body\n') }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved).toMatchObject({ status: 'missing', code: 'reference-missing' })
		expect(resolved.removedBy).toMatch(/^project /)
		expect(codes(resolved)).toEqual(['remove-body-ignored'])
		expect(resolved.trace.layers[1]?.outcome).toMatch(/\(remove\)$/)
		expect(resolved.trace.stack).toEqual(['a'])
		expect(resolved.trace.sections).toEqual([
			{ path: 'Create', contributions: [], removedBy: resolved.removedBy },
			{ path: 'Close', contributions: [], removedBy: resolved.removedBy },
		])
	})

	it('answers with a contribution above a remove', () => {
		const resolved = resolve([
			layer('managed', { [`${name}.md`]: '## Fresh\n\nnew\n' }),
			layer('project', { [`${name}.md`]: doc('merge: remove', '') }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.status).toBe('found')
		expect(resolved.content).toBe('## Fresh\n\nnew\n')
	})

	it('applies a marker to its section alone; an unmarked section takes its document operation', () => {
		const resolved = resolve([
			layer('project', {
				[`${name}.md`]: doc('merge: combine', '## Create\n<!-- merge: replace -->\n\nmine\n\n## Close\n\nmore\n'),
			}),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.content).toContain('## Create\n\nmine\n')
		expect(resolved.content).toContain('## Close\n\nbase close\n\nmore\n')
	})

	it('accepts a patch marker, and drops a section marked remove', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('merge: replace', '## Close\n<!-- merge: remove -->\n') }),
			plugin('a', { [`${name}.md`]: base }),
		])

		// A replace drops everything below, so the marker matches nothing: a warning, and nothing added.
		expect(codes(resolved)).toEqual(['marker-unmatched'])
	})

	it('changes nothing with a contribution that has no body', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('merge: replace', '') }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.content).toBe(base)
		expect(resolved.trace.layers.map(({ outcome }) => outcome)).toEqual(['used', 'used'])
	})

	it('reads an unknown merge as patch, with a warning', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('merge: first-wins', '## Create\n\nmine\n') }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.content).toBe('## Create\n\nmine\n\n## Close\n\nbase close\n')
		expect(codes(resolved)).toEqual(['merge-unknown'])
	})

	it('warns on a document repeating a heading, and matches the first', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: '## Create\n\none\n\n## Create\n\ntwo\n' }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(codes(resolved)).toEqual(['heading-repeated'])
		expect(resolved.content).toContain('## Create\n\none\n')
	})

	it('composes metadata key by key, the higher winning, without merge and extends', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('merge: patch\ndescription: mine', '## Create\n\nmine\n') }),
			plugin('a', { [`${name}.md`]: doc('description: base\ncontract: 1\nextends: []', base) }),
		])

		expect(resolved.metadata).toEqual({ description: 'mine', contract: 1 })
	})

	it('reports each section with the contributions that supplied it', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: '## Create\n\nmine\n' }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.trace.sections).toEqual([
			{ path: 'Create', contributions: [{ contribution: expect.stringMatching(/^project /), operation: 'patch' }] },
			{ path: 'Close', contributions: [{ contribution: 'plugin a', operation: 'patch' }] },
		])
	})
})

describe('the stack (R8, R52 to R56)', () => {
	it('makes the name ambiguous when no extends orders two plugins, with each plugin and the default as options', () => {
		const resolved = resolve([
			plugin('a', { [`${name}.md`]: base }),
			plugin('b', { [`${name}.md`]: base }),
			skillDefault('tracker', { [`${name}.default.md`]: base }),
		])

		expect(resolved).toMatchObject({
			status: 'ambiguous',
			code: 'reference-ambiguous',
			cause: 'unordered',
			options: [`a/${name}`, `b/${name}`, 'default'],
		})
	})

	it('orders plugins by their own extends', () => {
		const resolved = resolve([
			plugin('a', { [`${name}.md`]: base }),
			plugin('house', { [`${name}.md`]: doc('extends: [a]', '## Create\n\nhouse\n') }),
		])

		expect(resolved.status).toBe('found')
		expect(resolved.trace.stack).toEqual(['a', 'house'])
		expect(resolved.trace.builtBy).toBe("plugin house's extends")
		expect(resolved.content).toBe('## Create\n\nhouse\n\n## Close\n\nbase close\n')
	})

	it('makes a cycle only plugins wrote ambiguous', () => {
		const resolved = resolve([
			plugin('a', { [`${name}.md`]: doc('extends: [b]', base) }),
			plugin('b', { [`${name}.md`]: doc('extends: [a]', base) }),
		])

		expect(resolved).toMatchObject({ status: 'ambiguous', cause: 'cycle' })
	})

	it('builds the stack from the highest written extends; a plugin left out is not used', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('extends: [b]', '') }),
			plugin('a', { [`${name}.md`]: base }),
			plugin('b', { [`${name}.md`]: '## Create\n\nb create\n' }),
		])

		expect(resolved.status).toBe('found')
		expect(resolved.content).toBe('## Create\n\nb create\n')
		expect(resolved.trace.stack).toEqual(['b'])
		expect(resolved.trace.builtBy).toMatch(/^project /)
		expect(resolved.trace.layers.map(({ outcome }) => outcome)).toEqual(['used', 'not used (not in extends)', 'used'])
		expect(resolved.trace.layers[0]?.selection).toBe(true)
	})

	it('applies each step with its own merge key, else the plugin’s own merge, else patch', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('extends: [a, {b: combine}]', '') }),
			plugin('a', { [`${name}.md`]: base }),
			plugin('b', { [`${name}.md`]: doc('merge: replace', '## Create\n\nb\n') }),
		])

		expect(resolved.content).toContain('## Create\n\nbase create\n\nb\n')
		expect(resolved.trace.layers.find(({ plugin }) => plugin === 'b')).toMatchObject({
			operation: 'combine',
			operationFrom: 'step',
		})
	})

	it("brings in each step's own extends beneath it", () => {
		const resolved = resolve([
			layer('user', { [`${name}.md`]: doc('extends: [house]', '') }),
			plugin('a', { [`${name}.md`]: base }),
			plugin('house', { [`${name}.md`]: doc('extends: [a]', '## Create\n\nhouse\n') }),
		])

		expect(resolved.trace.stack).toEqual(['a', 'house'])
	})

	it("replaces a step's own extends with the step's extends key", () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('extends:\n  - house: {extends: []}', '') }),
			plugin('a', { [`${name}.md`]: base }),
			plugin('house', { [`${name}.md`]: doc('extends: [a]', '## Create\n\nhouse\n') }),
		])

		expect(resolved.trace.stack).toEqual(['house'])
		expect(resolved.trace.layers.find(({ plugin }) => plugin === 'a')?.outcome).toMatch(
			/^not used \(house's extends replaced by project .*\)$/,
		)
	})

	it('collapses an adjacent repeat, and makes a plugin at two separate places ambiguous', () => {
		const layers = (list: string) => [
			layer('project', { [`${name}.md`]: doc(`extends: ${list}`, '') }),
			plugin('a', { [`${name}.md`]: base }),
			plugin('b', { [`${name}.md`]: base }),
		]

		expect(resolve(layers('[a, a, b]')).trace.stack).toEqual(['a', 'b'])
		expect(resolve(layers('[a, b, a]'))).toMatchObject({ status: 'ambiguous', cause: 'repeat' })
	})

	it('stops bringing in silently at a plugin already in the stack under a written list', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('extends: [a, b]', '') }),
			plugin('a', { [`${name}.md`]: doc('extends: [b]', base) }),
			plugin('b', { [`${name}.md`]: doc('extends: [a]', base) }),
		])

		expect(resolved.status).toBe('found')
		expect(resolved.trace.stack).toEqual(['a', 'b'])
		expect(resolved.warnings).toEqual([])
	})

	it('ignores a plugin listing itself, with a warning', () => {
		const resolved = resolve([plugin('a', { [`${name}.md`]: doc('extends: [a]', base) })])

		expect(resolved.status).toBe('found')
		expect(codes(resolved)).toEqual(['extends-self'])
	})

	it('skips a step not installed, with a warning', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('extends: [gone, a]', '') }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.trace.stack).toEqual(['a'])
		expect(codes(resolved)).toEqual(['extends-step-missing'])
	})

	it('reads an extends whose every step is missing as not written, and falls through', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('extends: [gone]', '') }),
			layer('user', { [`${name}.md`]: doc('extends: [b]', '') }),
			plugin('a', { [`${name}.md`]: base }),
			plugin('b', { [`${name}.md`]: '## Create\n\nb\n' }),
		])

		expect(resolved.trace.stack).toEqual(['b'])
		expect(codes(resolved)).toEqual(['extends-step-missing', 'extends-all-missing'])
		expect(resolved.trace.layers[0]?.outcome).toBe('not used (every step is missing)')
	})

	it("warns that a lower contribution's different extends is not used", () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('extends: [a]', '') }),
			layer('user', { [`${name}.md`]: doc('extends: [b]', '') }),
			plugin('a', { [`${name}.md`]: base }),
			plugin('b', { [`${name}.md`]: base }),
		])

		expect(resolved.trace.stack).toEqual(['a'])
		expect(codes(resolved)).toEqual(['extends-not-used'])
		expect(resolved.trace.layers[1]?.outcome).toMatch(/^not used \(project .*'s extends builds the stack\)$/)
	})

	it('skips a default step with nothing there with no warning, and the trace shows it', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('extends: [default, a]', '') }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.warnings).toEqual([])
		expect(resolved.trace.layers.at(-1)).toMatchObject({ tier: 'default', outcome: 'not read (no default)' })
	})

	it('puts the default lowest with no written extends, and warns that a plugin answers over it', () => {
		const resolved = resolve([
			plugin('a', { [`${name}.md`]: '## Create\n\nplugin\n' }),
			skillDefault('tracker', { [`${name}.default.md`]: base }),
		])

		expect(resolved.trace.stack).toEqual(['default', 'a'])
		expect(resolved.content).toBe('## Create\n\nplugin\n\n## Close\n\nbase close\n')
		expect(codes(resolved)).toEqual(['default-not-selected'])
		expect(resolved.warnings[0]?.message).toContain(`reference select ${name}`)
	})

	it('stops warning once an extends names the default', () => {
		const resolved = resolve([
			layer('project', { [`${name}.md`]: doc('extends: [default, a]', '') }),
			plugin('a', { [`${name}.md`]: '## Create\n\nplugin\n' }),
			skillDefault('tracker', { [`${name}.default.md`]: base }),
		])

		expect(resolved.warnings).toEqual([])
		expect(resolved.trace.stack).toEqual(['default', 'a'])
	})

	it('answers from the default alone', () => {
		const resolved = resolve([skillDefault('tracker', { [`${name}.default.md`]: base })])

		expect(resolved.status).toBe('found')
		expect(resolved.content).toBe(base)
	})
})

describe('a qualified name (R2)', () => {
	it("builds that plugin's own stack; a written extends is not used", () => {
		const resolved = resolve(
			[
				layer('project', { [`${name}.md`]: doc('extends: [b]', '## Close\n\nproject close\n') }),
				plugin('a', { [`${name}.md`]: base }),
				plugin('b', { [`${name}.md`]: base }),
				plugin('house', { [`${name}.md`]: doc('extends: [a]', '## Create\n\nhouse\n') }),
			],
			`a/${name}`,
		)

		expect(resolved.status).toBe('found')
		expect(resolved.trace.stack).toEqual(['a'])
		expect(resolved.content).toBe('## Create\n\nbase create\n\n## Close\n\nproject close\n')
		expect(resolved.trace.layers[0]?.extendsOutcome).toBe('not used (qualified name)')
		expect(resolved.trace.layers.find(({ plugin }) => plugin === 'house')?.outcome).toBe('not used (qualified name)')
	})

	it('is missing when the plugin is not installed', () => {
		const resolved = resolve([plugin('a', { [`${name}.md`]: base })], `gone/${name}`)

		expect(resolved).toMatchObject({ status: 'missing', message: 'the plugin gone is not installed' })
	})
})

describe('files a layer reads (UC1.6, R51)', () => {
	it('answers only from <name>.md and <name>/README.md; the second is ignored with a warning', () => {
		const resolved = resolve([layer('project', { [`${name}.md`]: 'file\n', [`${name}/README.md`]: 'folder\n' })])

		expect(resolved.content).toBe('file\n')
		expect(codes(resolved)).toEqual(['file-ignored'])
	})

	it('does not answer from <name>/index.md or <name>/SKILL.md', () => {
		const resolved = resolve([layer('project', { [`${name}/index.md`]: 'x\n', [`${name}/SKILL.md`]: 'y\n' })])

		expect(resolved.status).toBe('missing')
	})

	it('ignores a <name>.default.md in a tier folder, with a warning', () => {
		const resolved = resolve([layer('project', { [`${name}.default.md`]: 'x\n' })])

		expect(resolved.status).toBe('missing')
		expect(codes(resolved)).toEqual(['default-in-tier'])
	})

	it('reads only <name>.default.md in the default tier', () => {
		const resolved = resolve([skillDefault('tracker', { [`${name}.md`]: 'old layout\n' })])

		expect(resolved.status).toBe('missing')
	})
})

describe('interface documents (R14)', () => {
	const iface = 'recipe.interface'

	it('answers from the lowest, ignoring a higher one, extends, and merge, with warnings', () => {
		const resolved = resolve(
			[
				layer('project', { [`${iface}.md`]: doc('merge: patch', 'project\n') }),
				plugin('a', { [`${iface}.md`]: 'owner\n' }),
			],
			iface,
		)

		expect(resolved.content).toBe('owner\n')
		expect(codes(resolved)).toEqual(['interface-not-composed', 'interface-not-composed'])
	})

	it('is ambiguous when two plugins hold it', () => {
		const resolved = resolve([plugin('a', { [`${iface}.md`]: 'a\n' }), plugin('b', { [`${iface}.md`]: 'b\n' })], iface)

		expect(resolved.status).toBe('ambiguous')
	})
})

describe('layerNames and referenceNames', () => {
	it('skips an entry whose name is not a reference name, and a default file in a tier folder', () => {
		const project = layer('project', {
			'name.md': 'x',
			'.hidden.md': 'x',
			'other.default.md': 'x',
			'folder/README.md': 'x',
			'stray/index.md': 'x',
		})

		expect(layerNames(project).sort()).toEqual(['folder', 'name'])
	})

	it('reads only default files in the default tier', () => {
		expect(layerNames(skillDefault('s', { 'a.default.md': 'x', 'b.md': 'x' }))).toEqual(['a'])
	})

	it('reads every name any layer holds, deduplicated and sorted', () => {
		expect(referenceNames([layer('project', { 'b.md': 'x' }), layer('user', { 'a.md': 'x', 'b.md': 'x' })])).toEqual([
			'a',
			'b',
		])
	})
})
