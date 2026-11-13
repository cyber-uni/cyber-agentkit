import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findSkillFolders, inTemporaryFolder, parseVetSource } from './vet-source.js'

describe('parseVetSource', () => {
	it('reads owner/repo and owner/repo/<path> as GitHub sources', () => {
		expect(parseVetSource('acme/skills')).toEqual({
			url: 'https://github.com/acme/skills.git',
			github: { owner: 'acme', repo: 'skills' },
		})
		expect(parseVetSource('acme/skills/tools/release-notes')).toMatchObject({ path: 'tools/release-notes' })
	})

	it('reads a GitHub URL with /tree/<ref>/<path>, and a blob URL of a SKILL.md as its folder', () => {
		expect(parseVetSource('https://github.com/acme/skills/tree/v1.2.0/release-notes')).toEqual({
			url: 'https://github.com/acme/skills.git',
			github: { owner: 'acme', repo: 'skills' },
			ref: 'v1.2.0',
			path: 'release-notes',
		})
		expect(parseVetSource('https://github.com/acme/skills/blob/main/release-notes/SKILL.md')).toMatchObject({
			ref: 'main',
			path: 'release-notes',
		})
		expect(parseVetSource('https://github.com/acme/skills.git')).toMatchObject({ github: { repo: 'skills' } })
	})

	it('takes another https:// git host, with no GitHub signals', () => {
		expect(parseVetSource('https://gitlab.com/acme/skills.git')).toEqual({ url: 'https://gitlab.com/acme/skills.git' })
	})

	it('lets --ref and --path override what the source names', () => {
		expect(parseVetSource('acme/skills/a', { ref: 'next', path: 'b' })).toMatchObject({ ref: 'next', path: 'b' })
	})

	it('refuses a transport other than https, credentials in the URL, a path that leaves the repository, and a ref that reads as a flag', () => {
		for (const source of [
			'git@github.com:acme/skills.git',
			'ssh://github.com/acme/skills',
			'file:///etc',
			'ext::sh -c touch% /tmp/pwned',
			'http://github.com/acme/skills',
			'https://user:token@github.com/acme/skills',
			'acme',
			'acme/skills/../../etc',
		])
			expect(parseVetSource(source)).toHaveProperty('problem')
		expect(parseVetSource('acme/skills', { ref: '--upload-pack=touch' })).toHaveProperty('problem')
	})
})

describe('findSkillFolders', () => {
	it('lists every folder holding a SKILL.md, skipping .git and node_modules', () => {
		const root = mkdtempSync(join(tmpdir(), 'vet-find-'))
		for (const folder of ['skills/a', 'skills/b', '.git/x', 'node_modules/c'].map((path) => join(root, path))) {
			mkdirSync(folder, { recursive: true })
			writeFileSync(join(folder, 'SKILL.md'), '---\nname: x\n---\n')
		}
		expect(findSkillFolders(root, '.')).toEqual(['skills/a', 'skills/b'])
		expect(findSkillFolders(root, 'skills/b')).toEqual(['skills/b'])
		expect(findSkillFolders(root, 'missing')).toEqual([])
	})
})

describe('inTemporaryFolder', () => {
	it('removes the folder afterwards, also when the work throws', async () => {
		let kept = ''
		await expect(
			inTemporaryFolder((folder) => {
				kept = folder
				writeFileSync(join(folder, 'file'), 'x')
				throw new Error('boom')
			}),
		).rejects.toThrow('boom')
		expect(kept).not.toBe('')
		expect(existsSync(kept)).toBe(false)
	})
})
