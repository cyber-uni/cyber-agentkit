import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
	type MigrationPlan,
	type MigrationWrite,
	migrationReason,
	planMigration,
	promptId,
	scopeNamed,
	writeMigration,
} from './eval-migration.js'
import { readEvalSuite, suiteCases } from './eval-suite.js'
import { type ExpectedFile, readEvalSet } from './expected-result.js'
import { inputHashes } from './input-hashes.js'
import { makeSkill, scopedSkillFiles } from './skill-design.fixtures.js'
import { readSkill, type SkillFiles } from './skill-files.js'
import { readExpectedFile } from './skill-test.js'
import { selectStale } from './stale-cases.js'
import type { InputHashes, TestResult } from './test-result.js'

const criteria = ['C1', 'C2', 'C3']
const recordedAt = '2026-11-01T00:00:00.000Z'

/** The scoped fixture's skill, with every case in one list in `evals/evals.yaml`. */
const singleList = (evals?: string) =>
	makeSkill({
		'SKILL.md': scopedSkillFiles['SKILL.md'] as string,
		'references/write.md': scopedSkillFiles['references/write.md'] as string,
		'references/style.md': scopedSkillFiles['references/style.md'] as string,
		'references/audit.md': scopedSkillFiles['references/audit.md'] as string,
		'evals/evals.yaml':
			evals ??
			`runs: 3
trigger:
  - { prompt: write release notes, expect: fire }
  - { prompt: "audit the release notes", expect: fire, fails: misses one in three }
  - prompt: write a commit message
    expect: skip
outcome:
  - id: overview
    prompt: what can you do
    criteria: [C1]
  # Two pull requests, one a merge.
  - id: write-two
    prompt: write the notes
    criteria: [C1, C2]
    files: files/write-two
  - id: audit-one
    prompt: audit the notes
    criteria: [C3]
    files: files/shared
  - id: audit-two
    prompt: audit these notes too
    criteria: [C3]
    files: files/shared
  - id: write-shared
    prompt: write from the shared notes
    criteria: [C1]
    files: files/shared
rubrics:
  C1:
    - contains: "## Release notes"
  C2:
    - not-regex: "Merge (pull request|branch)"
  C3:
    - contains: "line"
`,
		'evals/files/write-two/prs.json': '[]',
		'evals/files/shared/notes.md': '# notes\n',
	})

/** A version 1 expected result, one saved run, deciding the cases it lists. */
function legacy(skill: SkillFiles, cases: { case: string; prompt?: string; expect?: 'fire' | 'skip' }[]) {
	const result: TestResult = {
		version: 1,
		skill: 'release-notes',
		at: recordedAt,
		verification: 'v',
		runs: 3,
		threshold: 2,
		baseline: 'without the skill',
		trigger: cases.flatMap((c) =>
			c.prompt
				? [{ case: c.case, prompt: c.prompt, expect: c.expect ?? 'fire', fired: 3, ran: 3, status: 'pass' as const }]
				: [],
		),
		criteria: criteria.map((id) => ({ id, status: 'pass' as const, passed: 3, ran: 3 })),
		cases: cases.map((c) => ({ case: c.case, status: 'pass' as const, passed: 3, ran: 3 })),
		knownFailures: [{ case: 'trigger-2', reason: 'misses one in three', status: 'known-failure', passed: 2, ran: 3 }],
		notRun: [],
	}
	writeFileSync(join(skill.folder, 'evals', 'expected.json'), `${JSON.stringify(result, null, '\t')}\n`)
}

const hashes = (skill: SkillFiles): InputHashes =>
	inputHashes(readSkill(skill.folder) as SkillFiles, criteria) as InputHashes
const plan = (skill: SkillFiles, ids?: Record<string, string>) => {
	const made = planMigration(skill, criteria, { ids, before: hashes(skill) })
	if ('problem' in made) throw new Error(made.problem)
	return made
}
const write = (skill: SkillFiles, made: MigrationPlan): MigrationWrite => {
	const done = writeMigration(skill, criteria, made, () => hashes(skill), '2026-11-22T00:00:00.000Z', hashes(skill))
	if ('problem' in done) throw new Error(done.problem)
	return done
}
const text = (skill: SkillFiles, path: string) => readFileSync(join(skill.folder, path), 'utf8')
const json = (skill: SkillFiles, path: string) => JSON.parse(text(skill, path)) as ExpectedFile

