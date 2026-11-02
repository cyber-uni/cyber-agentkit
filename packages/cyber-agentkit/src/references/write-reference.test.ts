import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
	createReference as exportedCreate,
	customizeReference as exportedCustomize,
	deleteReference as exportedDelete,
} from '../index.js'
import { customizeReference } from './reference-customize.js'
import { createReference, deleteReference } from './write-reference.js'

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), 'reference-library-'))
}

function write(root: string, relPath: string, content: string): string {
	const path = join(root, relPath)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
	return path
}

function repo(): string {
	const root = tempDir()
	mkdirSync(join(root, '.git'))
	return root
}

describe('createReference and deleteReference (C9)', () => {
	it('are exported from the root', () => {
		expect(exportedCreate).toBe(createReference)
		expect(exportedDelete).toBe(deleteReference)
	})

	it('create a project section relative to cwd, and delete it, reporting what answers after', async () => {
		const root = repo()
		mkdirSync(join(root, 'app'))
		const options = { cwd: root, home: tempDir(), env: {} }

		const created = await createReference('name', { ...options, in: 'app' })
		expect(created).toMatchObject({ scope: 'project', folder: 'app', warnings: [], dryRun: false })
		expect(readFileSync(join(root, 'app/.agents/references/name.md'), 'utf8')).not.toContain('merge:')
		expect(created.after?.projectSections.map(({ folder }) => folder)).toEqual(['app'])

		const deleted = await deleteReference('name', { ...options, in: 'app' })
		expect(existsSync(join(root, 'app/.agents/references/name.md'))).toBe(false)
		expect(deleted.after).toMatchObject({ status: 'missing' })
		expect(await deleteReference('name', { ...options, in: 'app' })).toMatchObject({ code: 'no-file' })
	})

	it('return a hidden file’s warning in the record, and throw a refusal with its code', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', '---\nmerge: remove\n---\n')
		const options = { root, home: tempDir(), env: {} }

		const created = await createReference('name', { ...options, scope: 'user' })
		expect(created.warnings).toEqual([expect.objectContaining({ code: 'repo-hides-user' })])

		await expect(createReference('name', options)).resolves.toMatchObject({ scope: 'repo' })
		await expect(createReference('../x', options)).rejects.toMatchObject({ code: 'name-invalid', usage: true })
		await expect(createReference('x.md', { ...options, root: join(root, 'gone') })).rejects.toMatchObject({
			code: 'name-invalid',
		})
		await expect(createReference('x', { ...options, root: join(root, 'gone') })).rejects.toMatchObject({
			code: 'root-missing',
			usage: false,
		})
		await expect(deleteReference('x', { ...options, in: root })).rejects.toMatchObject({
			code: 'in-not-below-root',
			usage: true,
		})
	})
})

describe('customizeReference (C9)', () => {
	it('is exported from the root', () => {
		expect(exportedCustomize).toBe(customizeReference)
	})

	it('writes a generated body from files relative to cwd, and returns the base without writing', async () => {
		const root = repo()
		write(root, 'request.md', 'shorter\n')
		write(root, 'body.md', '## A\n\nshort\n')
		const options = { cwd: root, home: tempDir(), env: {} }

		const customized = await customizeReference('name', { ...options, request: 'request.md', body: 'body.md' })
		expect(customized).toMatchObject({ action: 'generated', scope: 'repo', warnings: [], dryRun: false })
		expect(customized.after).toMatchObject({ status: 'found', content: '## A\n\nshort\n' })

		const base = await customizeReference('name', { ...options, base: true })
		expect(base).toMatchObject({ action: 'base', base: { content: '' } })
		expect(base.base?.resolved.status).toBe('missing')
		expect(readFileSync(join(root, '.agents/references/name.md'), 'utf8')).toContain('request: |\n  shorter\n')
	})

	it('throws a refusal with its code, marked usage for a wrong call', async () => {
		const root = repo()
		const options = { root, home: tempDir(), env: {} }
		await expect(customizeReference('name', options)).rejects.toMatchObject({ code: 'change-missing', usage: true })
		await expect(customizeReference('name', { ...options, extends: ['nope'] })).rejects.toMatchObject({
			code: 'step-invalid',
			usage: false,
		})
		expect(existsSync(join(root, '.agents/references/name.md'))).toBe(false)
	})

	it('createReference writes a plugin’s own file with pluginFolder, apart from the host plugin', async () => {
		const root = repo()
		const folder = join(root, 'plugins/house')
		write(folder, 'plugin.json', JSON.stringify({ name: 'house' }))
		const options = { root, home: tempDir(), env: {} }

		const created = await createReference('name', { ...options, pluginFolder: folder })
		expect(created).toMatchObject({ scope: 'plugin' })
		expect(existsSync(join(folder, 'references/name.md'))).toBe(true)
	})

	it('createReference still takes the host plugin as plugin', async () => {
		const root = repo()
		const host = join(root, 'plugins/host')
		write(host, 'plugin.json', JSON.stringify({ name: 'host' }))
		write(host, 'references/name.md', 'Host text.\n')
		const options = { root, home: tempDir(), env: {}, plugin: { name: 'host', root: host } }

		const created = await createReference('name', options)
		expect(created).toMatchObject({ scope: 'repo' })
		expect(existsSync(join(root, '.agents/references/name.md'))).toBe(true)
		expect(existsSync(join(host, 'references/name.md'))).toBe(true)
	})
})
