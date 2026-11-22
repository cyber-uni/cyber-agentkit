import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { addCase, addTriggerCase, removeCase } from './eval-case.js'
import { clearKnownFailure, listKnownFailures, markKnownFailure } from './known-failures.js'
import { scopedSkill } from './skill-design.fixtures.js'

const text = (folder: string, path: string) => readFileSync(join(folder, path), 'utf8')
const criteria = ['C1', 'C2', 'C3']

describe('skill fails across scopes (K11)', () => {
	it('marks, lists, and clears a case in the eval folder that lists it', () => {
		const { folder } = scopedSkill({
			'evals/write/evals.yaml':
				'# the write cases\noutcome:\n  - { id: write-two, prompt: write the notes, criteria: [C1, C2], files: files/write-two }\n',
		})
		const rootBefore = text(folder, 'evals/evals.yaml')
		const marked = markKnownFailure(folder, { case: 'write-two', criterion: 'C2' }, 'keeps merge commits', criteria)
		expect(marked).toMatchObject({ evals: join(folder, 'evals', 'write', 'evals.yaml') })
		expect(text(folder, 'evals/evals.yaml')).toBe(rootBefore)
		expect(text(folder, 'evals/write/evals.yaml')).toContain('# the write cases')
		expect(parse(text(folder, 'evals/write/evals.yaml')).outcome[0].fails).toEqual({ C2: 'keeps merge commits' })
		expect(markKnownFailure(folder, { case: 'skip-commit' }, 'misfires', criteria)).toMatchObject({
			evals: join(folder, 'evals', 'evals.yaml'),
		})
		expect(listKnownFailures(folder)).toMatchObject({
			files: ['evals/evals.yaml', 'evals/audit/evals.yaml', 'evals/write/evals.yaml'],
			marks: [
				{ case: 'skip-commit', reason: 'misfires', file: 'evals/evals.yaml' },
				{ case: 'write-two', criterion: 'C2', reason: 'keeps merge commits', file: 'evals/write/evals.yaml' },
			],
		})
		expect(clearKnownFailure(folder, { case: 'write-two', criterion: 'C2' })).toMatchObject({
			evals: join(folder, 'evals', 'write', 'evals.yaml'),
		})
		expect(text(folder, 'evals/write/evals.yaml')).not.toContain('fails')
	})

	it('lists the IDs of the whole skill for an unknown case', () => {
		const { folder } = scopedSkill()
		expect(markKnownFailure(folder, { case: 'nope', criterion: 'C1' }, 'why', criteria)).toMatchObject({
			code: 'unknown-case',
			problem:
				'the skill has no case nope; its cases are fire-write, fire-audit, skip-commit, overview, audit-one, write-two',
		})
	})
})

