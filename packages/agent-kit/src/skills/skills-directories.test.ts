import { describe, expect, it } from 'vitest'

import { skillsDirectories } from './skills-directories.js'

describe('skillsDirectories', () => {
	it('reads only .claude/skills in Claude Code', () => {
		expect(skillsDirectories('claude-code')).toEqual({
			project: ['.claude/skills'],
			user: ['.claude/skills'],
			research: ['E-CC-L1'],
		})
	})

	it.each([
		'cursor',
		'codex',
		'copilot-cli',
		'vscode-copilot',
		'opencode',
		'gemini-cli',
		'cline',
		'augment',
		'kilo',
	] as const)('includes .agents/skills at both scopes in %s', (harness) => {
		const directories = skillsDirectories(harness)
		expect(directories?.project).toContain('.agents/skills')
		expect(directories?.user).toContain('.agents/skills')
	})

	it('does not include .agents/skills in Claude Code', () => {
		const directories = skillsDirectories('claude-code')
		expect(directories?.project).not.toContain('.agents/skills')
		expect(directories?.user).not.toContain('.agents/skills')
	})

	it('lists the Auggie CLI directories in their documented precedence', () => {
		expect(skillsDirectories('augment')).toEqual({
			project: ['.augment/skills', '.claude/skills', '.agents/skills'],
			user: ['.augment/skills', '.claude/skills', '.agents/skills'],
			research: ['E-AUG-S4'],
		})
	})

	it('lists the Kilo Code directories, Kilo first', () => {
		expect(skillsDirectories('kilo')).toEqual({
			project: ['.kilo/skills', '.agents/skills', '.claude/skills'],
			user: ['.kilo/skills', '.agents/skills', '.claude/skills'],
			research: ['E-KILO-L2'],
		})
	})

	it('cites the Cline source for the .agents/skills its docs do not name', () => {
		expect(skillsDirectories('cline')?.research).toContain('E-CLINE-S3')
	})

	it('lists the .agents/skills alias before .gemini/skills in Gemini CLI, which it takes precedence over', () => {
		expect(skillsDirectories('gemini-cli')?.project).toEqual(['.agents/skills', '.gemini/skills'])
	})

	it.each(['qwen-code', 'crush', 'openhands'] as const)(
		'returns undefined for %s, where the directories are not confirmed',
		(harness) => {
			expect(skillsDirectories(harness)).toBeUndefined()
		},
	)
})
