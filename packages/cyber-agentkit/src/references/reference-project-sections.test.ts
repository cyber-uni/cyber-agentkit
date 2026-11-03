import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceLayer, ReferenceLayers } from './reference-layers.js'
import { projectSectionNames } from './reference-project-sections.js'
import { type ProjectFolderCache, projectFolders } from './reference-projects.js'
import { resolveReference } from './resolve-reference.js'

function tempDir(prefix = 'project-sections-'): string {
	return mkdtempSync(join(tmpdir(), prefix))
}

function write(root: string, relPath: string, content: string): string {
	const path = join(root, relPath)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
	return path
}

function git(root: string, ...args: string[]): void {
	execFileSync('git', args, { cwd: root, stdio: 'ignore' })
}

/** A folder outside git: every project folder below it is read. */
function plainRoot(): string {
	return tempDir()
}

function gitRoot(): string {
	const root = tempDir()
	git(root, 'init', '-q')
	return root
}

function layersAt(
	root: string,
	extra: ReferenceLayer[] = [],
	projects: ProjectFolderCache = new Map(),
): ReferenceLayers {
	return {
		layers: [
			...extra.filter(({ tier }) => tier === 'managed'),
			{ tier: 'repo', dir: join(root, '.agents', 'references') },
			...extra.filter(({ tier }) => tier !== 'managed'),
		],
		root,
		projects,
		harnesses: [],
	}
}

function managedLayer(documents: Record<string, string>): ReferenceLayer {
	const dir = tempDir('project-sections-managed-')
	for (const [file, content] of Object.entries(documents)) write(dir, file, content)
	return { tier: 'managed', dir }
}

function pluginLayer(name: string, documents: Record<string, string>): ReferenceLayer {
	const dir = tempDir('project-sections-plugin-')
	for (const [file, content] of Object.entries(documents)) write(dir, file, content)
	return { tier: 'plugin', dir, plugin: name }
}

const codes = (resolved: ReturnType<typeof resolveReference>) => resolved.warnings.map(({ code }) => code)

