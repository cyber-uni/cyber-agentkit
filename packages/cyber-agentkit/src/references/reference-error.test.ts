import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ReferenceError as ExportedReferenceError } from '../index.js'
import { loadReference } from './load-reference.js'
import { searchReferences } from './reference-catalog.js'
import { checkReferences } from './reference-check.js'
import { ReferenceFailure } from './reference-error.js'
import { referenceImplementations } from './reference-implementations.js'
import { type ReferenceLayer, type ReferenceLayers, referenceLayers } from './reference-layers.js'
import { whereReference } from './reference-where.js'
import { createContribution } from './reference-write.js'

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), 'reference-error-'))
}

function write(root: string, relPath: string, content: string): void {
	const path = join(root, relPath)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
}

function thrown(fn: () => unknown): unknown {
	try {
		fn()
	} catch (error) {
		return error
	}
	return undefined
}

const none: ReferenceLayer[] = []
const noLayers: ReferenceLayers = { layers: [], harnesses: [] }

describe('ReferenceError (R48, C9)', () => {
	it('is exported from the root, carrying its code and whether it is a usage error', () => {
		expect(ExportedReferenceError).toBe(ReferenceFailure)
		const refused = new ReferenceFailure('file-exists', 'there already')
		expect(refused).toBeInstanceOf(Error)
		expect(refused).toMatchObject({
			name: 'ReferenceError',
			code: 'file-exists',
			usage: false,
			message: 'there already',
		})
		expect(new ReferenceFailure('name-missing', 'no name')).toMatchObject({ usage: true })
	})

	it('is thrown for implementations of an unknown interface, as interface-unknown', () => {
		expect(thrown(() => referenceImplementations('nope', none))).toMatchObject({
			code: 'interface-unknown',
			usage: false,
		})
		expect(thrown(() => referenceImplementations('a/b', none))).toMatchObject({ code: 'interface-unknown' })
	})

	it('is thrown, as a usage error, for a read with no name or no query', async () => {
		expect(thrown(() => searchReferences('  ', none))).toMatchObject({ code: 'query-missing', usage: true })
		expect(thrown(() => whereReference('', none, { root: tempDir() }))).toMatchObject({
			code: 'name-missing',
			usage: true,
		})
		await expect(loadReference('', { root: tempDir(), home: tempDir(), env: {} })).rejects.toMatchObject({
			code: 'name-missing',
			usage: true,
		})
	})

	it('is thrown with root-missing when a read is given a root that does not exist (J24)', async () => {
		const root = join(tempDir(), 'gone')
		await expect(loadReference('name', { root, home: tempDir(), env: {} })).rejects.toMatchObject({
			name: 'ReferenceError',
			code: 'root-missing',
			usage: false,
		})
		await expect(referenceLayers({ root, home: tempDir(), platform: 'linux', env: {} })).rejects.toMatchObject({
			code: 'root-missing',
		})
	})

	it('is thrown for a refused write, marked when it is a usage error', () => {
		const root = tempDir()
		write(root, '.git/HEAD', 'ref: refs/heads/main\n')
		write(root, '.agents/references/name.md', 'body\n')
		const args = { root, home: tempDir() }
		expect(thrown(() => createContribution(noLayers, { ...args, name: 'name' }))).toMatchObject({
			code: 'file-exists',
			usage: false,
		})
		expect(thrown(() => createContribution(noLayers, { ...args, name: '../x' }))).toMatchObject({
			code: 'name-invalid',
			usage: true,
		})
		expect(thrown(() => createContribution(noLayers, { ...args, name: 'a/x' }))).toMatchObject({
			code: 'reference-qualified',
			usage: true,
		})
	})

	it('is never thrown for a name not found: that is a status in its record, and a failed check an entry', async () => {
		const root = tempDir()
		const resolved = await loadReference('../x', { root, home: tempDir(), env: {} })
		expect(resolved).toMatchObject({ status: 'invalid', code: 'reference-invalid' })
		expect(await loadReference('gone', { root, home: tempDir(), env: {} })).toMatchObject({
			status: 'missing',
			code: 'reference-missing',
		})
		expect(checkReferences(none, { names: ['gone'] })).toEqual([
			expect.objectContaining({ name: 'gone', failures: [expect.objectContaining({ check: 'reference-missing' })] }),
		])
		expect(whereReference('../x', none, { root })).toMatchObject({ status: 'invalid' })
	})
})
