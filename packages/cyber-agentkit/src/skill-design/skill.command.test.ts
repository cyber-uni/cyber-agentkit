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

	it('stops and names the folder when it holds no SKILL.md', async () => {
		const code = await check('/nonexistent/skill')
		expect(code).toBe(1)
		expect(printed()).toBe('')
		expect(stderr.mock.calls.join('')).toContain('skill-missing: no SKILL.md in /nonexistent/skill')
	})
})
