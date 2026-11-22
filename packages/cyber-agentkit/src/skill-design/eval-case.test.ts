import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { addCase, addTriggerCase, removeCase } from './eval-case.js'
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
		// It says which paths a run cannot write and how to install a git hook anyway (#290).
		expect(readFileSync(script, 'utf8')).toContain('.git/hooks and .git/config are read-only')
		expect(readFileSync(script, 'utf8')).toContain('git config --global core.hooksPath "$PWD/hooks"')
		expect(readFileSync(script, 'utf8')).toContain('skill case try <skill folder> red-check')
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

	it('edits evals.yaml in place, leaving every other entry as its author wrote it (#290)', () => {
		const written = [
			'runs: 3',
			'outcome:',
			'  - id: two-prs',
			'    prompt: >-',
			'      write the release notes for the two merged pull requests, grouped by label, one line',
			'      each, without the bots',
			'    files: files/two-prs',
			'    criteria: [C4]',
			'    checks:',
			'      C4:',
			'        - script: >-',
			'            test -z "$(git status --porcelain)"',
			'  # the rubrics below are shared',
			'rubrics:',
			'  C4:',
			'    - regex: "notes"',
			'',
		].join('\n')
		const skill = goodSkill({ 'evals/evals.yaml': written })
		addCase(skill.folder, 'one-pr', { prompt: 'write the notes for one PR' })
		const lines = written.split('\n')
		expect(evalsOf(skill.folder)).toBe(
			[
				...lines.slice(0, 12),
				'  - id: one-pr',
				'    prompt: write the notes for one PR',
				'    files: files/one-pr',
				...lines.slice(12),
			].join('\n'),
		)
		expect(removeCase(skill.folder, 'one-pr')).toMatchObject({ case: 'one-pr' })
		expect(evalsOf(skill.folder)).toBe(written)
	})

	it('writes --criteria and each --check into the entry (#290)', () => {
		const skill = goodSkill()
		const added = addCase(skill.folder, 'clean', {
			prompt: 'x',
			criteria: ['C1', 'C2'],
			checks: [
				{ criterion: 'C2', script: 'test -z "$(git status --porcelain)"' },
				{ criterion: 'C3', script: 'test -f out.md' },
				{ criterion: 'C2', script: 'git log -1' },
			],
		})
		expect(added).toMatchObject({ case: 'clean' })
		expect(evalsOf(skill.folder)).toContain('criteria: [C1, C2, C3]')
		expect(parse(evalsOf(skill.folder)).outcome[1]).toEqual({
			id: 'clean',
			prompt: 'x',
			files: 'files/clean',
			criteria: ['C1', 'C2', 'C3'],
			checks: {
				C2: [{ script: 'test -z "$(git status --porcelain)"' }, { script: 'git log -1' }],
				C3: [{ script: 'test -f out.md' }],
			},
		})
	})

	it('refuses a criterion that is not an ID, and changes nothing', () => {
		const skill = goodSkill()
		const before = evalsOf(skill.folder)
		expect(addCase(skill.folder, 'a', { prompt: 'x', criteria: ['C 1'] })).toMatchObject({ code: 'bad-criterion' })
		expect(addCase(skill.folder, 'a', { prompt: 'x', checks: [{ criterion: '', script: 'true' }] })).toMatchObject({
			code: 'bad-criterion',
		})
		expect(evalsOf(skill.folder)).toBe(before)
		expect(existsSync(join(skill.folder, 'evals', 'files', 'a'))).toBe(false)
	})

	it('still adds the case to an outcome list written in flow style', () => {
		const skill = goodSkill({ 'evals/evals.yaml': 'outcome: [{ id: two-prs, prompt: a, files: files/two-prs }]\n' })
		addCase(skill.folder, 'b', { prompt: 'b' })
		expect(parse(evalsOf(skill.folder)).outcome.map((item: { id: string }) => item.id)).toEqual(['two-prs', 'b'])
	})

	it('adds an outcome list at the end of an evals.yaml with only trigger cases', () => {
		const written = 'trigger:\n  - { prompt: "write the notes", expect: fire }\n'
		const skill = goodSkill({ 'evals/evals.yaml': written })
		addCase(skill.folder, 'first', { prompt: 'x' })
		expect(evalsOf(skill.folder)).toBe(`${written}outcome:\n  - id: first\n    prompt: x\n    files: files/first\n`)
	})

	it("starts a case from another case's setup with from (#290)", () => {
		const skill = goodSkill({
			'evals/evals.yaml': 'outcome:\n  - { id: base, prompt: a, files: files/two-prs, setup: setup/base.sh }\n',
			'evals/setup/base.sh': '#!/bin/sh\nset -e\ngit commit -q --allow-empty -m start\n',
		})
		const added = addCase(skill.folder, 'more', { prompt: 'b', from: 'base' })
		expect(added).toMatchObject({ paths: [join('evals', 'setup', 'more.sh')] })
		expect(readFileSync(join(skill.folder, 'evals', 'setup', 'more.sh'), 'utf8')).toBe(
			'#!/bin/sh\nset -e\ngit commit -q --allow-empty -m start\n',
		)
		expect(statSync(join(skill.folder, 'evals', 'setup', 'more.sh')).mode & 0o111).not.toBe(0)
		expect(existsSync(join(skill.folder, 'evals', 'files', 'more'))).toBe(false)
		expect(parse(evalsOf(skill.folder)).outcome[1]).toEqual({
			id: 'more',
			prompt: 'b',
			files: 'files/two-prs',
			setup: 'setup/more.sh',
		})
		addCase(skill.folder, 'own', { prompt: 'c', from: 'base', files: true })
		expect(parse(evalsOf(skill.folder)).outcome[2]).toMatchObject({ files: 'files/own', setup: 'setup/own.sh' })
	})

	it('refuses from a case that is missing or has no setup script, and changes nothing', () => {
		const skill = goodSkill()
		const before = evalsOf(skill.folder)
		expect(addCase(skill.folder, 'a', { prompt: 'x', from: 'nope' })).toMatchObject({ code: 'unknown-case' })
		expect(addCase(skill.folder, 'a', { prompt: 'x', from: 'two-prs' })).toMatchObject({ code: 'no-setup' })
		expect(evalsOf(skill.folder)).toBe(before)
		expect(existsSync(join(skill.folder, 'evals', 'setup', 'a.sh'))).toBe(false)
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

describe('addTriggerCase (R159, R175)', () => {
	it('adds the trigger case with its ID after the last one, keeping the rest of the file', () => {
		const source =
			'# runs\nruns: 3\ntrigger:\n  - { prompt: write release notes, expect: fire }   # old\noutcome:\n  - { id: two-prs, prompt: write the notes, files: files/two-prs }\n'
		const skill = goodSkill({ 'evals/evals.yaml': source })
		expect(addTriggerCase(skill.folder, 'changelog', { prompt: 'draft the changelog', expect: 'fire' })).toEqual({
			skill: skill.folder,
			case: 'changelog',
			evals: join(skill.folder, 'evals', 'evals.yaml'),
			paths: [],
		})
		const text = evalsOf(skill.folder)
		expect(text).toContain('# runs')
		expect(text).toContain('expect: fire }   # old')
		expect(parse(text).trigger).toEqual([
			{ prompt: 'write release notes', expect: 'fire' },
			{ id: 'changelog', prompt: 'draft the changelog', expect: 'fire' },
		])
		expect(existsSync(join(skill.folder, 'evals', 'files', 'changelog'))).toBe(false)
	})

	it('makes the trigger list when the file has none', () => {
		const skill = goodSkill({ 'evals/evals.yaml': 'runs: 3\n' })
		addTriggerCase(skill.folder, 'review', { prompt: 'review my diff', expect: 'skip' })
		expect(parse(evalsOf(skill.folder)).trigger).toEqual([{ id: 'review', prompt: 'review my diff', expect: 'skip' }])
	})

	it('refuses an ID another case holds, a positional one included, or the positional form, changing nothing', () => {
		const source =
			'trigger:\n  - { prompt: write release notes, expect: fire }\noutcome:\n  - { id: two-prs, prompt: x }\n'
		const skill = goodSkill({ 'evals/evals.yaml': source })
		for (const id of ['two-prs', 'trigger-1'])
			expect(addTriggerCase(skill.folder, id, { prompt: 'p', expect: 'fire' })).toMatchObject({
				code: id === 'two-prs' ? 'case-exists' : 'bad-case-id',
			})
		expect(addTriggerCase(skill.folder, 'a/b', { prompt: 'p', expect: 'fire' })).toMatchObject({ code: 'bad-case-id' })
		expect(addCase(skill.folder, 'trigger-1', { prompt: 'p' })).toMatchObject({ code: 'bad-case-id' })
		expect(evalsOf(skill.folder)).toBe(source)
	})

	it('refuses an outcome case whose ID a trigger case holds', () => {
		const skill = goodSkill({ 'evals/evals.yaml': 'trigger:\n  - { id: notes, prompt: p, expect: fire }\n' })
		expect(addCase(skill.folder, 'notes', { prompt: 'q' })).toMatchObject({ code: 'case-exists' })
	})
})
