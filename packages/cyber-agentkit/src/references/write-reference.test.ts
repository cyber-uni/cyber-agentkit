import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createReference as exportedCreate, deleteReference as exportedDelete } from '../index.js'
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
