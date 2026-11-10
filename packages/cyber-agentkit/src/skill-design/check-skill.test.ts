import { describe, expect, it } from 'vitest'
import { mergeChecks } from './check-skill.js'
import { readScriptOutput } from './run-check-script.js'
import type { AspectCheck } from './skill-check-types.js'

const checks: AspectCheck[] = [
	{ id: 'X-1', how: 'script', statement: 'a' },
	{ id: 'X-2', how: 'script', statement: 'b' },
	{ id: 'X-3', how: 'read', statement: 'c' },
	{ id: 'X-4', how: 'run', statement: 'd' },
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
			{ id: 'X-1', status: 'pass' },
			{ id: 'X-2', status: 'not-checked', message: 'its check script did not decide it', needs: 'check' },
			{ id: 'X-3', status: 'not-checked', message: 'an agent decides it by reading the skill', needs: 'check' },
			{ id: 'X-4', status: 'not-checked', message: 'only running the skill decides it', needs: 'test' },
		])
		expect(report).toMatchObject({ status: 'not-checked', passed: 1, failed: 0, notChecked: 3 })
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
		expect(report.aspects[0]?.checks.at(-1)).toEqual({ id: 'SCRIPT', status: 'fail', message: 'it crashed' })
		expect(report.status).toBe('fail')
	})
})

describe('readScriptOutput', () => {
	it('reads the checks list', () => {
		expect(readScriptOutput('{"checks":[{"id":"X-1","status":"fail","message":"m","file":"f"}]}')).toEqual([
			{ id: 'X-1', status: 'fail', message: 'm', file: 'f' },
		])
	})

	it('names what is wrong with output it cannot read', () => {
		expect(readScriptOutput('nope')).toBe('its output is not JSON')
		expect(readScriptOutput('{}')).toBe('its output has no `checks` list')
		expect(readScriptOutput('{"checks":[{"id":"X","status":"great"}]}')).toBe(
			'a check in its output has no `id` or `status`',
		)
	})
})
