import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceListReport, ReferenceSearchReport } from './reference.command.js'
import { errors, json, list, load, managed, repo, search, write, written } from './reference-command.fixtures.js'
import type { ReferenceLoadEntry } from './reference-load.command.js'
import type { ReferenceTrace } from './resolve-reference.js'

describe('load: project sections in text (R44)', () => {
	it('prints each project section after the main document as <project folder>, in path order', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '# Main\n\nmain\n')
		write(root, 'packages/web/.agents/references/name.md', '## Web\n\nweb\n')
		write(root, 'packages/app/.agents/references/name.md', '### App\n\napp\n')

		expect(await load(['name'], { root })).toBe(0)
		expect(written()).toBe(
			'# Main\n\nmain\n\n' +
				'<project folder="packages/app">\n### App\n\napp\n</project>\n\n' +
				'<project folder="packages/web">\n## Web\n\nweb\n</project>\n',
		)
	})

	it('XML-escapes the folder attribute', async () => {
		const root = repo()
		write(root, 'a&b"c/.agents/references/name.md', '## X\n\nx\n')

		expect(await load(['name'], { root })).toBe(0)
		expect(written()).toBe('<project folder="a&amp;b&quot;c">\n## X\n\nx\n</project>\n')
	})

	it('prints only the project sections for a name with no main document (UC1.16)', async () => {
		const root = repo()
		write(root, 'app/.agents/references/name.md', '## App\n\napp\n')

		expect(await load(['name'], { root })).toBe(0)
		expect(written()).toBe('<project folder="app">\n## App\n\napp\n</project>\n')
	})

	it('puts the project sections inside the <reference> tag among several names', async () => {
		const root = repo()
		write(root, '.agents/references/one.md', '## One\n\none\n')
		write(root, '.agents/references/two.md', '## Two\n\ntwo\n')
		write(root, 'app/.agents/references/one.md', '## App\n\napp\n')

		expect(await load(['one', 'two'], { root })).toBe(0)
		expect(written()).toBe(
			'<reference name="one">\n## One\n\none\n\n<project folder="app">\n## App\n\napp\n</project>\n</reference>\n\n' +
				'<reference name="two">\n## Two\n\ntwo\n</reference>\n',
		)
	})

	it('applies the managed contribution over each project section (UC1, K27)', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '## Rules\n\nmain\n')
		write(root, 'app/.agents/references/name.md', '## Rules\n\napp\n\n## App\n\nonly app\n')
		managed({ name: '## Rules\n\nmanaged\n' })

		expect(await load(['name'], { root })).toBe(0)
		expect(written()).toBe(
			'## Rules\n\nmanaged\n\n<project folder="app">\n## Rules\n\nmanaged\n\n## App\n\nonly app\n</project>\n',
		)
	})

	it('warns on stderr of a key a project section does not carry, keeping stdout the reference (UC1.19)', async () => {
		const root = repo()
		write(root, 'app/.agents/references/name.md', '---\nextends: [a]\n---\n\n## App\n\napp\n')

		expect(await load(['name'], { root })).toBe(0)
		expect(written()).toBe('<project folder="app">\n## App\n\napp\n</project>\n')
		expect(errors()).toMatch(
			/^warning: project-section-key-ignored: .*`extends` is ignored in the project section for app/m,
		)
	})

	it('lists each project section with its folder and path in the text trace (R46)', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '## Main\n\nmain\n')
		write(root, 'app/.agents/references/name.md', '## App\n\napp\n')

		expect(await load(['name'], { root, trace: true })).toBe(0)
		expect(errors()).toContain(`project sections:\n  app ${join(root, 'app/.agents/references/name.md')}: used\n`)
		expect(written()).toBe('## Main\n\nmain\n\n<project folder="app">\n## App\n\napp\n</project>\n')
	})
})

