import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { skillName, skillsIn } from './skill-folder.js'

function tempDir(): string {
	return realpathSync(mkdtempSync(join(tmpdir(), 'skill-folder-')))
}

function write(root: string, path: string, content: string): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), content)
}

describe('skillName', () => {
	it('reads the name its SKILL.md gives, not its folder name', () => {
		const root = tempDir()
		write(root, 'pnpm-pkg-tracker/SKILL.md', '---\nname: tracker\n---\n')

		expect(skillName(join(root, 'pnpm-pkg-tracker'))).toBe('tracker')
	})

	it('falls back to the folder name when SKILL.md gives none, and is undefined without SKILL.md', () => {
		const root = tempDir()
		write(root, 'plain/SKILL.md', '# no frontmatter\n')
		write(root, 'broken/SKILL.md', '---\nname: [unclosed\n---\n')
		mkdirSync(join(root, 'empty'))

		expect(skillName(join(root, 'plain'))).toBe('plain')
		expect(skillName(join(root, 'broken'))).toBe('broken')
		expect(skillName(join(root, 'empty'))).toBeUndefined()
	})
})

describe('skillsIn', () => {
	it('finds the skills one level under each folder, following symlinks, each real folder once', () => {
		const store = tempDir()
		write(store, 'real/SKILL.md', '---\nname: linked\n---\n')
		const skills = tempDir()
		write(skills, 'own/SKILL.md', '---\nname: own\n---\n')
		write(skills, 'notes.md', 'not a folder\n')
		mkdirSync(join(skills, 'no-skill'))
		symlinkSync(join(store, 'real'), join(skills, 'pnpm-pkg-linked'))
		symlinkSync(join(store, 'real'), join(skills, 'again'))

		expect(skillsIn([skills, join(skills, 'missing')])).toEqual([
			{ name: 'linked', folder: join(store, 'real') },
			{ name: 'own', folder: join(skills, 'own') },
		])
	})
})
