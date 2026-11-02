import { mkdirSync, symlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
	base,
	dependencies,
	errors,
	failure,
	fakeHome,
	harness,
	hostRoot,
	json,
	load,
	managed,
	plugins,
	repo,
	skill,
	stdout,
	write,
	written,
} from './reference-command.fixtures.js'
import { recipeInterface } from './reference-interface.fixtures.js'
import type { ReferenceTrace } from './resolve-reference.js'

describe('load: tiers', () => {
	it('applies managed over project over user over the plugins, each patching what is below', async () => {
		const root = repo()
		plugins(root, { a: { name: '## A\n\nplugin\n' } })
		write(fakeHome.value, '.agents/references/name.md', '## U\n\nuser\n')
		write(root, '.agents/references/name.md', '## A\n\nproject\n')
		managed({ name: '## M\n\nmanaged\n' })

		expect(await load(['name'], { root })).toBe(0)
		expect(written()).toBe('## A\n\nproject\n\n## U\n\nuser\n\n## M\n\nmanaged\n')
	})

	it('puts the nearer project folder above the repository root', async () => {
		const root = repo()
		const sub = join(root, 'packages', 'app')
		write(root, '.agents/references/name.md', '## A\n\nroot\n\n## B\n\nroot b\n')
		write(sub, '.agents/references/name.md', '## A\n\nnear\n')

		expect(await load(['name'], { root: sub })).toBe(0)
		expect(written()).toBe('## A\n\nnear\n\n## B\n\nroot b\n')
	})

	it('reads no governances folder in any tier', async () => {
		const root = repo()
		write(root, '.agents/governances/name.md', 'legacy\n')
		write(fakeHome.value, '.agents/governances/name.md', 'legacy\n')

		expect(await load(['name'], { root })).toBe(0)
		expect(written()).toContain('code="reference-missing"')
	})

	it("reads the running plugin's own references once", async () => {
		const root = repo()
		write(hostRoot, 'references/name.md', 'host\n')

		expect(await load(['name'], { root, format: 'json', trace: true })).toBe(0)
		const [entry] = json<{ trace: ReferenceTrace }[]>()
		expect(entry?.trace.layers.filter(({ plugin }) => plugin === 'host')).toHaveLength(1)
	})

	it('names a dependency plugin by its manifest, never by its package name', async () => {
		const root = repo()
		dependencies(root, { '@scope/pkg': { manifest: 'house', documents: { name: 'house\n' } } })

		expect(await load(['house/name'], { root })).toBe(0)
		expect(written()).toBe('house\n')
		stdout.mockClear()
		expect(await load(['@scope/pkg/name'], { root })).toBe(0)
		expect(written()).toContain('code="reference-invalid"')
	})

	it('reads no layer for a dependency that is not a plugin, and the trace says so', async () => {
		const root = repo()
		dependencies(root, { lib: { documents: { name: 'lib\n' } } })

		expect(await load(['name'], { root, format: 'json', trace: true })).toBe(0)
		const [entry] = json<{ status: string; trace: ReferenceTrace }[]>()
		expect(entry?.status).toBe('missing')
		expect(entry?.trace.layers.find(({ path }) => path.includes('lib'))?.outcome).toBe('not read (not a plugin)')
	})

	it('skips managed policy that cannot be read locally, and names the detected harnesses', async () => {
		harness.candidates = ['claude-code']
		harness.managed = [
			{ kind: 'macos-managed-preferences', location: 'com.anthropic.claudecode', description: '', research: '' },
		]
		const root = repo()
		write(root, '.agents/references/name.md', 'project\n')

		expect(await load(['name'], { root, format: 'json', trace: true })).toBe(0)
		const [entry] = json<{ trace: ReferenceTrace }[]>()
		expect(entry?.trace.harnesses).toEqual(['claude-code'])
		expect(entry?.trace.layers.find(({ path }) => path === 'com.anthropic.claudecode')?.outcome).toMatch(
			/^not read \(claude-code keeps this policy in a macOS managed-preferences domain/,
		)
	})

	it('shows no managed folder when no harness is detected', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', 'project\n')

		expect(await load(['name'], { root, format: 'json', trace: true })).toBe(0)
		const [entry] = json<{ trace: ReferenceTrace }[]>()
		expect(entry?.trace.layers[0]).toMatchObject({
			tier: 'managed',
			outcome: expect.stringMatching(/^not read \(no harness/),
		})
	})
})

describe('load: the default tier', () => {
	it("reads <skill>/references/<name>.default.md with --default, under a plugin's contribution", async () => {
		const root = repo()
		const folder = skill(root, 'skills/tracker', { name: base })

		expect(await load(['name'], { root, default: folder })).toBe(0)
		expect(written()).toBe(base)
	})

	it('does not read the old references/<name>.md copy as a default', async () => {
		const root = repo()
		const folder = skill(root, 'skills/tracker')
		write(folder, 'references/name.md', 'old layout\n')

		expect(await load(['name'], { root, default: folder })).toBe(0)
		expect(written()).toContain('status="missing"')
	})

	it('warns when the skill folder does not exist, and resolves without it', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', 'project\n')

		expect(await load(['name'], { root, default: join(root, 'nowhere') })).toBe(0)
		expect(written()).toBe('project\n')
		expect(errors()).toMatch(/^warning: default-folder-missing: /m)
	})

	it('warns, naming reference select, when a plugin answers over the default with no extends naming either', async () => {
		const root = repo()
		plugins(root, { a: { name: '## Create\n\nplugin\n' } })
		const folder = skill(root, 'skills/tracker', { name: base })

		expect(await load(['name'], { root, default: folder })).toBe(0)
		expect(written()).toBe('## Create\n\nplugin\n\n## Close\n\nbase close\n')
		expect(errors()).toMatch(/warning: default-not-selected: .*reference select name/)
	})
})

