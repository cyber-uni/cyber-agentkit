import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { recordAttestation } from './attestation.js'
import { type ExpectedEntry, type ExpectedFile, readEvalSet } from './expected-result.js'
import { goodSkill, scopedSkill } from './skill-design.fixtures.js'
import {
	acceptedHistory,
	acceptResult,
	readExpected,
	readExpectedFile,
	scopeExpectedPath,
	writeExpectedFile,
} from './skill-test.js'
import type { CaseStatus, TestResult } from './test-result.js'

const criteria = ['C1', 'C2', 'C3']
const entry = (scope: string, at = '2026-11-01T00:00:00.000Z'): ExpectedEntry => ({ scope, status: 'pass', at })
const file = (entries: Record<string, ExpectedEntry>, at = '2026-11-01T00:00:00.000Z'): ExpectedFile => ({
	version: 2,
	skill: 'release-notes',
	at,
	verification: 'v',
	runs: 3,
	threshold: 2,
	baseline: 'without the skill',
	criteria,
	entries,
})
const every = (at?: string) => ({
	'fire-write': entry('trigger', at),
	overview: entry('root', at),
	'audit-one': entry('audit', at),
	'write-two': entry('write', at),
})
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const run = (at: string, cases: CaseStatus[]): TestResult => ({
	version: 1,
	skill: 'release-notes',
	at,
	verification: 'v',
	runs: 3,
	threshold: 2,
	baseline: 'without the skill',
	trigger: [],
	criteria: criteria.map((id) => ({ id, status: 'pass' as const })),
	cases,
	notRun: [],
	inputs: {
		scopes: { trigger: 't', root: 'r', audit: 'a', write: 'w' },
		cases: { 'fire-write': 'f', overview: 'o', 'audit-one': 'ao', 'write-two': 'wt' },
		scopeOf: { 'fire-write': 'trigger', overview: 'root', 'audit-one': 'audit', 'write-two': 'write' },
	},
})

describe('the expected result per scope (R181)', () => {
	it("writes each eval folder's entries to its own file, and the trigger and root entries with the attested passes at the root", () => {
		const skill = scopedSkill()
		recordAttestation(skill.folder, 'release-notes', {
			id: 'C2',
			status: 'pass',
			source: 'attested',
			evidence: 'https://example.com/pr/1',
			at: '2026-11-02T00:00:00.000Z',
			skillFingerprint: 'x',
		})
		const paths = writeExpectedFile(skill.folder, file(every()))
		expect(paths.map((path) => path.slice(skill.folder.length + 1))).toEqual([
			'evals/expected.json',
			'evals/audit/expected.json',
			'evals/write/expected.json',
		])
		expect(Object.keys(json(scopeExpectedPath(skill.folder, 'root')).entries)).toEqual(['fire-write', 'overview'])
		expect(json(scopeExpectedPath(skill.folder, 'root')).attested).toHaveLength(1)
		expect(Object.keys(json(scopeExpectedPath(skill.folder, 'audit')).entries)).toEqual(['audit-one'])
		expect(json(scopeExpectedPath(skill.folder, 'audit')).attested).toBeUndefined()
		const evalSet = readEvalSet(skill.folder, criteria)
		expect(Object.keys(readExpectedFile(skill.folder, evalSet)?.entries ?? {})).toEqual([
			'fire-write',
			'overview',
			'audit-one',
			'write-two',
		])
		expect(readExpected(skill.folder)?.cases.map((item) => item.case)).toEqual([
			'fire-write',
			'overview',
			'audit-one',
			'write-two',
		])
	})

	it('reads the single-file form, and splits it on the next write', () => {
		const skill = scopedSkill()
		writeFileSync(join(skill.folder, 'evals', 'expected.json'), JSON.stringify(file(every())))
		const evalSet = readEvalSet(skill.folder, criteria)
		const read = readExpectedFile(skill.folder, evalSet) as ExpectedFile
		expect(Object.keys(read.entries)).toEqual(['fire-write', 'overview', 'audit-one', 'write-two'])
		writeExpectedFile(skill.folder, read)
		expect(Object.keys(json(scopeExpectedPath(skill.folder, 'root')).entries)).toEqual(['fire-write', 'overview'])
		expect(Object.keys(json(scopeExpectedPath(skill.folder, 'write')).entries)).toEqual(['write-two'])
	})

	it('keeps a skill with no eval folder in evals/expected.json alone', () => {
		const skill = goodSkill()
		const paths = writeExpectedFile(skill.folder, file({ 'one-pr': entry('root') }))
		expect(paths).toEqual([join(skill.folder, 'evals', 'expected.json')])
		expect(readdirSync(join(skill.folder, 'evals')).filter((name) => name.endsWith('.json'))).toEqual(['expected.json'])
	})

	it('removes the file of an eval folder left with no entry', () => {
		const skill = scopedSkill()
		writeExpectedFile(skill.folder, file(every()))
		const { 'audit-one': _audit, ...rest } = every()
		writeExpectedFile(skill.folder, file(rest))
		expect(existsSync(scopeExpectedPath(skill.folder, 'audit'))).toBe(false)
		expect(existsSync(scopeExpectedPath(skill.folder, 'write'))).toBe(true)
	})

	it("moves only the replaced scope's file to its own accepted folder, and reads every scope's history", () => {
		const skill = scopedSkill()
		writeExpectedFile(skill.folder, file(every()))
		const evalSet = readEvalSet(skill.folder, criteria)
		const accepted = acceptResult(
			run('2026-11-20T00:00:00.000Z', [{ case: 'audit-one', status: 'fail', passed: 0, ran: 3 }]),
			skill.folder,
			['audit-one'],
			evalSet,
		)
		expect(accepted.written).toEqual(['audit-one'])
		expect(readdirSync(join(skill.folder, 'evals', 'audit', 'accepted'))).toEqual(['2026-11-01T00-00-00.000Z.json'])
		expect(existsSync(join(skill.folder, 'evals', 'accepted'))).toBe(false)
		expect(existsSync(join(skill.folder, 'evals', 'write', 'accepted'))).toBe(false)
		expect(json(scopeExpectedPath(skill.folder, 'audit')).entries['audit-one'].status).toBe('fail')
		expect(json(scopeExpectedPath(skill.folder, 'write')).entries['write-two'].status).toBe('pass')
		const history = acceptedHistory(skill.folder)
		expect(history).toHaveLength(2)
		expect(history[0]?.cases.map((item) => item.case)).toEqual(['audit-one'])
		expect(history[1]?.cases.map((item) => item.case)).toEqual(['fire-write', 'overview', 'audit-one', 'write-two'])
	})
})
