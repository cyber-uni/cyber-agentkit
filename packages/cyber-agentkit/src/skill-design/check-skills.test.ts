import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { combineReports, expandDir, findSkills } from './check-skills.js'

function tempDir(): string {
	return realpathSync(mkdtempSync(join(tmpdir(), 'check-skills-')))
}

function write(root: string, path: string, content = '---\nname: x\n---\n'): void {
	mkdirSync(dirname(join(root, path)), { recursive: true })
	writeFileSync(join(root, path), content)
}

describe('expandDir', () => {
	it('names one folder without a glob, and nothing when it does not exist', () => {
		const root = tempDir()
		mkdirSync(join(root, 'skills'))
		expect(expandDir(root, 'skills')).toEqual([join(root, 'skills')])
		expect(expandDir(root, 'missing')).toEqual([])
	})

	it('matches * within one segment, and ** at any depth, skipping node_modules', () => {
		const root = tempDir()
		for (const dir of ['plugins/a/skills', 'plugins/b/skills', 'plugins/c/other', 'deep/x/y/skills'])
			mkdirSync(join(root, dir), { recursive: true })
		mkdirSync(join(root, 'node_modules/p/skills'), { recursive: true })
		expect(expandDir(root, 'plugins/*/skills')).toEqual([
			join(root, 'plugins/a/skills'),
			join(root, 'plugins/b/skills'),
		])
		expect(expandDir(root, '**/skills').sort()).toEqual(
			[join(root, 'deep/x/y/skills'), join(root, 'plugins/a/skills'), join(root, 'plugins/b/skills')].sort(),
		)
	})
})

describe('findSkills', () => {
	it('finds every skill under the globs, each real folder once even when linked twice', () => {
		const root = tempDir()
		write(root, '.agents/skills/one/SKILL.md', '---\nname: one\n---\n')
		write(root, 'plugins/p/skills/two/SKILL.md', '---\nname: two\n---\n')
		mkdirSync(join(root, '.claude/skills'), { recursive: true })
		symlinkSync(join(root, '.agents/skills/one'), join(root, '.claude/skills/one'))
		const found = findSkills(root, ['.agents/skills', '.claude/skills', 'plugins/*/skills'])
		expect(found.map((skill) => skill.name)).toEqual(['one', 'two'])
	})

	it('takes a folder that is itself a skill', () => {
		const root = tempDir()
		write(root, 'solo/SKILL.md', '---\nname: solo\n---\n')
		expect(findSkills(root, ['solo']).map((skill) => skill.name)).toEqual(['solo'])
	})
})

describe('combineReports', () => {
	const report = (skill: string, status: 'pass' | 'fail' | 'not-checked', failed = 0, critical = 0, skipped = 0) => ({
		skill,
		status,
		passed: 3,
		failed,
		critical,
		notChecked: status === 'not-checked' ? 1 : 0,
		skipped,
		aspects: [],
	})

	it('sums the counts, takes the worst status, and names each folder relative to the root', () => {
		const combined = combineReports(
			'/repo',
			['skills'],
			[
				{ folder: '/repo/skills/a', report: report('a', 'pass', 0, 0, 2) },
				{ folder: '/repo/skills/b', report: report('b', 'fail', 2, 1) },
				{ folder: '/repo/skills/c', report: report('c', 'not-checked') },
			],
		)
		expect(combined).toMatchObject({
			status: 'fail',
			skills: 3,
			skillsFailed: 1,
			passed: 9,
			failed: 2,
			critical: 1,
			skipped: 2,
		})
		expect(combined.reports.map((item) => item.folder)).toEqual(['skills/a', 'skills/b', 'skills/c'])
	})

	it('passes only when every skill passes', () => {
		expect(combineReports('/r', [], [{ folder: '/r/a', report: report('a', 'pass', 0, 0, 1) }]).status).toBe('pass')
		expect(
			combineReports(
				'/r',
				[],
				[
					{ folder: '/r/a', report: report('a', 'pass') },
					{ folder: '/r/b', report: report('b', 'not-checked') },
				],
			).status,
		).toBe('not-checked')
	})
})
