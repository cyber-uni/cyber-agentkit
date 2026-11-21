import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findSkill } from './find-skill.js'

function repo(skills: Record<string, string>): string {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'find-skill-')))
	for (const [folder, name] of Object.entries(skills)) {
		mkdirSync(join(root, folder), { recursive: true })
		writeFileSync(join(root, folder, 'SKILL.md'), `---\nname: ${name}\ndescription: d\n---\n`)
	}
	return root
}

const options = (root: string, skill: string) => ({ skill, cwd: root, root, harnesses: [], home: root })

describe('findSkill', () => {
	it('gives a folder holding a SKILL.md as it is', () => {
		const root = repo({ 'anywhere/notes': 'notes' })
		expect(findSkill(options(root, 'anywhere/notes'))).toEqual({
			found: { name: 'notes', folder: join(root, 'anywhere/notes') },
		})
	})

	it("finds a skill by name in the repository's skills and .agents/skills", () => {
		const root = repo({ 'skills/a': 'alpha', '.agents/skills/b': 'beta' })
		expect(findSkill(options(root, 'alpha'))).toMatchObject({ found: { folder: join(root, 'skills/a') } })
		expect(findSkill(options(root, 'beta'))).toMatchObject({ found: { folder: join(root, '.agents/skills/b') } })
	})

	it('names each folder when two skills share the name, and says when none has it', () => {
		const root = repo({ 'skills/a': 'dup', '.agents/skills/b': 'dup' })
		expect(findSkill(options(root, 'dup'))).toMatchObject({
			code: 'skill-ambiguous',
			folders: [join(root, 'skills/a'), join(root, '.agents/skills/b')],
		})
		expect(findSkill(options(root, 'nothing'))).toMatchObject({ code: 'skill-not-found' })
	})

	it('searches the extra folders it is given', () => {
		const root = repo({ 'installed/c': 'gamma' })
		expect(findSkill({ ...options(root, 'gamma'), also: [join(root, 'installed')] })).toMatchObject({
			found: { name: 'gamma' },
		})
	})
})
