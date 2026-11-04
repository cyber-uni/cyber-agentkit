import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { aliasIndex } from './reference-aliases.js'
import { listReferences, searchReferences } from './reference-catalog.js'
import { capabilitiesInterface, recipeInterface } from './reference-interface.fixtures.js'
import type { ReferenceLayer, ReferenceLayers } from './reference-layers.js'
import { resolveReference } from './resolve-reference.js'

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), 'reference-aliases-'))
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

function plugin(name: string, documents: Record<string, string>): ReferenceLayer {
	return { ...layer('plugin', documents), plugin: name }
}

const codes = (resolved: ReturnType<typeof resolveReference>) => resolved.warnings.map(({ code }) => code)

const renamed = '---\naliases: [old-name]\n---\n\n## A\n\nnew a\n\n## B\n\nnew b\n'

describe('renames (UC19, R96 to R98)', () => {
	it('resolves an older name as the name listing it, with reference-renamed, and names the alias in the trace (R96, R98)', () => {
		const resolved = resolveReference('old-name', [plugin('a', { 'new-name.md': renamed })])

		expect(resolved).toMatchObject({ name: 'old-name', status: 'found', content: '## A\n\nnew a\n\n## B\n\nnew b\n' })
		expect(codes(resolved)).toEqual(['reference-renamed'])
		expect(resolved.warnings[0]?.message).toMatch(/"old-name" is renamed "new-name"/)
		expect(resolved.trace.alias).toEqual({ name: 'old-name', resolvedAs: 'new-name' })
	})

	it('resolves a qualified older name as the same plugin’s new name (UC19.6)', () => {
		const resolved = resolveReference('a/old-name', [plugin('a', { 'new-name.md': renamed })])

		expect(resolved).toMatchObject({ status: 'found' })
		expect(codes(resolved)).toEqual(['reference-renamed'])
		expect(resolveReference('b/old-name', [plugin('a', { 'new-name.md': renamed })]).status).toBe('missing')
	})

	it('reads aliases on a default and in a non-Markdown name’s metadata file (R96, K31)', () => {
		const viaDefault = resolveReference('old-name', [
			{ ...layer('default', { 'new-name.default.md': renamed }), skill: 's' },
		])
		expect(viaDefault.status).toBe('found')
		expect(codes(viaDefault)).toEqual(['reference-renamed'])

		const viaMetadata = resolveReference('old-conf', [
			plugin('a', { 'conf.json': '{}\n', 'conf.meta.md': '---\naliases: [old-conf]\n---\n' }),
		])
		expect(viaMetadata).toMatchObject({ status: 'found', format: 'json', content: '{}\n' })
		expect(codes(viaMetadata)).toEqual(['reference-renamed'])
	})

	it('does not follow an alias of an alias (UC19.5)', () => {
		// "a" was renamed "b", then "b" renamed "c": the owner lists only "b", so "a" is not followed.
		const layers = [plugin('a', { 'c.md': '---\naliases: [b]\n---\n\nx\n' })]
		expect(resolveReference('b', layers).content).toBe('x\n')
		expect(resolveReference('a', layers).status).toBe('missing')
	})

	it('applies a repo, user, or managed file under an older name as the new name, naming the file (R97)', () => {
		for (const tier of ['repo', 'user', 'managed'] as const) {
			const file = layer(tier, { 'old-name.md': '## A\n\nmine\n' })
			const resolved = resolveReference('new-name', [file, plugin('a', { 'new-name.md': renamed })])

			expect(resolved.content).toBe('## A\n\nmine\n\n## B\n\nnew b\n')
			expect(codes(resolved)).toEqual(['reference-renamed'])
			expect(resolved.warnings[0]?.message).toContain(join(file.dir, 'old-name.md'))
			expect(resolved.warnings[0]?.message).toContain('"new-name"')
			expect(resolved.trace.layers[0]).toMatchObject({ file: 'old-name.md', alias: 'old-name', outcome: 'used' })
		}
	})

	it('applies a file under the older name when the older name is loaded', () => {
		const resolved = resolveReference('old-name', [
			layer('repo', { 'old-name.md': '## A\n\nmine\n' }),
			plugin('a', { 'new-name.md': renamed }),
		])

		expect(resolved.content).toBe('## A\n\nmine\n\n## B\n\nnew b\n')
		expect(codes(resolved)).toEqual(['reference-renamed', 'reference-renamed'])
	})

	it('lets the new name’s file win in one folder, ignoring the older one with file-ignored (UC19.3, R97, R67)', () => {
		const repo = layer('repo', { 'new-name.md': '## A\n\nnew file\n', 'old-name.md': '## A\n\nold file\n' })
		const resolved = resolveReference('new-name', [repo, plugin('a', { 'new-name.md': renamed })])

		expect(resolved.content).toBe('## A\n\nnew file\n\n## B\n\nnew b\n')
		expect(codes(resolved)).toEqual(['file-ignored'])
		expect(resolved.warnings[0]?.message).toContain(join(repo.dir, 'old-name.md'))
	})

	it('ignores aliases in a repo, user, or managed contribution with alias-invalid (UC19.4)', () => {
		const layers = [
			layer('repo', { 'name.md': '---\naliases: [other]\n---\n\n## A\n\nmine\n' }),
			plugin('a', { 'other.md': 'x\n' }),
		]

		expect(codes(resolveReference('name', layers))).toEqual(['alias-invalid'])
		expect(resolveReference('other', layers).content).toBe('x\n')
	})

	it('does not read a name a plugin holds as its own as an alias, with alias-not-used (R98, UC19.1)', () => {
		const layers = [plugin('a', { 'new-name.md': renamed }), plugin('b', { 'old-name.md': 'old copy\n' })]

		const old = resolveReference('old-name', layers)
		expect(old).toMatchObject({ status: 'found', content: 'old copy\n' })
		expect(codes(old)).toEqual(['alias-not-used'])

		const repo = layer('repo', { 'old-name.md': '## A\n\nmine\n' })
		const fresh = resolveReference('new-name', [repo, ...layers])
		expect(fresh.content).toBe('## A\n\nnew a\n\n## B\n\nnew b\n')
		expect(codes(fresh)).toEqual(['alias-not-used'])
	})

	it('makes an alias two names list ambiguous, with both names as options (R98, UC19.2)', () => {
		const resolved = resolveReference('old-name', [
			plugin('a', { 'first.md': '---\naliases: old-name\n---\n\nx\n' }),
			plugin('b', { 'second.md': '---\naliases: [old-name]\n---\n\ny\n' }),
		])

		expect(resolved).toMatchObject({
			status: 'ambiguous',
			code: 'reference-ambiguous',
			cause: 'alias',
			options: ['first', 'second'],
		})
	})

	it('ignores an alias that is not a valid name, with alias-invalid (UC19.7)', () => {
		const layers = [plugin('a', { 'new-name.md': '---\naliases: [old.md, a/b, 3, new-name, old-name]\n---\n\nx\n' })]
		const resolved = resolveReference('new-name', layers)

		expect(codes(resolved)).toEqual(['alias-invalid', 'alias-invalid', 'alias-invalid', 'alias-invalid'])
		expect(resolveReference('old-name', layers).status).toBe('found')
	})

	it('keeps an interface document’s aliases as its older ids, and as older names of the document (UC19.8, R128)', () => {
		const index = aliasIndex([plugin('a', { 'recipe.interface.md': '---\naliases: [old.recipe]\n---\n\n## A\n' })])

		expect([...index.byAlias.keys()]).toEqual(['old.recipe.interface'])
		expect(index.byName.get('recipe.interface')).toEqual(['old.recipe.interface'])
		expect(index.interfaces.get('recipe')).toEqual([
			{ alias: 'old.recipe', owner: expect.objectContaining({ name: 'recipe.interface', plugin: 'a' }) },
		])
	})

	it('shows only the new name in list and search (R98)', () => {
		const layers = [layer('repo', { 'old-name.md': '## A\n\nmine\n' }), plugin('a', { 'new-name.md': renamed })]

		expect(listReferences(layers).references.map(({ name }) => name)).toEqual(['new-name'])
		expect(searchReferences('mine', layers).matches.map(({ name }) => name)).toEqual(['new-name'])
	})

	it('applies a project section under an older name as the new name (R97)', () => {
		const root = tempDir()
		write(root, 'app/.agents/references/old-name.md', '## App\n\napp\n')
		const layers: ReferenceLayers = {
			layers: [{ tier: 'repo', dir: join(root, '.agents/references') }, plugin('a', { 'new-name.md': renamed })],
			root,
			projects: new Map(),
			harnesses: [],
		}
		const resolved = resolveReference('new-name', layers)

		expect(resolved.projectSections).toMatchObject([{ folder: 'app', content: '## App\n\napp\n' }])
		expect(codes(resolved)).toEqual(['reference-renamed'])
		expect(resolved.trace.projectSections[0]).toMatchObject({ alias: 'old-name', file: 'old-name.md' })
		expect(listReferences(layers).references.map(({ name }) => name)).toEqual(['new-name'])
	})
})

