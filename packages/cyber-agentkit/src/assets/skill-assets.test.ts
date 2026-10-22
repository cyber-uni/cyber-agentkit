import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AssetError, deleteAsset, listAssets, showAsset, writeAsset } from './skill-assets.js'

function repo() {
	const root = mkdtempSync(join(tmpdir(), 'skill-assets-'))
	mkdirSync(join(root, '.git'))
	const skill = join(root, 'skills', 'demo')
	mkdirSync(skill, { recursive: true })
	writeFileSync(join(skill, 'SKILL.md'), '---\nname: demo\ndescription: d\n---\n')
	return { root, skill }
}

function code(run: () => unknown): string | undefined {
	try {
		run()
	} catch (error) {
		return error instanceof AssetError ? error.code : 'other'
	}
	return undefined
}

describe('asset (R1 to R7)', () => {
	it('creates, lists, shows, updates, and deletes (R1, R3, R4)', () => {
		const { root, skill } = repo()
		expect(listAssets(skill, root)).toEqual([])
		writeAsset('create', skill, root, 'data/rules.json', '{"a":1}')
		writeAsset('create', skill, root, 'a.txt', 'hi')
		expect(listAssets(skill, root)).toEqual([
			{ path: 'a.txt', bytes: 2 },
			{ path: 'data/rules.json', bytes: 7 },
		])
		expect(showAsset(skill, root, 'data/rules.json')).toBe('{"a":1}')
		writeAsset('update', skill, root, 'a.txt', 'hello')
		expect(showAsset(skill, root, 'a.txt')).toBe('hello')
		deleteAsset(skill, root, 'data/rules.json')
		expect(existsSync(join(skill, 'assets', 'data'))).toBe(false)
		expect(existsSync(join(skill, 'assets'))).toBe(true)
	})

	it('refuses create over a file and update of a missing one (R3)', () => {
		const { root, skill } = repo()
		writeAsset('create', skill, root, 'a.txt', 'x')
		expect(code(() => writeAsset('create', skill, root, 'a.txt', 'y'))).toBe('exists')
		expect(code(() => writeAsset('update', skill, root, 'b.txt', 'y'))).toBe('no-file')
		expect(code(() => deleteAsset(skill, root, 'b.txt'))).toBe('no-file')
	})

	it('refuses paths that leave assets/ (R2)', () => {
		const { root, skill } = repo()
		for (const path of ['../SKILL.md', '/etc/passwd', 'a//b', 'a\\b', '']) {
			expect(code(() => showAsset(skill, root, path))).toBe('path-invalid')
		}
		const outside = mkdtempSync(join(tmpdir(), 'outside-'))
		writeFileSync(join(outside, 'secret'), 's')
		mkdirSync(join(skill, 'assets'))
		symlinkSync(outside, join(skill, 'assets', 'link'))
		expect(code(() => showAsset(skill, root, 'link/secret'))).toBe('path-invalid')
		expect(listAssets(skill, root)).toEqual([])
	})

	it('refuses a folder that is not a skill, and a write outside the repository (R5)', () => {
		const { root, skill } = repo()
		expect(code(() => listAssets(root, root))).toBe('folder-invalid')
		const other = mkdtempSync(join(tmpdir(), 'elsewhere-'))
		writeFileSync(join(other, 'SKILL.md'), '---\nname: x\ndescription: d\n---\n')
		expect(code(() => writeAsset('create', other, root, 'a.txt', 'x'))).toBe('folder-invalid')
		expect(skill).toBeTruthy()
	})

	it('refuses to show a binary file (UC1.4)', () => {
		const { root, skill } = repo()
		mkdirSync(join(skill, 'assets'))
		writeFileSync(join(skill, 'assets', 'p.bin'), Buffer.from([1, 0, 2]))
		expect(code(() => showAsset(skill, root, 'p.bin'))).toBe('binary')
	})
})