describe('load: project sections in structured output (UC8.3, R38)', () => {
	it('gives each project section as its own record, and the entry is always a record', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '## Main\n\nmain\n')
		write(root, '.agents/references/plain.md', '## Plain\n\nplain\n')
		write(root, 'app/.agents/references/name.md', '---\ndescription: app\n---\n\n## App\n\napp\n')

		expect(await load(['name', 'plain'], { root, format: 'json' })).toBe(0)
		expect(json<ReferenceLoadEntry[]>()).toEqual([
			{
				name: 'name',
				status: 'found',
				content: '## Main\n\nmain\n',
				projectSections: [{ folder: 'app', content: '## App\n\napp\n' }],
			},
			'## Plain\n\nplain\n',
		])
	})

	it('gives a name with only project sections as a record with no content (UC1.16)', async () => {
		const root = repo()
		write(root, 'app/.agents/references/name.md', '## App\n\napp\n')

		expect(await load(['name'], { root, format: 'json' })).toBe(0)
		expect(json<ReferenceLoadEntry[]>()).toEqual([
			{ name: 'name', status: 'found', projectSections: [{ folder: 'app', content: '## App\n\napp\n' }] },
		])
	})

	it("adds each project section's folder and path to the trace (R38)", async () => {
		const root = repo()
		write(root, 'app/.agents/references/name.md', '## App\n\napp\n')

		expect(await load(['name'], { root, format: 'json', trace: true })).toBe(0)
		const [entry] = json<{ trace: ReferenceTrace }[]>()
		expect(entry?.trace.projectSections).toEqual([
			{
				folder: 'app',
				path: join(root, 'app/.agents/references/name.md'),
				file: 'name.md',
				frontmatter: {},
				outcome: 'used',
			},
		])
	})
})

describe('list and search over project sections (R16, R17, R38)', () => {
	it('lists a name only a project section holds', async () => {
		const root = repo()
		write(root, 'app/.agents/references/name.md', '## App\n\napp\n')

		expect(await list({ root })).toBe(0)
		expect(json<ReferenceListReport>().references).toEqual([{ name: 'name' }])
	})

	it('gives a project section its own --trace row with kind project-section and its folder', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '## Main\n\nmain\n')
		write(root, 'app/.agents/references/name.md', '---\ndescription: App rules.\n---\n\n## App\n\napp\n')

		expect(await list({ root, trace: true })).toBe(0)
		expect(json<ReferenceListReport>().layers).toEqual([
			{ name: 'name', tier: 'repo', path: join(root, '.agents/references/name.md'), outcome: 'used' },
			{
				name: 'name',
				tier: 'project',
				path: join(root, 'app/.agents/references/name.md'),
				description: 'App rules.',
				outcome: 'used',
				kind: 'project-section',
				folder: 'app',
			},
		])
	})

	it('searches each project section by description, heading, and body, and a match carries its folder', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '## Main\n\nmain\n')
		write(root, 'app/.agents/references/name.md', '---\ndescription: Deploy rules.\n---\n\n## App\n\napp\n')
		write(root, 'web/.agents/references/name.md', '## Deploy\n\nweb\n')
		write(root, 'svc/.agents/references/name.md', '## Svc\n\nhow to deploy\n')

		expect(await search('deploy', { root })).toBe(0)
		expect(json<ReferenceSearchReport>().references).toEqual([
			{ name: 'name', description: 'Deploy rules.', match: 'description', folder: 'app' },
			{ name: 'name', match: 'heading', folder: 'web' },
			{ name: 'name', match: 'body', folder: 'svc' },
		])
	})

	it('adds the project tier to a section match under --trace', async () => {
		const root = repo()
		write(root, 'app/.agents/references/name.md', '## App\n\ndeploy\n')

		expect(await search('deploy', { root, trace: true })).toBe(0)
		expect(json<ReferenceSearchReport>().references).toEqual([
			{ name: 'name', match: 'body', folder: 'app', tier: 'project' },
		])
	})
})