describe('load: text output', () => {
	it('prints one document alone, and several as <reference> blocks in the order asked', async () => {
		const root = repo()
		write(root, '.agents/references/a.md', 'alpha\n')
		write(root, '.agents/references/b.md', 'beta\n')

		expect(await load(['b', 'a'], { root })).toBe(0)
		expect(written()).toBe('<reference name="b">\nbeta\n</reference>\n\n<reference name="a">\nalpha\n</reference>\n')
		expect(errors()).toBe('')
	})

	it('marks a name not found in place with its status, code, and message, and exits 0 (R43, R44)', async () => {
		const root = repo()
		write(root, '.agents/references/a.md', 'alpha\n')

		expect(await load(['a', 'gone', 'x.md'], { root })).toBe(0)
		expect(written()).toBe(
			[
				'<reference name="a">\nalpha\n</reference>',
				'<reference name="gone" status="missing" code="reference-missing">no tier holds a document for "gone"</reference>',
				'<reference name="x.md" status="invalid" code="reference-invalid">"x.md" names a file. Ask for the reference by name, without the .md extension.</reference>',
			].join('\n\n') + '\n',
		)
		expect(errors()).toBe('')
	})

	it('prints the tag for a single name not found too, exit 0 (C8)', async () => {
		expect(await load(['gone'], { root: repo() })).toBe(0)
		expect(written()).toBe(
			'<reference name="gone" status="missing" code="reference-missing">no tier holds a document for "gone"</reference>\n',
		)
	})

	it('escapes a name in the tag', async () => {
		expect(await load(['a"<b'], { root: repo() })).toBe(0)
		expect(written()).toMatch(/^<reference name="a&quot;&lt;b" status="invalid" code="reference-invalid">/)
	})

	it('says a remove turned the name off with reference-removed', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		write(root, '.agents/references/name.md', '---\nmerge: remove\n---\n')

		expect(await load(['name'], { root })).toBe(0)
		expect(written()).toMatch(
			/^<reference name="name" status="missing" code="reference-removed">"name" is turned off by project .* \(remove\)<\/reference>\n$/,
		)
	})

	it.each([[[]], [['']], [['a', ' ']]])(
		'exits 2 with one name-missing error value on stdout when no name is given (%j)',
		async (names) => {
			expect(await load(names, { root: repo() })).toBe(2)
			expect(written()).toMatch(/^error: .*\ncode: name-missing\n\nhelp:\n/)
			expect(errors()).toBe('')
		},
	)

	it('writes a warning to stderr with its code, leaving stdout and the exit code alone', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '---\nmerge: first-wins\n---\n\nbody\n')

		expect(await load(['name'], { root })).toBe(0)
		expect(written()).toBe('body\n')
		expect(errors()).toMatch(/^warning: merge-unknown: .*read as patch$/m)
	})

	it('reports an ambiguous name in its tag with its options, exit 0', async () => {
		const root = repo()
		plugins(root, { a: { name: 'a\n' }, b: { name: 'b\n' } })

		expect(await load(['name'], { root })).toBe(0)
		expect(written()).toBe(
			'<reference name="name" status="ambiguous" code="reference-ambiguous">the plugins a, b hold it, and no extends orders them; options: a/name, b/name</reference>\n',
		)
		expect(errors()).toBe('')
	})

	it('writes the trace to stderr: a summary line, the sections, then the layers', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		write(root, '.agents/references/name.md', '---\nextends: [a]\n---\n\n## Create\n\nmine\n')

		expect(await load(['name'], { root, trace: true })).toBe(0)
		expect(written()).toBe('## Create\n\nmine\n\n## Close\n\nbase close\n')
		const trace = errors()
		expect(trace).toMatch(/^name: found; stack: a; built by project .*; harnesses: none detected$/m)
		expect(trace).toMatch(/^sections:\n {2}Create: project .* \(patch\)\n {2}Close: plugin a \(patch\)$/m)
		expect(trace).toMatch(/^layers:$/m)
		expect(trace).toMatch(/^ {2}project .*name\.md: used; patch from default {"extends":\["a"\]}$/m)
	})

	it('shows a removed section and the shadowed layers in the text trace', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		write(root, '.agents/references/name.md', '---\nmerge: replace\n---\n\n## Only\n\nmine\n')

		expect(await load(['name'], { root, trace: true })).toBe(0)
		expect(errors()).toMatch(/plugin a .*: shadowed by project .* \(replace\)/)
	})

	it('names the reason in the text trace of a name not found', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		write(root, '.agents/references/name.md', '---\nmerge: remove\n---\n')

		expect(await load(['name'], { root, trace: true })).toBe(0)
		expect(errors()).toMatch(/^ {2}"name" is turned off by project .* \(remove\)$/m)
	})
})

