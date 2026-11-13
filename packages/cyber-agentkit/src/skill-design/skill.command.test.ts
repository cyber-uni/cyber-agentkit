import { cpSync, mkdirSync, mkdtempSync, realpathSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { run } from '../cli.js'
import { goodSkill, goodSkillMd, makeSkill } from './skill-design.fixtures.js'

const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

afterEach(() => {
	stdout.mockClear()
	stderr.mockClear()
	process.exitCode = undefined
})

const printed = () => stdout.mock.calls.map(([chunk]) => String(chunk)).join('')
const check = (folder: string, ...rest: string[]) =>
	run(['node', 'cyber-agentkit', 'skill', 'check', folder, '--format', 'json', ...rest])
const longBody = (md: string) => md.replace('## Done when', `${'line\n'.repeat(500)}\n## Done when`)

describe('skill check', () => {
	it('exits 0 when no check it ran fails, and reports the rest as not checked', async () => {
		const code = await check(goodSkill().folder)
		const report = JSON.parse(printed())
		expect(code).toBe(0)
		expect(report).toMatchObject({ skill: 'release-notes', failed: 0, status: 'not-checked' })
		expect(report.aspects.map((aspect: { aspect: string }) => aspect.aspect)).toEqual([
			'specification',
			'intent',
			'shape',
			'trigger',
			'criteria',
			'verification',
			'security',
		])
	})

	it('exits 1 and names the failing check when one fails, still checking every aspect', async () => {
		const md = goodSkillMd.replace('name: release-notes', 'name: Wrong')
		const code = await check(makeSkill({ 'SKILL.md': md }).folder)
		const report = JSON.parse(printed())
		expect(code).toBe(1)
		expect(report.aspects[0].checks).toContainEqual(expect.objectContaining({ id: 'SPEC-2', status: 'fail' }))
		expect(report.aspects).toHaveLength(7)
	})

	it('reports each failure with its severity, and exits 0 on warnings under the default policy', async () => {
		const code = await check(goodSkill({ 'SKILL.md': longBody(goodSkillMd) }).folder)
		const report = JSON.parse(printed())
		expect(code).toBe(0)
		expect(report).toMatchObject({ failed: 1, critical: 0 })
		expect(report.aspects[2].checks).toContainEqual(
			expect.objectContaining({ id: 'SHP-1', status: 'fail', severity: 'warning' }),
		)
	})

	it('exits 1 on a warning with --fail-on any, and on a critical failure under either policy', async () => {
		expect(await check(goodSkill({ 'SKILL.md': longBody(goodSkillMd) }).folder, '--fail-on', 'any')).toBe(1)
		const md = longBody(goodSkillMd.replace('name: release-notes', 'name: Wrong'))
		expect(await check(goodSkill({ 'SKILL.md': md }).folder)).toBe(1)
		expect(await check(goodSkill({ 'SKILL.md': md }).folder, '--fail-on', 'critical')).toBe(1)
	})

	it('shows the severity of each failure in the text report', async () => {
		await run([
			'node',
			'cyber-agentkit',
			'skill',
			'check',
			goodSkill({ 'SKILL.md': longBody(goodSkillMd) }).folder,
			'--format',
			'text',
		])
		expect(printed()).toContain('1 failed of which 0 critical')
		expect(printed()).toMatch(/SHP-1 fail \(warning\): the body is \d+ lines/)
	})

	it('rejects a --fail-on it does not know', async () => {
		const code = await check(goodSkill().folder, '--fail-on', 'some')
		expect(code).not.toBe(0)
		expect(stderr.mock.calls.join('')).toContain('unknown-fail-on: no --fail-on some; use any or critical')
	})

	it('skips TRG-1, TRG-4, and TRG-7 on a name-only skill and checks the form of its description (R140)', async () => {
		const md = goodSkillMd.replace(/^description: .*$/m, 'description: By name only')
		const code = await check(goodSkill({ 'SKILL.md': md }).folder)
		const report = JSON.parse(printed())
		const trigger = report.aspects.find((aspect: { aspect: string }) => aspect.aspect === 'trigger')
		expect(code).toBe(0)
		expect(trigger.checks).toEqual([
			{ id: 'TRG-1', status: 'skipped', severity: 'critical', message: 'the skill is name-only' },
			{
				id: 'TRG-3',
				status: 'not-checked',
				severity: 'warning',
				message: 'an agent decides it by reading the skill',
				needs: 'check',
			},
			{ id: 'TRG-4', status: 'skipped', severity: 'critical', message: 'the skill is name-only' },
			{ id: 'TRG-5', status: 'pass', severity: 'critical' },
			{
				id: 'TRG-6',
				status: 'not-checked',
				severity: 'warning',
				message: 'an agent decides it by reading the skill',
				needs: 'check',
			},
			{ id: 'TRG-7', status: 'skipped', severity: 'warning', message: 'the skill is name-only' },
			{
				id: 'TRG-8',
				status: 'not-checked',
				severity: 'warning',
				message: 'an agent decides it by reading the skill',
				needs: 'check',
			},
		])
		expect(report.skipped).toBe(3)
	})

	it('skips TRG-5 and TRG-6 on a skill that is not name-only, and checks TRG-7', async () => {
		await check(goodSkill().folder)
		const trigger = JSON.parse(printed()).aspects.find((aspect: { aspect: string }) => aspect.aspect === 'trigger')
		expect(trigger.checks.slice(3)).toEqual([
			{ id: 'TRG-5', status: 'skipped', severity: 'critical', message: 'the skill is not name-only' },
			{ id: 'TRG-6', status: 'skipped', severity: 'warning', message: 'the skill is not name-only' },
			{ id: 'TRG-7', status: 'pass', severity: 'warning' },
			{
				id: 'TRG-8',
				status: 'not-checked',
				severity: 'warning',
				message: 'an agent decides it by reading the skill',
				needs: 'check',
			},
		])
	})

	it('stops and names the folder when it holds no SKILL.md', async () => {
		const code = await check('/nonexistent/skill')
		expect(code).toBe(1)
		expect(printed()).toBe('')
		expect(stderr.mock.calls.join('')).toContain('skill-missing: no SKILL.md in /nonexistent/skill')
	})
})

describe('skill check across a repository', () => {
	const repo = (skills: Record<string, string>) => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), 'skill-check-repo-')))
		mkdirSync(join(root, '.git'))
		for (const [folder, md] of Object.entries(skills)) {
			const good = goodSkill({ 'SKILL.md': md })
			cpSync(good.folder, join(root, folder), { recursive: true })
		}
		return root
	}
	const checkAll = (root: string, ...rest: string[]) =>
		run(['node', 'cyber-agentkit', 'skill', 'check', '--root', root, '--format', 'json', ...rest])

	it('checks every skill under skills and .agents/skills by default, with one summary', async () => {
		const root = repo({ 'skills/release-notes': goodSkillMd, '.agents/skills/release-notes': goodSkillMd })
		const code = await checkAll(root)
		const report = JSON.parse(printed())
		expect(code).toBe(0)
		expect(report).toMatchObject({ skills: 2, skillsFailed: 0, failed: 0 })
		const skipped = report.reports.map((item: { skipped: number }) => item.skipped)
		expect(skipped.every((count: number) => count > 0)).toBe(true)
		expect(report.skipped).toBe(skipped[0] + skipped[1])
		expect(report.reports.map((item: { folder: string }) => item.folder)).toEqual([
			'skills/release-notes',
			'.agents/skills/release-notes',
		])
	})

	it('scans the --dir globs instead, checking a skill reached through a symlink once', async () => {
		const root = repo({ 'plugins/a/skills/release-notes': goodSkillMd })
		mkdirSync(join(root, 'linked'))
		symlinkSync(join(root, 'plugins/a/skills/release-notes'), join(root, 'linked/release-notes'))
		await checkAll(root, '--dir', 'plugins/*/skills', '--dir', 'linked')
		expect(JSON.parse(printed())).toMatchObject({ skills: 1, dirs: ['plugins/*/skills', 'linked'] })
	})

	it('exits 1 when any skill fails a critical check, and on a warning only with --fail-on any', async () => {
		const wrong = goodSkillMd.replace('name: release-notes', 'name: Wrong')
		expect(await checkAll(repo({ 'skills/release-notes': goodSkillMd, 'skills/other': wrong }))).toBe(1)
		expect(JSON.parse(printed())).toMatchObject({ skills: 2, skillsFailed: 1 })
		const warned = repo({ 'skills/release-notes': longBody(goodSkillMd) })
		expect(await checkAll(warned)).toBe(0)
		expect(await checkAll(warned, '--fail-on', 'any')).toBe(1)
	})

	it('ends the text report with the summary', async () => {
		const root = repo({ 'skills/release-notes': goodSkillMd })
		await run(['node', 'cyber-agentkit', 'skill', 'check', '--root', root, '--format', 'text'])
		expect(printed()).toContain('release-notes (skills/release-notes): not-checked')
		expect(printed()).toMatch(
			/1 skills: not-checked \(0 failed; \d+ checks passed, 0 failed of which 0 critical, \d+ not checked, \d+ skipped\)/,
		)
	})

	it('fails when no skill is found, and refuses a folder with --dir', async () => {
		expect(await checkAll(repo({}), '--dir', 'nothing')).toBe(1)
		expect(stderr.mock.calls.join('')).toContain('no-skills: no skill under nothing')
		expect(await check(goodSkill().folder, '--dir', 'skills')).toBe(2)
		expect(stderr.mock.calls.join('')).toContain('folder-and-dir')
	})
})