describe('project sections (R99)', () => {
	it('delivers each project section after the main document, in path order, a folder before the folders inside it', () => {
		const root = plainRoot()
		write(root, '.agents/references/name.md', '# Main\n\nmain\n')
		for (const folder of ['b', 'a-b', 'a/c', 'a', 'B']) {
			write(root, `${folder}/.agents/references/name.md`, `## In ${folder}\n\n${folder}\n`)
		}

		const resolved = resolveReference('name', layersAt(root))

		expect(resolved.status).toBe('found')
		expect(resolved.content).toBe('# Main\n\nmain\n')
		expect(resolved.projectSections.map(({ folder }) => folder)).toEqual(['B', 'a', 'a/c', 'a-b', 'b'])
		expect(resolved.projectSections[2]).toEqual({
			folder: 'a/c',
			path: join(root, 'a', 'c', '.agents', 'references', 'name.md'),
			content: '## In a/c\n\na/c\n',
			metadata: {},
		})
		expect(resolved.trace.projectSections.map(({ folder, outcome }) => [folder, outcome])).toEqual([
			['B', 'used'],
			['a', 'used'],
			['a/c', 'used'],
			['a-b', 'used'],
			['b', 'used'],
		])
	})

	it('reads <name>/README.md as a project section, and ignores it with a warning beside <name>.md (UC1.6)', () => {
		const root = plainRoot()
		write(root, 'app/.agents/references/name/README.md', '## Readme\n\nreadme\n')
		write(root, 'web/.agents/references/name.md', '## File\n\nfile\n')
		write(root, 'web/.agents/references/name/README.md', '## Readme\n\nreadme\n')

		const resolved = resolveReference('name', layersAt(root))

		expect(resolved.projectSections.map(({ folder, content }) => [folder, content])).toEqual([
			['app', '## Readme\n\nreadme\n'],
			['web', '## File\n\nfile\n'],
		])
		expect(codes(resolved)).toEqual(['file-ignored'])
	})

	it('keeps the section heading levels as written', () => {
		const root = plainRoot()
		write(root, '.agents/references/name.md', '## Main\n\nmain\n')
		write(root, 'app/.agents/references/name.md', '# Top\n\ntop\n\n### Deep\n\ndeep\n')

		expect(resolveReference('name', layersAt(root)).projectSections[0]?.content).toBe(
			'# Top\n\ntop\n\n### Deep\n\ndeep\n',
		)
	})

	it('is found with only its project sections when no tier holds a main document (UC1.16)', () => {
		const root = plainRoot()
		write(root, 'app/.agents/references/name.md', '## App\n\napp\n')

		const resolved = resolveReference('name', layersAt(root))

		expect(resolved).toMatchObject({ status: 'found', content: '', format: 'markdown' })
		expect(resolved.code).toBeUndefined()
		expect(resolved.projectSections.map(({ folder }) => folder)).toEqual(['app'])
	})

	it('is found with its project sections when a repo remove turned the main document off (R49)', () => {
		const root = plainRoot()
		write(root, '.agents/references/name.md', '---\nmerge: remove\n---\n')
		write(root, 'app/.agents/references/name.md', '## App\n\napp\n')

		const resolved = resolveReference('name', layersAt(root, [pluginLayer('a', { 'name.md': '## A\n\na\n' })]))

		expect(resolved).toMatchObject({ status: 'found', content: '' })
		expect(resolved.projectSections.map(({ folder }) => folder)).toEqual(['app'])
	})

	it('ignores merge, extends, implements, and aliases in a project section with a warning, still delivering it (UC1.19, R110)', () => {
		const root = plainRoot()
		write(root, '.agents/references/name.md', '## Main\n\nmain\n')
		write(
			root,
			'app/.agents/references/name.md',
			'---\nmerge: replace\nextends: [a]\nimplements: x.interface@1\naliases: [old]\ndescription: app rules\n---\n\n## App\n\napp\n',
		)

		const resolved = resolveReference('name', layersAt(root))

		expect(resolved.content).toBe('## Main\n\nmain\n')
		expect(resolved.projectSections).toEqual([
			expect.objectContaining({ folder: 'app', content: '## App\n\napp\n', metadata: { description: 'app rules' } }),
		])
		const ignored = resolved.warnings.filter(({ code }) => code === 'project-section-key-ignored')
		expect(ignored.map(({ message }) => message.match(/`(\w+)`/)?.[1])).toEqual([
			'merge',
			'extends',
			'implements',
			'aliases',
		])
		expect(ignored.every(({ message }) => message.includes('for app'))).toBe(true)
		expect(resolved.trace.projectSections[0]?.frontmatter).toMatchObject({ merge: 'replace', extends: ['a'] })
	})

	it('delivers no project section for a name whose main document is not Markdown, warning for each (UC1.17, UC13.8)', () => {
		const root = plainRoot()
		write(root, '.agents/references/name.json', '{"a": 1}\n')
		write(root, 'app/.agents/references/name.md', '## App\n\napp\n')
		write(root, 'web/.agents/references/name.json', '{"b": 2}\n')

		const resolved = resolveReference('name', layersAt(root))

		expect(resolved).toMatchObject({ status: 'found', format: 'json', content: '{"a": 1}\n' })
		expect(resolved.projectSections).toEqual([])
		expect(codes(resolved)).toEqual(['project-section-not-markdown', 'project-section-not-markdown'])
		expect(resolved.trace.projectSections.map(({ folder, outcome }) => [folder, outcome])).toEqual([
			['app', 'not used (format differs from json)'],
		])
	})

	it('never delivers a non-Markdown file in a project folder, warning (R99)', () => {
		const root = plainRoot()
		write(root, '.agents/references/name.md', '## Main\n\nmain\n')
		write(root, 'app/.agents/references/name.yaml', 'a: 1\n')

		const resolved = resolveReference('name', layersAt(root))

		expect(resolved.projectSections).toEqual([])
		expect(codes(resolved)).toEqual(['project-section-not-markdown'])
	})

	it('reads no project section for an interface document, which is never composed', () => {
		const root = plainRoot()
		write(root, '.agents/references/x.interface.md', '# X\n')
		write(root, 'app/.agents/references/x.interface.md', '# App\n')

		expect(resolveReference('x.interface', layersAt(root)).projectSections).toEqual([])
	})

	it('reads no project section from a list of layers with no root', () => {
		const root = plainRoot()
		write(root, '.agents/references/name.md', '## Main\n\nmain\n')
		write(root, 'app/.agents/references/name.md', '## App\n\napp\n')

		expect(resolveReference('name', layersAt(root).layers).projectSections).toEqual([])
	})
})

