import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mergedEvals, readEvalSuite, suiteCases } from './eval-suite.js'
import { type ExpectedFile, readEvalSet } from './expected-result.js'
import { builtScriptsHash, inputHashes, splitBody } from './input-hashes.js'
import { scopedSkill, scopedSkillFiles } from './skill-design.fixtures.js'
import { readSkill, type SkillFiles } from './skill-files.js'
import { changedInputs, selectStale } from './stale-cases.js'
import { planTest } from './test-plan.js'
import type { InputHashes } from './test-result.js'

const criteria = ['C1', 'C2', 'C3']
const write = (skill: { folder: string }, path: string, text: string) => {
	mkdirSync(dirname(join(skill.folder, path)), { recursive: true })
	writeFileSync(join(skill.folder, path), text)
}
const edit = (skill: { folder: string }, path: string, change: (text: string) => string) =>
	write(skill, path, change(readFileSync(join(skill.folder, path), 'utf8')))
const hashes = (skill: { folder: string }, options: Parameters<typeof inputHashes>[2] = {}): InputHashes =>
	inputHashes(readSkill(skill.folder) as SkillFiles, criteria, options) as InputHashes
/** The scopes whose hash differs between two readings. */
const changedScopes = (before: InputHashes, after: InputHashes) =>
	Object.keys(after.scopes).filter((scope) => before.scopes[scope] !== after.scopes[scope])

/** An expected result whose every case has an entry recorded against `inputs`. */
function recorded(inputs: InputHashes): ExpectedFile {
	return {
		version: 2,
		skill: 'release-notes',
		at: '2026-11-01T00:00:00.000Z',
		verification: 'v',
		runs: 3,
		threshold: 2,
		baseline: 'without the skill',
		criteria,
		entries: Object.fromEntries(
			Object.keys(inputs.cases).map((id) => {
				const scope = inputs.scopeOf?.[id] as string
				return [
					id,
					{
						scope,
						status: 'pass' as const,
						at: '2026-11-01T00:00:00.000Z',
						hashes: { case: inputs.cases[id] as string, scope: inputs.scopes[scope] as string },
					},
				]
			}),
		),
		inputs: Object.fromEntries(
			Object.entries(inputs.scopes).map(([scope, hash]) => [hash, inputs.inputs?.[scope] ?? {}]),
		),
		...(inputs.reported ? { reported: inputs.reported } : {}),
	}
}

describe('eval scopes (K11)', () => {
	it('reads each eval folder named for an instructions file as a scope', () => {
		const skill = scopedSkill()
		const suite = readEvalSuite(skill.folder)
		if ('problem' in suite) throw new Error(suite.problem)
		expect(suite.folders.map((folder) => folder.name)).toEqual(['audit', 'write'])
		expect(suiteCases(suite, join(skill.folder, 'evals')).map((item) => [item.id, item.scope])).toEqual([
			['fire-write', 'trigger'],
			['fire-audit', 'trigger'],
			['skip-commit', 'trigger'],
			['overview', 'root'],
			['audit-one', 'audit'],
			['write-two', 'write'],
		])
		expect(readEvalSet(skill.folder, criteria)?.cases.map((item) => item.scope)).toEqual([
			'trigger',
			'trigger',
			'trigger',
			'root',
			'audit',
			'write',
		])
	})

	it("resolves a folder case's files from its own folder, and plans every scope's cases", () => {
		const skill = scopedSkill()
		const suite = readEvalSuite(skill.folder)
		if ('problem' in suite) throw new Error(suite.problem)
		const merged = mergedEvals(suite, join(skill.folder, 'evals'))
		expect(merged.outcome?.find((item) => item.id === 'write-two')?.files).toBe(
			join(skill.folder, 'evals', 'write', 'files', 'write-two'),
		)
		const planned = planTest(readSkill(skill.folder) as SkillFiles, { threads: 16 })
		if ('problem' in planned) throw new Error(planned.problem)
		expect(planned.plan.cases.map((item) => item.id)).toEqual([
			'fire-write',
			'fire-audit',
			'skip-commit',
			'overview',
			'audit-one',
			'write-two',
		])
		expect(planned.plan.cases.find((item) => item.id === 'write-two')?.files).toBe(
			join(skill.folder, 'evals', 'write', 'files', 'write-two'),
		)
	})

	it('refuses an eval folder named for no instructions file, one that holds more than its cases, and a shared ID', () => {
		const orphan = scopedSkill({ 'evals/publish/evals.yaml': 'outcome:\n  - { id: pub, prompt: publish }\n' })
		expect(readEvalSuite(orphan.folder)).toMatchObject({
			code: 'evals-invalid',
			problem: expect.stringContaining('evals/publish/ is named for no instructions file'),
		})
		const settings = scopedSkill({ 'evals/audit/evals.yaml': 'runs: 5\noutcome:\n  - { id: a, prompt: audit }\n' })
		expect(readEvalSuite(settings.folder)).toMatchObject({
			problem: expect.stringContaining('`runs` belongs in evals/evals.yaml'),
		})
		const twice = scopedSkill({ 'evals/audit/evals.yaml': 'outcome:\n  - { id: overview, prompt: audit }\n' })
		expect(readEvalSuite(twice.folder)).toMatchObject({
			problem: expect.stringContaining('case ID overview names more than one case'),
		})
	})
})

