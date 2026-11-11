import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { copyPlugin, findSkillPlugin } from './skill-plugin.js'

function tree(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), 'skill-plugin-'))
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true })
		writeFileSync(join(root, path), text)
	}
	return root
}

const manifest = (extra: Record<string, unknown> = {}) => JSON.stringify({ name: 'kit', ...extra })

describe('findSkillPlugin', () => {
	it('finds the plugin whose skills folder holds the skill', () => {
		const root = tree({ '.claude-plugin/plugin.json': manifest(), 'skills/notes/SKILL.md': '' })
		expect(findSkillPlugin(join(root, 'skills', 'notes'))).toEqual({ root, name: 'kit' })
	})

	it('reads a skills path the manifest names', () => {
		const root = tree({ '.claude-plugin/plugin.json': manifest({ skills: ['./more/'] }), 'more/notes/SKILL.md': '' })
		expect(findSkillPlugin(join(root, 'more', 'notes'))).toEqual({ root, name: 'kit' })
		expect(findSkillPlugin(join(root, 'skills', 'notes'))).toBeUndefined()
	})

	it('passes over a plugin whose skills folder does not hold the skill, such as an eval fixture inside it', () => {
		const root = tree({
			'.claude-plugin/plugin.json': manifest(),
			'skills/skill/evals/files/repo/.agents/skills/notes/SKILL.md': '',
		})
		expect(findSkillPlugin(join(root, 'skills/skill/evals/files/repo/.agents/skills/notes'))).toBeUndefined()
	})

	it('answers undefined with no plugin above, or one with no name or an unreadable manifest', () => {
		expect(findSkillPlugin(join(tree({ 'skills/notes/SKILL.md': '' }), 'skills', 'notes'))).toBeUndefined()
		const unnamed = tree({ '.claude-plugin/plugin.json': '{}', 'skills/notes/SKILL.md': '' })
		expect(findSkillPlugin(join(unnamed, 'skills', 'notes'))).toBeUndefined()
		const broken = tree({ '.claude-plugin/plugin.json': '{', 'skills/notes/SKILL.md': '' })
		expect(findSkillPlugin(join(broken, 'skills', 'notes'))).toBeUndefined()
	})
})

describe('copyPlugin', () => {
	const plugin = () =>
		tree({
			'.claude-plugin/plugin.json': manifest(),
			'references/a.md': 'a',
			'skills/notes/SKILL.md': 'notes',
			'skills/other/SKILL.md': 'other',
			'node_modules/x/index.js': '',
			'.git/HEAD': '',
		})

	it('copies the plugin without node_modules or .git', () => {
		const root = plugin()
		const target = join(mkdtempSync(join(tmpdir(), 'skill-plugin-copy-')), 'p')
		copyPlugin(root, target)
		expect(readFileSync(join(target, 'references/a.md'), 'utf8')).toBe('a')
		expect(existsSync(join(target, 'skills/notes/SKILL.md'))).toBe(true)
		expect(existsSync(join(target, 'node_modules'))).toBe(false)
		expect(existsSync(join(target, '.git'))).toBe(false)
	})

	it('leaves out the skill, or puts another version in its place', () => {
		const root = plugin()
		const base = mkdtempSync(join(tmpdir(), 'skill-plugin-copy-'))
		copyPlugin(root, join(base, 'without'), join(root, 'skills', 'notes'))
		expect(existsSync(join(base, 'without/skills/notes'))).toBe(false)
		expect(existsSync(join(base, 'without/skills/other/SKILL.md'))).toBe(true)

		const older = tree({ 'SKILL.md': 'older' })
		copyPlugin(root, join(base, 'older'), join(root, 'skills', 'notes'), older)
		expect(readFileSync(join(base, 'older/skills/notes/SKILL.md'), 'utf8')).toBe('older')
	})
})