describe('the managed contribution over each project section (K27, UC10)', () => {
	it('applies over the main document and each project section with its merge operation (UC1)', () => {
		const root = plainRoot()
		write(root, '.agents/references/name.md', '## Rules\n\nmain rules\n\n## Style\n\nmain style\n')
		write(root, 'app/.agents/references/name.md', '## Rules\n\napp rules\n')
		const managed = managedLayer({ 'name.md': '## Rules\n\nmanaged rules\n' })

		const resolved = resolveReference('name', layersAt(root, [managed]))

		expect(resolved.content).toBe('## Rules\n\nmanaged rules\n\n## Style\n\nmain style\n')
		expect(resolved.projectSections[0]?.content).toBe('## Rules\n\nmanaged rules\n')
		expect(resolved.trace.projectSections[0]?.sections).toEqual([
			{
				path: 'Rules',
				contributions: [{ contribution: `managed ${join(managed.dir, 'name.md')}`, operation: 'patch' }],
			},
		])
	})

	it('combines over a project section when the managed contribution says combine', () => {
		const root = plainRoot()
		write(root, 'app/.agents/references/name.md', '## Rules\n\napp rules\n')
		const managed = managedLayer({ 'name.md': '---\nmerge: combine\n---\n\n## Rules\n\nmanaged rules\n' })

		const resolved = resolveReference('name', layersAt(root, [managed]))

		expect(resolved.projectSections[0]?.content).toContain('app rules\n\nmanaged rules\n')
	})

	it('adds no managed section that matches none of a project section, leaving it as written (UC10.3, R99)', () => {
		const root = plainRoot()
		write(root, '.agents/references/name.md', '## Rules\n\nmain\n')
		write(root, 'app/.agents/references/name.md', '## App\n\napp\n')
		const managed = managedLayer({ 'name.md': '## Security\n\n<!-- merge: replace -->\n\nmanaged\n' })

		const resolved = resolveReference('name', layersAt(root, [managed]))

		expect(resolved.content).toBe('## Rules\n\nmain\n\n## Security\n\nmanaged\n')
		expect(resolved.projectSections[0]?.content).toBe('## App\n\napp\n')
		expect(resolved.trace.projectSections[0]?.sections).toBeUndefined()
		// The main document warns of the unmatched marker; the project section does not.
		expect(codes(resolved)).toEqual(['marker-unmatched'])
	})

	it.each([
		['replace', '---\nmerge: replace\n---\n\n## Managed\n\nonly\n'],
		['remove', '---\nmerge: remove\n---\n'],
	])('drops every project section under a managed %s (UC10.4)', (operation, managedText) => {
		const root = plainRoot()
		write(root, '.agents/references/name.md', '## Rules\n\nmain\n')
		write(root, 'app/.agents/references/name.md', '## App\n\napp\n')
		write(root, 'web/.agents/references/name.md', '## Web\n\nweb\n')
		const managed = managedLayer({ 'name.md': managedText })

		const resolved = resolveReference('name', layersAt(root, [managed]))

		expect(resolved.projectSections).toEqual([])
		const by = `shadowed by managed ${join(managed.dir, 'name.md')} (${operation})`
		expect(resolved.trace.projectSections.map(({ outcome }) => outcome)).toEqual([by, by])
		if (operation === 'remove') expect(resolved).toMatchObject({ status: 'missing', code: 'reference-removed' })
		else expect(resolved.content).toBe('## Managed\n\nonly\n')
	})

	it('keeps project sections under a managed replace with no body, which changes nothing (R50)', () => {
		const root = plainRoot()
		write(root, 'app/.agents/references/name.md', '## App\n\napp\n')
		write(root, '.agents/references/name.md', '## Rules\n\nmain\n')
		const managed = managedLayer({ 'name.md': '---\nmerge: replace\n---\n' })

		expect(resolveReference('name', layersAt(root, [managed])).projectSections).toHaveLength(1)
	})
})

