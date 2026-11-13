import { describe, expect, it } from 'vitest'
import { failsPolicy, mergeChecks, type SkillCheckReport } from './check-skill.js'
import { readScriptOutput } from './run-check-script.js'
import type { AspectCheck } from './skill-check-types.js'

const checks: AspectCheck[] = [
	{ id: 'X-1', how: 'script', severity: 'critical', statement: 'a' },
	{ id: 'X-2', how: 'script', severity: 'warning', statement: 'b' },
	{ id: 'X-3', how: 'read', severity: 'warning', statement: 'c' },
	{ id: 'X-4', how: 'run', severity: 'critical', statement: 'd' },
]

describe('mergeChecks', () => {
	it('takes reported script outcomes and leaves read and run checks not checked, naming what decides them', () => {
		const report = mergeChecks('s', [
			{
				aspect: 'x',
				implementation: 'p',
				checks,
				reported: [
					{ id: 'X-1', status: 'pass' },
					{ id: 'X-9', status: 'fail' },
				],
			},
		])
		expect(report.aspects[0]?.checks).toEqual([
			{ id: 'X-1', status: 'pass', severity: 'critical' },
			{
				id: 'X-2',
				status: 'not-checked',
				severity: 'warning',
				message: 'its check script did not decide it',
				needs: 'check',
			},
			{
				id: 'X-3',
				status: 'not-checked',
				severity: 'warning',
				message: 'an agent decides it by reading the skill',
				needs: 'check',
			},
			{
				id: 'X-4',
				status: 'not-checked',
				severity: 'critical',
				message: 'only running the skill decides it',
				needs: 'test',
			},
		])
		expect(report).toMatchObject({ status: 'not-checked', passed: 1, failed: 0, critical: 0, notChecked: 3 })
	})

	it('reports a check that does not apply as skipped, and passes an aspect of passes and skips', () => {
		const report = mergeChecks('s', [
			{
				aspect: 'x',
				implementation: 'p',
				checks: [checks[0] as AspectCheck, checks[2] as AspectCheck],
				reported: [{ id: 'X-1', status: 'pass' }],
				skipped: { 'X-3': 'it does not apply' },
			},
		])
		expect(report.aspects[0]?.checks[1]).toEqual({
			id: 'X-3',
			status: 'skipped',
			severity: 'warning',
			message: 'it does not apply',
		})
		expect(report).toMatchObject({ status: 'pass', passed: 1, skipped: 1, notChecked: 0 })
	})

	it('never passes a script check when nothing ran', () => {
		const report = mergeChecks('s', [{ aspect: 'x', implementation: 'p', checks, reported: undefined }])
		expect(report.aspects[0]?.checks[0]).toMatchObject({ status: 'not-checked', message: 'it has no check script' })
		expect(report.passed).toBe(0)
	})

	it('fails an aspect whose check script broke, so CI does not pass on it', () => {
		const report = mergeChecks('s', [
			{ aspect: 'x', implementation: 'p', checks, reported: undefined, problem: 'it crashed', broken: true },
		])
		expect(report.aspects[0]?.checks.at(-1)).toEqual({
			id: 'SCRIPT',
			status: 'fail',
			severity: 'critical',
			message: 'it crashed',
		})
		expect(report.status).toBe('fail')
		expect(failsPolicy(report, 'critical')).toBe(true)
	})

	it('gives each outcome the severity its check declares, and counts the critical failures', () => {
		const report = mergeChecks('s', [
			{
				aspect: 'x',
				implementation: 'p',
				checks,
				reported: [
					{ id: 'X-1', status: 'pass', severity: 'warning' },
					{ id: 'X-2', status: 'fail', message: 'm' },
				],
			},
		])
		expect(report.aspects[0]?.checks.slice(0, 2)).toEqual([
			{ id: 'X-1', status: 'pass', severity: 'critical' },
			{ id: 'X-2', status: 'fail', severity: 'warning', message: 'm' },
		])
		expect(report).toMatchObject({ status: 'fail', failed: 1, critical: 0 })
	})
})

describe('failsPolicy', () => {
	const report = (failed: number, critical: number): SkillCheckReport => ({
		skill: 's',
		status: 'fail',
		passed: 0,
		failed,
		critical,
		notChecked: 0,
		skipped: 0,
		aspects: [],
	})

	it('fails on any failure under `any`', () => {
		expect(failsPolicy(report(1, 0), 'any')).toBe(true)
		expect(failsPolicy(report(0, 0), 'any')).toBe(false)
	})

	it('fails only on a critical failure under `critical`', () => {
		expect(failsPolicy(report(2, 0), 'critical')).toBe(false)
		expect(failsPolicy(report(2, 1), 'critical')).toBe(true)
	})
})

describe('readScriptOutput', () => {
	it('reads the checks list', () => {
		expect(readScriptOutput('{"checks":[{"id":"X-1","status":"fail","message":"m","file":"f"}]}')).toEqual([
			{ id: 'X-1', status: 'fail', message: 'm', file: 'f' },
		])
		expect(readScriptOutput('{"checks":[{"id":"X-1","status":"skipped"}]}')).toEqual([{ id: 'X-1', status: 'skipped' }])
	})

	it('names what is wrong with output it cannot read', () => {
		expect(readScriptOutput('nope')).toBe('its output is not JSON')
		expect(readScriptOutput('{}')).toBe('its output has no `checks` list')
		expect(readScriptOutput('{"checks":[{"id":"X","status":"great"}]}')).toBe(
			'a check in its output has no `id` or `status`',
		)
	})
})