describe('an interface keeping the name of the plain reference it replaces (UC19.10, R128)', () => {
	const contract = capabilitiesInterface.replace('interface:\n', 'aliases: [project-tracker.contract]\ninterface:\n')
	const owner = () => plugin('repobuddy', { 'project-tracker.capabilities.interface.md': contract })

	it('resolves the plain name of a many interface as its interface document, with reference-renamed', () => {
		const resolved = resolveReference('project-tracker.contract', [owner()])

		expect(resolved).toMatchObject({ name: 'project-tracker.contract', status: 'found' })
		expect(resolved.metadata?.['interface']).toMatchObject({ cardinality: 'many' })
		expect(resolved.trace.alias).toEqual({
			name: 'project-tracker.contract',
			resolvedAs: 'project-tracker.capabilities.interface',
		})
		expect(resolved.warnings).toEqual([
			{
				code: 'reference-renamed',
				message:
					'"project-tracker.contract" is renamed "project-tracker.capabilities.interface"; load "project-tracker.capabilities.interface" instead',
			},
		])
	})

	it('resolves a qualified plain name as the same plugin’s interface document', () => {
		const resolved = resolveReference('repobuddy/project-tracker.contract', [owner()])

		expect(resolved).toMatchObject({ status: 'found' })
		expect(resolved.trace.alias?.resolvedAs).toBe('project-tracker.capabilities.interface')
	})

	it('resolves <old id>.interface as the interface document, for a one interface too', () => {
		const one = recipeInterface
			.replace('interface:\n', 'aliases: [scaffold.template]\ninterface:\n')
			.replace('cardinality: many', 'cardinality: one')
		const layers = [plugin('repobuddy', { 'scaffold.recipe.interface.md': one })]

		const resolved = resolveReference('scaffold.template.interface', layers)

		expect(resolved).toMatchObject({ status: 'found' })
		expect(resolved.trace.alias?.resolvedAs).toBe('scaffold.recipe.interface')
		expect(codes(resolved)).toEqual(['reference-renamed'])
	})

	it('leaves a one interface’s <old id> to its implementation, not the interface document (R96)', () => {
		const one = recipeInterface
			.replace('interface:\n', 'aliases: [scaffold.template]\ninterface:\n')
			.replace('cardinality: many', 'cardinality: one')
		const layers = [plugin('repobuddy', { 'scaffold.recipe.interface.md': one })]

		expect(resolveReference('scaffold.template', layers).status).toBe('missing')
	})

	it('reports a repo or user file under the plain name as the interface document, never composed (R97)', () => {
		const user = layer('user', { 'project-tracker.contract.md': '## Tracker\n\nmine\n' })

		const resolved = resolveReference('project-tracker.capabilities.interface', [user, owner()])

		expect(resolved.status).toBe('found')
		expect(resolved.content).not.toContain('mine')
		expect(codes(resolved)).toEqual(['reference-renamed', 'interface-not-composed'])
		expect(resolved.warnings[0]?.message).toContain(
			'it is filed under the older name "project-tracker.contract" and applies as "project-tracker.capabilities.interface"',
		)
		expect(resolveReference('project-tracker.contract', [user, owner()]).warnings.map(({ code }) => code)).toEqual([
			'reference-renamed',
			'reference-renamed',
			'interface-not-composed',
		])
	})

	it('answers the plain name as itself while a plugin still holds it (R98)', () => {
		const old = plugin('legacy', { 'project-tracker.contract.md': 'old contract\n' })

		const resolved = resolveReference('project-tracker.contract', [owner(), old])

		expect(resolved).toMatchObject({ status: 'found', content: 'old contract\n' })
		expect(codes(resolved)).toEqual(['alias-not-used'])
	})

	it('lists only the interface document', () => {
		const layers = [layer('repo', { 'project-tracker.contract.md': '## Tracker\n' }), owner()]

		expect(listReferences(layers).references.map(({ name }) => name)).toEqual([
			'project-tracker.capabilities.interface',
		])
	})
})