describe('skill case in a scope (K11)', () => {
	it('adds an outcome case to the eval folder of an instructions file, with paths relative to it', () => {
		const { folder } = scopedSkill()
		const rootBefore = text(folder, 'evals/evals.yaml')
		const added = addCase(folder, 'write-three', { prompt: 'write more', scope: 'write', setup: true, files: true })
		expect(added).toMatchObject({
			case: 'write-three',
			evals: join(folder, 'evals', 'write', 'evals.yaml'),
			paths: [join('evals', 'write', 'files', 'write-three'), join('evals', 'write', 'setup', 'write-three.sh')],
		})
		expect(text(folder, 'evals/evals.yaml')).toBe(rootBefore)
		expect(parse(text(folder, 'evals/write/evals.yaml')).outcome[1]).toEqual({
			id: 'write-three',
			prompt: 'write more',
			files: 'files/write-three',
			setup: 'setup/write-three.sh',
		})
		expect(existsSync(join(folder, 'evals', 'write', 'setup', 'write-three.sh'))).toBe(true)
	})

	it('makes the eval file of a scope with no cases yet, holding only an outcome list', () => {
		const { folder } = scopedSkill({ 'references/fresh.md': '# Fresh\n' })
		expect(addCase(folder, 'fresh-one', { prompt: 'go', scope: 'fresh' })).toMatchObject({ case: 'fresh-one' })
		expect(parse(text(folder, 'evals/fresh/evals.yaml'))).toEqual({
			outcome: [{ id: 'fresh-one', prompt: 'go', files: 'files/fresh-one' }],
		})
		expect(existsSync(join(folder, 'evals', 'fresh', 'files', 'fresh-one'))).toBe(true)
	})

	it('puts the case in the root file for --scope root', () => {
		const { folder } = scopedSkill()
		expect(addCase(folder, 'root-two', { prompt: 'go', scope: 'root' })).toMatchObject({
			evals: join(folder, 'evals', 'evals.yaml'),
		})
		expect(parse(text(folder, 'evals/evals.yaml')).outcome[1].id).toBe('root-two')
	})

	it('refuses a scope with no instructions file, and trigger, writing nothing', () => {
		const { folder } = scopedSkill()
		expect(addCase(folder, 'x', { prompt: 'go', scope: 'nope' })).toMatchObject({ code: 'unknown-scope' })
		expect(addCase(folder, 'x', { prompt: 'go', scope: '../evals' })).toMatchObject({ code: 'unknown-scope' })
		expect(addCase(folder, 'x', { prompt: 'go', scope: 'trigger' })).toMatchObject({ code: 'unknown-scope' })
		expect(existsSync(join(folder, 'evals', 'nope'))).toBe(false)
	})

	it('refuses an ID another scope already holds, or a trigger case holds', () => {
		const { folder } = scopedSkill()
		expect(addCase(folder, 'audit-one', { prompt: 'go', scope: 'write' })).toEqual({
			code: 'case-exists',
			problem: 'evals/audit/evals.yaml already has a case audit-one',
		})
		expect(addTriggerCase(folder, 'write-two', { prompt: 'p', expect: 'fire' })).toMatchObject({ code: 'case-exists' })
	})

	it('starts from a case of another scope, naming its files from the new folder', () => {
		const { folder } = scopedSkill({
			'evals/write/evals.yaml':
				'outcome:\n  - { id: write-two, prompt: write the notes, files: files/write-two, setup: setup/write-two.sh }\n',
			'evals/write/setup/write-two.sh': '#!/bin/sh\necho hi\n',
		})
		const added = addCase(folder, 'audit-two', { prompt: 'audit', scope: 'audit', from: 'write-two' })
		expect(added).toMatchObject({ case: 'audit-two' })
		expect(parse(text(folder, 'evals/audit/evals.yaml')).outcome[1]).toEqual({
			id: 'audit-two',
			prompt: 'audit',
			files: '../write/files/write-two',
			setup: 'setup/audit-two.sh',
		})
		expect(text(folder, 'evals/audit/setup/audit-two.sh')).toBe('#!/bin/sh\necho hi\n')
	})

	it('removes a case from the eval folder that lists it, with its files', () => {
		const { folder } = scopedSkill()
		const removed = removeCase(folder, 'write-two')
		expect(removed).toMatchObject({
			evals: join(folder, 'evals', 'write', 'evals.yaml'),
			paths: [join('evals', 'write', 'files', 'write-two')],
		})
		expect(existsSync(join(folder, 'evals', 'write', 'files', 'write-two'))).toBe(false)
		expect(parse(text(folder, 'evals/write/evals.yaml')).outcome).toEqual([])
		expect(text(folder, 'evals/evals.yaml')).toContain('overview')
	})

	it('keeps a files folder another scope still names, and lists the whole skill for an unknown case', () => {
		const { folder } = scopedSkill({
			'evals/audit/evals.yaml': 'outcome:\n  - { id: audit-one, prompt: a, files: ../write/files/write-two }\n',
		})
		expect(removeCase(folder, 'write-two')).toMatchObject({ paths: [] })
		expect(existsSync(join(folder, 'evals', 'write', 'files', 'write-two'))).toBe(true)
		expect(removeCase(folder, 'nope')).toMatchObject({
			code: 'unknown-case',
			problem: 'the skill has no outcome case nope; its cases are overview, audit-one',
		})
	})
})