describe('the IDs a migration makes', () => {
	it('makes a trigger ID from the first words of its prompt', () => {
		expect(promptId('Write release notes for v2!')).toBe('write-release-notes-for-v2')
		expect(promptId("My skill doesn't trigger when I ask for a changelog.")).toBe('my-skill-doesnt-trigger-when')
		expect(promptId('???')).toBe('trigger-case')
	})

	it('names the instructions file an outcome ID starts with, the longest first', () => {
		expect(scopeNamed('write-two', ['audit', 'write'])).toBe('write')
		expect(scopeNamed('audit', ['audit', 'write'])).toBe('audit')
		expect(scopeNamed('rewrite-one', ['audit', 'write'])).toBeUndefined()
		expect(scopeNamed('fix-too-long', ['fix', 'fix-too'])).toBe('fix-too')
	})
})

describe('migrate: the plan (R184)', () => {
	it('gives each trigger case an ID from its prompt, moves each outcome case to the folder its ID names, and writes nothing', () => {
		const skill = singleList()
		legacy(skill, [{ case: 'trigger-1', prompt: 'write release notes' }])
		const before = text(skill, 'evals/evals.yaml')
		const made = plan(skill)
		expect(made.triggerIds.map((item) => [item.from, item.id])).toEqual([
			['trigger-1', 'write-release-notes'],
			['trigger-2', 'audit-the-release-notes'],
			['trigger-3', 'write-a-commit-message'],
		])
		expect(made.moves.map((move) => [move.case, move.scope])).toEqual([
			['write-two', 'write'],
			['audit-one', 'audit'],
			['audit-two', 'audit'],
			['write-shared', 'write'],
		])
		expect(made.stay).toEqual(['overview'])
		expect(made.nothing).toBe(false)
		expect(text(skill, 'evals/evals.yaml')).toBe(before)
		expect(existsSync(join(skill.folder, 'evals', 'write'))).toBe(false)
	})

	it("moves a files folder only its folder's cases name, and points a shared one at its place", () => {
		const made = plan(singleList())
		expect(made.paths.map((p) => [p.case, p.to, p.moved])).toEqual([
			['write-two', 'files/write-two', true],
			['audit-one', '../files/shared', false],
			['audit-two', '../files/shared', false],
			['write-shared', '../files/shared', false],
		])
	})

	it("takes the author's ID for a trigger case, and refuses one that is taken, positional, or names no case", () => {
		const skill = singleList()
		expect(plan(skill, { 'trigger-1': 'fire-write' }).triggerIds[0]).toMatchObject({ id: 'fire-write', named: true })
		const refused: Record<string, string>[] = [
			{ 'trigger-1': 'overview' },
			{ 'trigger-1': 'trigger-9' },
			{ 'trigger-7': 'seven' },
		]
		for (const ids of refused) {
			const made = planMigration(skill, criteria, { ids })
			expect(made).toMatchObject({ code: 'bad-case-id' })
		}
	})

	it('splits the expected result per scope: entries matched by prompt or ID are carried, the rest have none', () => {
		const skill = singleList()
		legacy(skill, [
			{ case: 'trigger-1', prompt: 'write release notes' },
			{ case: 'trigger-2', prompt: 'audit the release notes' },
			// Reworded since the result was saved, so it no longer matches.
			{ case: 'trigger-3', prompt: 'write a commit', expect: 'skip' },
			{ case: 'overview' },
			{ case: 'write-two' },
			{ case: 'audit-one' },
			{ case: 'gone' },
		])
		const expected = plan(skill).expected
		expect(expected?.from).toBe(recordedAt)
		expect(expected?.scopes.map((s) => [s.scope, s.file, s.carried, s.noEntry])).toEqual([
			[
				'trigger',
				'evals/expected.json',
				['write-release-notes', 'audit-the-release-notes'],
				['write-a-commit-message'],
			],
			['root', 'evals/expected.json', ['overview'], []],
			['write', 'evals/write/expected.json', ['write-two'], ['write-shared']],
			['audit', 'evals/audit/expected.json', ['audit-one'], ['audit-two']],
		])
		expect(expected?.dropped).toEqual(['trigger-3', 'gone'])
	})
})

