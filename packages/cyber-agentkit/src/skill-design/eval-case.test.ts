import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { addCase, removeCase } from './eval-case.js'
import { goodSkill } from './skill-design.fixtures.js'

const evalsOf = (folder: string) => readFileSync(join(folder, 'evals', 'evals.yaml'), 'utf8')

describe('addCase (R159)', () => {
	it('adds the entry and the files folder, keeping the comments of evals.yaml', () => {
		const skill = goodSkill({
			'evals/evals.yaml':
				'# three runs\nruns: 3\noutcome:\n  - { id: two-prs, prompt: write the notes, files: files/two-prs }\n',
		})
		const added = addCase(skill.folder, 'one-pr', { prompt: 'write the notes for one PR' })
		expect(added).toMatchObject({ case: 'one-pr', paths: [join('evals', 'files', 'one-pr')] })
		expect(statSync(join(skill.folder, 'evals', 'files', 'one-pr')).isDirectory()).toBe(true)
		expect(evalsOf(skill.folder)).toContain('# three runs')
		expect(parse(evalsOf(skill.folder)).outcome[1]).toEqual({
			id: 'one-pr',
			prompt: 'write the notes for one PR',
			files: 'files/one-pr',
		})
	})

	it('scaffolds a setup script with --setup, and no files folder unless asked', () => {
		const skill = goodSkill()
		addCase(skill.folder, 'red-check', { prompt: 'commit the parser change', setup: true })
		const script = join(skill.folder, 'evals', 'setup', 'red-check.sh')
		expect(readFileSync(script, 'utf8')).toMatch(/^#!\/bin\/sh\n/)
		expect(existsSync(join(skill.folder, 'evals', 'files', 'red-check'))).toBe(false)
		expect(parse(evalsOf(skill.folder)).outcome[1]).toEqual({
			id: 'red-check',
			prompt: 'commit the parser change',
			setup: 'setup/red-check.sh',
		})
		addCase(skill.folder, 'both', { prompt: 'x', setup: true, files: true })
		expect(parse(evalsOf(skill.folder)).outcome[2]).toMatchObject({ files: 'files/both', setup: 'setup/both.sh' })
	})

	it('makes evals.yaml when the skill has none', () => {
		const skill = goodSkill()
		rmSync(join(skill.folder, 'evals'), { recursive: true })
		addCase(skill.folder, 'first', { prompt: 'x' })
		expect(parse(evalsOf(skill.folder))).toEqual({ outcome: [{ id: 'first', prompt: 'x', files: 'files/first' }] })
	})

	it('refuses an ID that is taken, names a path, or names a trigger case, and changes nothing', () => {
		const skill = goodSkill()
		const before = evalsOf(skill.folder)
		expect(addCase(skill.folder, 'two-prs', { prompt: 'x' })).toMatchObject({ code: 'case-exists' })
		for (const id of ['../escape', 'a/b', '..', '.hidden', 'trigger-2'])
			expect(addCase(skill.folder, id, { prompt: 'x' })).toMatchObject({ code: 'bad-case-id' })
		expect(evalsOf(skill.folder)).toBe(before)
		expect(existsSync(join(skill.folder, 'escape'))).toBe(false)
	})

	it('refuses to write through a files folder linked outside the evals folder', () => {
		const skill = goodSkill()
		const outside = mkdtempSync(join(tmpdir(), 'eval-case-outside-'))
		symlinkSync(outside, join(skill.folder, 'evals', 'linked'), 'dir')
		mkdirSync(join(skill.folder, 'evals', 'files'), { recursive: true })
		symlinkSync(outside, join(skill.folder, 'evals', 'files', 'out'), 'dir')
		expect(addCase(skill.folder, 'out', { prompt: 'x' })).toMatchObject({ code: 'outside-evals' })
	})
})

describe('removeCase (R159)', () => {
	it('removes the entry, its files folder, and its setup script, and nothing else', () => {
		const skill = goodSkill()
		addCase(skill.folder, 'red-check', { prompt: 'x', setup: true, files: true })
		writeFileSync(join(skill.folder, 'evals', 'files', 'red-check', 'a.txt'), 'a')
		const removed = removeCase(skill.folder, 'red-check')
		expect(removed).toMatchObject({
			case: 'red-check',
			paths: [join('evals', 'files', 'red-check'), join('evals', 'setup', 'red-check.sh')],
		})
		expect(existsSync(join(skill.folder, 'evals', 'files', 'red-check'))).toBe(false)
		expect(existsSync(join(skill.folder, 'evals', 'setup', 'red-check.sh'))).toBe(false)
		expect(existsSync(join(skill.folder, 'evals', 'files', 'two-prs', 'prs.json'))).toBe(true)
		expect(parse(evalsOf(skill.folder)).outcome.map((item: { id: string }) => item.id)).toEqual(['two-prs'])
	})

	it('keeps a files folder another case still names', () => {
		const skill = goodSkill({
			'evals/evals.yaml':
				'outcome:\n  - { id: two-prs, prompt: a, files: files/two-prs }\n  - { id: again, prompt: b, files: files/two-prs }\n',
		})
		expect(removeCase(skill.folder, 'again')).toMatchObject({ paths: [] })
		expect(existsSync(join(skill.folder, 'evals', 'files', 'two-prs', 'prs.json'))).toBe(true)
	})

	it('refuses a case whose files reach outside the evals folder, and changes nothing', () => {
		const outside = mkdtempSync(join(tmpdir(), 'eval-case-outside-'))
		writeFileSync(join(outside, 'keep.txt'), 'keep')
		const skill = goodSkill({
			'evals/evals.yaml': `outcome:\n  - { id: two-prs, prompt: a, files: files/two-prs }\n  - { id: far, prompt: b, files: ${JSON.stringify(outside)} }\n  - { id: up, prompt: c, files: ../.. }\n`,
		})
		const before = evalsOf(skill.folder)
		expect(removeCase(skill.folder, 'far')).toMatchObject({ code: 'outside-evals' })
		expect(removeCase(skill.folder, 'up')).toMatchObject({ code: 'outside-evals' })
		expect(existsSync(join(outside, 'keep.txt'))).toBe(true)
		expect(existsSync(join(skill.folder, 'SKILL.md'))).toBe(true)
		expect(evalsOf(skill.folder)).toBe(before)
	})

	it('refuses a files folder linked outside the evals folder', () => {
		const outside = mkdtempSync(join(tmpdir(), 'eval-case-outside-'))
		writeFileSync(join(outside, 'keep.txt'), 'keep')
		const skill = goodSkill({ 'evals/evals.yaml': 'outcome:\n  - { id: linked, prompt: a, files: files/linked }\n' })
		mkdirSync(join(skill.folder, 'evals', 'files'), { recursive: true })
		symlinkSync(outside, join(skill.folder, 'evals', 'files', 'linked'), 'dir')
		expect(removeCase(skill.folder, 'linked')).toMatchObject({ code: 'outside-evals' })
		expect(existsSync(join(outside, 'keep.txt'))).toBe(true)
	})

	it('answers an unknown case with the cases there are', () => {
		expect(removeCase(goodSkill().folder, 'nope')).toEqual({
			code: 'unknown-case',
			problem: 'evals/evals.yaml has no outcome case nope; its cases are two-prs',
		})
	})
})