describe('project sections in a git repository (R12, R9, UC2.9)', () => {
	it('reads no project section in a folder git ignores, and the trace says not read (ignored)', () => {
		const root = gitRoot()
		write(root, '.gitignore', 'build/\nsecret.md\n')
		write(root, '.agents/references/name.md', '## Main\n\nmain\n')
		write(root, 'build/.agents/references/name.md', '## Build\n\nbuild\n')
		write(root, 'app/.agents/references/name.md', '## App\n\napp\n')
		write(root, 'app/.agents/references/secret.md', '## Secret\n\nsecret\n')

		const resolved = resolveReference('name', layersAt(root))

		expect(resolved.projectSections.map(({ folder }) => folder)).toEqual(['app'])
		expect(resolved.trace.projectSections).toEqual([
			expect.objectContaining({ folder: 'app', outcome: 'used' }),
			{ folder: 'build', path: join(root, 'build', '.agents', 'references'), outcome: 'not read (ignored)' },
		])
		const secret = resolveReference('secret', layersAt(root))
		expect(secret.status).toBe('missing')
		expect(secret.trace.projectSections).toEqual([
			{ folder: 'app', path: join(root, 'app', '.agents', 'references'), outcome: 'not read (ignored)' },
		])
	})

	it('reads a tracked file an ignore file ignores as ignored too', () => {
		const root = gitRoot()
		write(root, '.gitignore', 'vendor/\n')
		write(root, 'vendor/.agents/references/name.md', '## Vendor\n\nvendor\n')
		git(root, 'add', '-f', 'vendor/.agents/references/name.md')

		const resolved = resolveReference('name', layersAt(root))

		expect(resolved.status).toBe('missing')
		expect(resolved.trace.projectSections.map(({ folder, outcome }) => [folder, outcome])).toEqual([
			['vendor', 'not read (ignored)'],
		])
	})

	it('asks git once per run when the cache is passed', () => {
		const root = gitRoot()
		write(root, 'app/.agents/references/name.md', '## App\n\napp\n')
		const cache: ProjectFolderCache = new Map()
		const layers = layersAt(root, [], cache)

		resolveReference('name', layers)
		write(root, 'later/.agents/references/name.md', '## Later\n\nlater\n')
		const again = resolveReference('name', layers)

		expect(again.projectSections.map(({ folder }) => folder)).toEqual(['app'])
		expect(cache.size).toBe(1)
		expect(projectFolders(root).folders.map(({ folder }) => folder)).toEqual(['app', 'later'])
	})

	it('names every Markdown name a project section answers, leaving out ignored and non-Markdown files', () => {
		const root = gitRoot()
		write(root, '.gitignore', 'secret.md\nbuild/\n')
		write(root, 'app/.agents/references/name.md', 'x\n')
		write(root, 'app/.agents/references/other/README.md', 'x\n')
		write(root, 'app/.agents/references/secret.md', 'x\n')
		write(root, 'app/.agents/references/data.json', '{}\n')
		write(root, 'build/.agents/references/built.md', 'x\n')

		expect(projectSectionNames(root).sort()).toEqual(['name', 'other'])
	})
})