describe('scope inputs (R178, R179)', () => {
	it('gives a router row to the scope of the file it links, and every other line to the shared part (O13b)', () => {
		const { shared, rows } = splitBody(scopedSkillFiles['SKILL.md'] as string)
		expect(rows['write']).toEqual(['| `write` | [write.md](references/write.md) |'])
		expect(rows['audit']).toEqual(['| `audit` | [audit.md](references/audit.md) |'])
		expect(shared).toContain('| Command | File |')
		expect(shared).not.toContain('write.md')
	})

	it("lists each scope's inputs: its instructions file, what it reaches in turn, and its eval folder", () => {
		const out = hashes(scopedSkill({ 'evals/write/notes.md': 'shared fixture' }))
		expect(Object.keys(out.inputs?.['write'] ?? {}).sort()).toEqual([
			'SKILL.md front matter',
			'SKILL.md router row for references/write.md',
			'SKILL.md shared sections',
			'evals/evals.yaml settings',
			'evals/write/notes.md',
			'references/style.md',
			'references/write.md',
		])
		expect(Object.keys(out.inputs?.['audit'] ?? {})).not.toContain('references/style.md')
		expect(Object.keys(out.inputs?.['trigger'] ?? {})).toEqual(['description', 'evals/evals.yaml settings'])
		expect(Object.keys(out.inputs?.['root'] ?? {})).toContain('SKILL.md body')
		for (const path of ['references/write.md', 'references/style.md', 'references/audit.md'])
			expect(Object.keys(out.inputs?.['root'] ?? {})).not.toContain(path)
	})

	it('changes only the scopes that reach an edited file, the root reaching none of the instructions files', () => {
		const skill = scopedSkill()
		const before = hashes(skill)
		edit(skill, 'references/style.md', (text) => `${text}Use the active voice.\n`)
		expect(changedScopes(before, hashes(skill))).toEqual(['write'])
		const style = hashes(skill)
		edit(skill, 'references/audit.md', (text) => `${text}2. Name each line.\n`)
		expect(changedScopes(style, hashes(skill))).toEqual(['audit'])
	})

	it("changes every instructions file's scope for a shared section, and one scope for its router row", () => {
		const skill = scopedSkill()
		const before = hashes(skill)
		edit(skill, 'SKILL.md', (text) => text.replace('follow its file.', 'follow its file to the end.'))
		expect(changedScopes(before, hashes(skill))).toEqual(['root', 'audit', 'write'])
		const shared = hashes(skill)
		edit(skill, 'SKILL.md', (text) => text.replace('| `audit` |', '| `audit [notes]` |'))
		expect(changedScopes(shared, hashes(skill))).toEqual(['audit'])
	})

	it('changes the trigger scope for the description, and for the description of another skill a run loads', () => {
		const skill = scopedSkill()
		const before = hashes(skill)
		edit(skill, 'SKILL.md', (text) => text.replace('for a release.', 'for a release or a hotfix.'))
		expect(changedScopes(before, hashes(skill))).toEqual(['trigger'])
		const sibling = join(dirname(skill.folder), 'changelog')
		mkdirSync(sibling, { recursive: true })
		writeFileSync(join(sibling, 'SKILL.md'), '---\nname: changelog\ndescription: Keep a changelog.\n---\n# C\n')
		const one = hashes(skill, { otherSkills: [sibling] })
		expect(one.inputs?.['trigger']).toHaveProperty('description of changelog')
		writeFileSync(join(sibling, 'SKILL.md'), '---\nname: changelog\ndescription: Write release notes.\n---\n# C\n')
		expect(changedScopes(one, hashes(skill, { otherSkills: [sibling] }))).toEqual(['trigger'])
	})

	it('counts a named reference by the content a run resolves for it (R179)', () => {
		const skill = scopedSkill({
			'references/audit.md': '# Audit\n\nLoad `release.levels` with the `reference` skill.\n',
		})
		let content = 'level one'
		const resolve = (name: string) => (name === 'release.levels' ? content : undefined)
		const before = hashes(skill, { resolve })
		expect(before.inputs?.['audit']).toHaveProperty('reference release.levels')
		expect(before.inputs?.['write']).not.toHaveProperty('reference release.levels')
		expect(changedScopes(before, hashes(skill, { resolve }))).toEqual([])
		content = 'level two'
		expect(changedScopes(before, hashes(skill, { resolve }))).toEqual(['audit'])
	})

	describe('a named reference with `##` sections (#416)', () => {
		const sectioned = (strict: string, lenient: string, preamble = 'Levels.') =>
			`${preamble}\n\n## strict\n\n${strict}\n\n## lenient\n\n${lenient}\n\n## unused\n\nnobody names this\n`
		const loading = () =>
			scopedSkill({
				'references/audit.md': '# Audit\n\nLoad `release.levels` with the `reference` skill. Apply the strict level.\n',
				'references/write.md':
					'# Write\n\nLoad `release.levels` with the `reference` skill. Apply the lenient level.\n',
			})
		const resolver = (get: () => string) => ({
			resolve: (name: string) => (name === 'release.levels' ? get() : undefined),
		})

		it('stales only the scopes whose instructions name the edited section', () => {
			const skill = loading()
			let content = sectioned('A', 'B')
			const options = resolver(() => content)
			const before = hashes(skill, options)
			content = sectioned('A2', 'B')
			expect(changedScopes(before, hashes(skill, options))).toEqual(['audit'])
			content = sectioned('A', 'B2')
			expect(changedScopes(before, hashes(skill, options))).toEqual(['write'])
		})

		it('stales every scope that loads it for a change before its first section', () => {
			const skill = loading()
			let content = sectioned('A', 'B')
			const options = resolver(() => content)
			const before = hashes(skill, options)
			content = sectioned('A', 'B', 'Levels, changed.')
			expect(changedScopes(before, hashes(skill, options))).toEqual(['audit', 'write'])
		})

		it('ignores a section no scope names, and stales for a renamed or removed named one', () => {
			const skill = loading()
			let content = sectioned('A', 'B')
			const options = resolver(() => content)
			const before = hashes(skill, options)
			content = content.replace('nobody names this', 'still nobody')
			expect(changedScopes(before, hashes(skill, options))).toEqual([])
			content = content.replace('## strict', '## stern')
			expect(changedScopes(before, hashes(skill, options))).toEqual(['audit'])
		})

		it('stales a scope that names none of its sections on any change, since it cannot tell what it uses', () => {
			const skill = scopedSkill({
				'references/audit.md': '# Audit\n\nLoad `release.levels` with the `reference` skill.\n',
			})
			let content = sectioned('A', 'B')
			const options = resolver(() => content)
			const before = hashes(skill, options)
			content = content.replace('nobody names this', 'still nobody')
			expect(changedScopes(before, hashes(skill, options))).toEqual(['audit'])
		})
	})

	it('reads whitespace and line wrapping as no change, and keeps built scripts out of every scope (R179)', () => {
		const skill = scopedSkill({ 'scripts/run.mjs': 'console.log(1)\n' })
		const before = hashes(skill)
		edit(skill, 'references/write.md', (text) => text.replace('merged pull', 'merged\n   pull'))
		expect(changedScopes(before, hashes(skill))).toEqual([])
		const scripts = builtScriptsHash(readSkill(skill.folder) as SkillFiles)
		write(skill, 'scripts/run.mjs', 'console.log(2)\n')
		edit(skill, 'references/write.md', (text) => `${text}Run \`scripts/run.mjs\`.\n`)
		expect(changedScopes(before, hashes(skill))).toEqual(['write'])
		expect(Object.keys(hashes(skill).inputs?.['write'] ?? {})).not.toContain('scripts/run.mjs')
		expect(builtScriptsHash(readSkill(skill.folder) as SkillFiles)).not.toBe(scripts)
	})

	it("changes a folder case's own hash for its files, and no scope's", () => {
		const skill = scopedSkill()
		const before = hashes(skill)
		write(skill, 'evals/write/files/write-two/more.json', '{}')
		const after = hashes(skill)
		expect(after.cases['write-two']).not.toBe(before.cases['write-two'])
		expect(changedScopes(before, after)).toEqual([])
	})
})

