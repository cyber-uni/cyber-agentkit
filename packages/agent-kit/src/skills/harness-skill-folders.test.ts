import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, win32 } from 'node:path'
import { describe, expect, it } from 'vitest'
import { adminSkillFolders, harnessSkillFolders, pluginSkillFolders } from './harness-skill-folders.js'

function plugin(manifest?: Record<string, unknown>, path = '.claude-plugin/plugin.json'): string {
	const root = mkdtempSync(join(tmpdir(), 'harness-skill-folders-'))
	if (manifest) {
		mkdirSync(join(root, path, '..'), { recursive: true })
		writeFileSync(join(root, path), JSON.stringify(manifest))
	}
	return root
}

describe('harnessSkillFolders', () => {
	const options = { chain: ['/repo/pkg', '/repo'], home: '/home/me', platform: 'linux' as const }

	it('reads project folders in each folder of the chain, then user, then admin', () => {
		expect(harnessSkillFolders('claude-code', options)).toEqual([
			'/repo/pkg/.claude/skills',
			'/repo/.claude/skills',
			'/home/me/.claude/skills',
			'/etc/claude-code/.claude/skills',
		])
	})

	it('reads $COPILOT_HOME/skills instead of the user folders when COPILOT_HOME moves', () => {
		const folders = harnessSkillFolders('copilot-cli', { ...options, env: { COPILOT_HOME: '/elsewhere' } })

		expect(folders).toContain('/elsewhere/skills')
		expect(folders).not.toContain('/home/me/.agents/skills')
		expect(harnessSkillFolders('copilot-cli', { ...options, env: { COPILOT_HOME: '/home/me/.copilot' } })).toContain(
			'/home/me/.agents/skills',
		)
	})

	it('is undefined for a harness whose skill folders are not verified', () => {
		expect(harnessSkillFolders('kilo', options)).toBeUndefined()
		expect(harnessSkillFolders('qwen-code', options)).toBeUndefined()
	})
})

describe('adminSkillFolders', () => {
	it('names Claude Code, Codex, and OpenCode admin folders per platform', () => {
		expect(adminSkillFolders('claude-code', 'darwin')).toEqual([
			'/Library/Application Support/ClaudeCode/.claude/skills',
		])
		expect(adminSkillFolders('claude-code', 'win32')).toEqual([
			win32.join('C:\\Program Files\\ClaudeCode', '.claude', 'skills'),
		])
		expect(adminSkillFolders('codex', 'linux')).toEqual(['/etc/codex/skills'])
		expect(adminSkillFolders('codex', 'win32')).toEqual([])
		expect(adminSkillFolders('opencode', 'linux')).toEqual(['/etc/opencode/skill', '/etc/opencode/skills'])
		expect(adminSkillFolders('opencode', 'darwin')).toEqual([
			'/Library/Application Support/opencode/skill',
			'/Library/Application Support/opencode/skills',
		])
		expect(adminSkillFolders('opencode', 'win32', { ProgramData: 'D:\\Data' })).toEqual([
			win32.join('D:\\Data', 'opencode', 'skill'),
			win32.join('D:\\Data', 'opencode', 'skills'),
		])
		expect(adminSkillFolders('cursor', 'linux')).toEqual([])
	})
})

describe('pluginSkillFolders', () => {
	it('reads skills/ by default', () => {
		const root = plugin()

		expect(pluginSkillFolders('cursor', root)).toEqual([join(root, 'skills')])
	})

	it('adds the manifest skills paths in Claude Code, and replaces skills/ with them elsewhere', () => {
		const root = plugin({ name: 'p', skills: ['./extra'] })

		expect(pluginSkillFolders('claude-code', root)).toEqual([join(root, 'skills'), join(root, 'extra')])
		expect(pluginSkillFolders('codex', root)).toEqual([join(root, 'extra')])
	})

	it('reads a single skills path, and ignores the field in Gemini CLI', () => {
		const root = plugin({ name: 'p', skills: './one' }, 'plugin.json')

		expect(pluginSkillFolders('copilot-cli', root)).toEqual([join(root, 'one')])
		expect(pluginSkillFolders('gemini-cli', root)).toEqual([join(root, 'skills')])
	})

	it('reads nothing for an OpenCode plugin, which ships no skills', () => {
		expect(pluginSkillFolders('opencode', plugin())).toEqual([])
	})
})