describe('load: structured output (R38, R47)', () => {
	it('gives a found name with no warnings as its content string', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', 'body\n')

		expect(await load(['name'], { root, format: 'json' })).toBe(0)
		expect(json()).toEqual(['body\n'])
	})

	it('gives a found name with warnings as a record, and keeps the warnings off stderr', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '---\nmerge: bogus\n---\n\nbody\n')

		expect(await load(['name'], { root, format: 'json' })).toBe(0)
		expect(json()).toEqual([
			{
				name: 'name',
				status: 'found',
				content: 'body\n',
				warnings: [{ code: 'merge-unknown', message: expect.stringContaining('read as patch') }],
			},
		])
		expect(errors()).toBe('')
	})

	it('gives a name not found as a record of name, status, and code; options when ambiguous', async () => {
		const root = repo()
		plugins(root, { a: { amb: 'a\n' }, b: { amb: 'b\n' } })

		expect(await load(['gone', 'amb', 'a/b/c'], { root, format: 'json' })).toBe(0)
		expect(json()).toEqual([
			{ name: 'gone', status: 'missing', code: 'reference-missing' },
			{ name: 'amb', status: 'ambiguous', code: 'reference-ambiguous', options: ['a/amb', 'b/amb'] },
			{ name: 'a/b/c', status: 'invalid', code: 'reference-invalid' },
		])
	})

	it('makes every entry a record with status and metadata under --metadata, without merge and extends', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '---\ndescription: d\ncontract: 2\nmerge: patch\n---\n\nbody\n')

		expect(await load(['name'], { root, format: 'json', metadata: true })).toBe(0)
		expect(json()).toEqual([
			{ name: 'name', status: 'found', content: 'body\n', metadata: { description: 'd', contract: 2 } },
		])
	})

	it('adds the trace under --trace, with the home directory collapsed', async () => {
		const root = repo()
		write(fakeHome.value, '.agents/references/name.md', 'user\n')

		expect(await load(['name'], { root, format: 'toon', trace: true })).toBe(0)
		expect(written()).toContain('~/.agents/references/name.md')
		stdout.mockClear()
		expect(await load(['name'], { root, format: 'json', trace: true })).toBe(0)
		const [entry] = json<{ trace: ReferenceTrace }[]>()
		expect(entry?.trace.contributions).toEqual([
			{ tier: 'user', path: '~/.agents/references/name.md', operation: 'patch' },
		])
		expect(entry?.trace.stack).toEqual([])
	})

	it('warns when a document fails its interface check (R37)', async () => {
		const root = repo()
		plugins(root, { repobuddy: { 'scaffold.recipe.interface': recipeInterface } })
		write(root, '.agents/references/scaffold.recipe.bad.md', '---\nimplements: scaffold.recipe@9\n---\n\n## Recipe\n')

		expect(await load(['scaffold.recipe.bad'], { root, format: 'json' })).toBe(0)
		const [entry] = json<{ warnings: { code: string; message: string }[] }[]>()
		expect(entry?.warnings).toEqual([{ code: 'interface-check', message: expect.stringContaining('(version)') }])
	})

	it('reports a thrown failure as one error value on stdout, exit 1 (R45)', async () => {
		const root = repo()
		failure.value = new Error('boom')
		expect(await load(['name'], { root })).toBe(1)
		expect(written()).toBe('error: boom\ncode: error\n')
		expect(errors()).toBe('')

		stdout.mockClear()
		failure.value = 'not an error'
		expect(await load(['name'], { root, format: 'json' })).toBe(1)
		expect(json()).toEqual({ error: 'Reference lookup failed.', code: 'error' })
	})
})

describe('symlinked skill folders', () => {
	it('reads a default through a symlinked skill folder given to --default', async () => {
		const root = repo()
		const real = skill(root, 'store/tracker', { name: 'linked\n' })
		const link = join(root, '.agents/skills/pnpm-pkg-tracker')
		mkdirSync(dirname(link), { recursive: true })
		symlinkSync(real, link)

		expect(await load(['name'], { root, default: link })).toBe(0)
		expect(written()).toBe('linked\n')
	})
})
