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
const check = (folder: string) => run(['node', 'cyber-agentkit', 'skill', 'check', folder, '--format', 'json'])

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

	it('stops and names the folder when it holds no SKILL.md', async () => {
		const code = await check('/nonexistent/skill')
		expect(code).toBe(1)
		expect(printed()).toBe('')
		expect(stderr.mock.calls.join('')).toContain('skill-missing: no SKILL.md in /nonexistent/skill')
	})
})
