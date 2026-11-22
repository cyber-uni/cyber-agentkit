import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inputHashes } from './input-hashes.js'
import { goodEvals, goodSkill } from './skill-design.fixtures.js'
import { readSkill, type SkillFiles } from './skill-files.js'
import type { InputHashes } from './test-result.js'

const hashes = (skill: { folder: string }): InputHashes =>
	inputHashes(readSkill(skill.folder) as SkillFiles, ['C1', 'C2']) as InputHashes

describe('inputHashes (R178 to R180)', () => {
	it('hashes each case and each scope', () => {
		const out = hashes(goodSkill())
		expect(Object.keys(out.cases)).toEqual([
			'trigger-1',
			'trigger-2',
			'trigger-3',
			'trigger-4',
			'trigger-5',
			'trigger-6',
			'two-prs',
		])
		expect(Object.keys(out.scopes)).toEqual(['trigger', 'root'])
		for (const value of [...Object.values(out.cases), ...Object.values(out.scopes)]) expect(value).toMatch(/^sha256:/)
	})

	it('changes only the case whose definition changed', () => {
		const skill = goodSkill()
		const before = hashes(skill)
		writeFileSync(join(skill.folder, 'evals', 'evals.yaml'), goodEvals.replace('review my diff', 'review my patch'))
		const after = hashes(skill)
		expect(after.cases['trigger-5']).not.toBe(before.cases['trigger-5'])
		expect({ ...after.cases, 'trigger-5': '' }).toEqual({ ...before.cases, 'trigger-5': '' })
		expect(after.scopes).toEqual(before.scopes)
	})

	it('changes a case for a change to its files folder or a shared rubric it tests', () => {
		const skill = goodSkill()
		const before = hashes(skill)
		writeFileSync(join(skill.folder, 'evals', 'files', 'two-prs', 'extra.md'), 'more')
		const files = hashes(skill)
		expect(files.cases['two-prs']).not.toBe(before.cases['two-prs'])
		writeFileSync(join(skill.folder, 'evals', 'evals.yaml'), goodEvals.replace('## Release notes', '## Notes'))
		expect(hashes(skill).cases['two-prs']).not.toBe(files.cases['two-prs'])
		expect(hashes(skill).cases['trigger-1']).toBe(before.cases['trigger-1'])
	})

	it('changes the root scope for a change to the body, and the trigger scope for one to the description', () => {
		const skill = goodSkill()
		const before = hashes(skill)
		const path = join(skill.folder, 'SKILL.md')
		const text = readFileSync(path, 'utf8')
		writeFileSync(path, `${text}\nOne more step.\n`)
		const body = hashes(skill)
		expect(body.scopes['root']).not.toBe(before.scopes['root'])
		expect(body.scopes['trigger']).toBe(before.scopes['trigger'])
		writeFileSync(path, text.replace(/description: (.*)/, 'description: $1 Also for changelogs.'))
		expect(hashes(skill).scopes['trigger']).not.toBe(before.scopes['trigger'])
	})

	it('reads a change only to whitespace or line wrapping as no change (R179)', () => {
		const skill = goodSkill()
		const before = hashes(skill)
		const path = join(skill.folder, 'SKILL.md')
		writeFileSync(path, readFileSync(path, 'utf8').replace(/ /g, '  ').replace(/\n\n/g, '\n\n\n'))
		expect(hashes(skill).scopes).toEqual(before.scopes)
	})
})