describe('stale cases (K12, R177)', () => {
	it('selects nothing when every entry is current', () => {
		const skill = scopedSkill()
		const now = hashes(skill)
		const evalSet = readEvalSet(skill.folder, criteria)
		if (!evalSet) throw new Error('no eval set')
		expect(selectStale(evalSet, now, recorded(now))).toEqual({ stale: [], scopes: [], current: 6 })
	})

	it("selects only the edited scope's cases, and names the input that changed", () => {
		const skill = scopedSkill()
		const file = recorded(hashes(skill))
		edit(skill, 'references/style.md', (text) => `${text}Use the active voice.\n`)
		const evalSet = readEvalSet(skill.folder, criteria)
		if (!evalSet) throw new Error('no eval set')
		const selection = selectStale(evalSet, hashes(skill), file)
		expect(selection.stale).toEqual(['write-two'])
		expect(selection.scopes).toEqual([{ scope: 'write', cases: ['write-two'], inputsChanged: ['references/style.md'] }])
		expect(selection.current).toBe(5)
	})

	it('selects a new case, a case whose own definition changed, and an entry with no hashes', () => {
		const skill = scopedSkill()
		const file = recorded(hashes(skill))
		delete (file.entries['fire-audit'] as { hashes?: unknown }).hashes
		edit(
			skill,
			'evals/audit/evals.yaml',
			(text) => `${text}  - { id: audit-two, prompt: audit again, criteria: [C3] }\n`,
		)
		edit(skill, 'evals/write/evals.yaml', (text) => text.replace('write the notes', 'write the release notes'))
		const evalSet = readEvalSet(skill.folder, criteria)
		if (!evalSet) throw new Error('no eval set')
		const selection = selectStale(evalSet, hashes(skill), file)
		expect(selection.stale).toEqual(['fire-audit', 'audit-two', 'write-two'])
		expect(selection.scopes).toEqual([
			{ scope: 'trigger', cases: ['fire-audit'], unrecorded: ['fire-audit'] },
			{ scope: 'audit', cases: ['audit-two'], noEntry: ['audit-two'] },
			{ scope: 'write', cases: ['write-two'], caseChanged: ['write-two'] },
		])
	})

	it('selects a case moved to another scope, and lists a change that selects nothing', () => {
		const skill = scopedSkill()
		const now = hashes(skill)
		const file = recorded({ ...now, reported: { scripts: 'sha256:a', harness: 'claude-code' } })
		edit(skill, 'evals/evals.yaml', (text) =>
			text.replace('outcome:\n  - { id: overview, prompt: what can you do, criteria: [C1] }\n', ''),
		)
		edit(
			skill,
			'evals/audit/evals.yaml',
			(text) => `${text}  - { id: overview, prompt: what can you do, criteria: [C1] }\n`,
		)
		const evalSet = readEvalSet(skill.folder, criteria)
		if (!evalSet) throw new Error('no eval set')
		const selection = selectStale(
			evalSet,
			{ ...hashes(skill), reported: { scripts: 'sha256:b', harness: 'codex' } },
			file,
		)
		expect(selection.scopes).toEqual([
			{ scope: 'audit', cases: ['overview'], inputsChanged: ['the case moved from scope root'] },
		])
		expect(selection.notSelecting).toEqual(['built scripts changed', 'harness changed: claude-code → codex'])
	})

	it('names an added and a removed input', () => {
		expect(changedInputs({ a: '1', b: '2' }, { a: '1', c: '3' })).toEqual(['b (removed)', 'c (added)'])
	})
})