describe('migrate --write (R184)', () => {
	it("writes each scope's cases to its eval folder, keeping the author's text, and moves the files only it names", () => {
		const skill = singleList()
		const done = write(skill, plan(skill))
		expect(done.rewritten).toEqual([])
		expect(text(skill, 'evals/evals.yaml')).toBe(`runs: 3
trigger:
  - { id: write-release-notes, prompt: write release notes, expect: fire }
  - { id: audit-the-release-notes, prompt: "audit the release notes", expect: fire, fails: misses one in three }
  - id: write-a-commit-message
    prompt: write a commit message
    expect: skip
outcome:
  - id: overview
    prompt: what can you do
    criteria: [C1]
rubrics:
  C1:
    - contains: "## Release notes"
  C2:
    - not-regex: "Merge (pull request|branch)"
  C3:
    - contains: "line"
`)
		expect(text(skill, 'evals/write/evals.yaml')).toBe(`outcome:
  # Two pull requests, one a merge.
  - id: write-two
    prompt: write the notes
    criteria: [C1, C2]
    files: files/write-two
  - id: write-shared
    prompt: write from the shared notes
    criteria: [C1]
    files: ../files/shared
`)
		expect(existsSync(join(skill.folder, 'evals', 'write', 'files', 'write-two', 'prs.json'))).toBe(true)
		expect(existsSync(join(skill.folder, 'evals', 'files', 'write-two'))).toBe(false)
		expect(existsSync(join(skill.folder, 'evals', 'files', 'shared', 'notes.md'))).toBe(true)
		const suite = readEvalSuite(skill.folder, criteria)
		if ('problem' in suite) throw new Error(suite.problem)
		expect(suiteCases(suite, join(skill.folder, 'evals')).map((item) => `${item.scope}:${item.id}`)).toEqual([
			'trigger:write-release-notes',
			'trigger:audit-the-release-notes',
			'trigger:write-a-commit-message',
			'root:overview',
			'audit:audit-one',
			'audit:audit-two',
			'write:write-two',
			'write:write-shared',
		])
	})

	it('carries each matched entry, marked carried by migration with its date, so only the cases with none are stale', () => {
		const skill = singleList()
		legacy(skill, [
			{ case: 'trigger-1', prompt: 'write release notes' },
			{ case: 'trigger-2', prompt: 'audit the release notes' },
			{ case: 'overview' },
			{ case: 'write-two' },
			{ case: 'audit-one' },
		])
		const done = write(skill, plan(skill))
		expect(done.kept).toBe('evals/accepted/2026-11-01T00-00-00.000Z.json')
		expect(done.expected).toEqual(['evals/expected.json', 'evals/audit/expected.json', 'evals/write/expected.json'])
		const root = json(skill, 'evals/expected.json')
		expect(Object.keys(root.entries)).toEqual(['write-release-notes', 'audit-the-release-notes', 'overview'])
		expect(root.entries['write-release-notes']).toMatchObject({
			scope: 'trigger',
			at: recordedAt,
			carried: { reason: migrationReason, at: '2026-11-22T00:00:00.000Z' },
		})
		// The known-failure mark moves with its case, under its new ID.
		expect(root.entries['audit-the-release-notes']?.knownFailures).toEqual([
			{ case: 'audit-the-release-notes', reason: 'misses one in three', status: 'known-failure', passed: 2, ran: 3 },
		])
		expect(Object.keys(json(skill, 'evals/write/expected.json').entries)).toEqual(['write-two'])
		expect(Object.keys(json(skill, 'evals/audit/expected.json').entries)).toEqual(['audit-one'])
		const now = readSkill(skill.folder) as SkillFiles
		const evalSet = readEvalSet(now.folder, criteria)
		const selection = selectStale(
			evalSet as NonNullable<typeof evalSet>,
			hashes(now),
			readExpectedFile(now.folder, evalSet),
		)
		expect(selection.stale).toEqual(['write-a-commit-message', 'audit-two', 'write-shared'])
		expect(plan(now).nothing).toBe(true)
	})

	it('leaves an entry that was already behind its inputs stale, carrying nothing', () => {
		const skill = singleList()
		const inputs = hashes(skill)
		const entry = (scope: string, caseHash: string) => ({
			scope,
			status: 'pass' as const,
			at: recordedAt,
			hashes: { case: caseHash, scope: inputs.scopes[scope] as string },
		})
		const file: ExpectedFile = {
			version: 2,
			skill: 'release-notes',
			at: recordedAt,
			verification: 'v',
			runs: 3,
			threshold: 2,
			baseline: 'without the skill',
			criteria,
			entries: {
				overview: entry('root', inputs.cases['overview'] as string),
				'write-two': entry('root', 'sha256:an-older-definition'),
			},
		}
		writeFileSync(join(skill.folder, 'evals', 'expected.json'), JSON.stringify(file))
		const made = plan(skill)
		expect(made.expected?.scopes.find((s) => s.scope === 'write')?.behind).toEqual(['write-two'])
		write(skill, made)
		expect(json(skill, 'evals/expected.json').entries['overview']?.carried?.reason).toBe(migrationReason)
		expect(json(skill, 'evals/write/expected.json').entries['write-two']?.carried).toBeUndefined()
	})

	it('has nothing to migrate for a skill already in scopes', () => {
		const skill = makeSkill(scopedSkillFiles)
		expect(plan(skill)).toMatchObject({ triggerIds: [], moves: [], nothing: true })
	})
})
