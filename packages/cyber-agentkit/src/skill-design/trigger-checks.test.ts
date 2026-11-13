import { describe, expect, it } from 'vitest'
import { isNameOnly } from './name-only-skills.js'
import { byId, goodSkill, goodSkillMd } from './skill-design.fixtures.js'
import type { SkillFiles } from './skill-files.js'
import { checkTrigger } from './trigger-checks.js'

const trg5 = (skill: SkillFiles) => checkTrigger(skill).filter(({ id }) => id === 'TRG-5')

const withDescription = (description: string) =>
	goodSkill({
		'SKILL.md': goodSkillMd.replace(/^description: .*$/m, `description: ${JSON.stringify(description)}`),
	})

describe('isNameOnly', () => {
	it('recognizes a `By name only` or `Partial Skill:` description, and nothing else', () => {
		expect(isNameOnly(withDescription('By name only'))).toBe(true)
		expect(isNameOnly(withDescription('by name only.'))).toBe(true)
		expect(isNameOnly(withDescription('Partial Skill: invoke by name only'))).toBe(true)
		expect(isNameOnly(goodSkill())).toBe(false)
		expect(isNameOnly(withDescription('Use this skill when the user asks by name only'))).toBe(false)
	})
})

describe('checkTrigger (TRG-5)', () => {
	it('skips a skill that is not name-only', () => {
		expect(trg5(goodSkill())).toEqual([{ id: 'TRG-5', status: 'skipped', message: 'the skill is not name-only' }])
	})

	it('passes `By name only` and a `Partial Skill:` description with no trigger phrase', () => {
		for (const description of ['By name only', 'Partial Skill: invoke by name only'])
			expect(trg5(withDescription(description))).toEqual([{ id: 'TRG-5', status: 'pass' }])
	})

	it('fails a description that is not in the allowed form, naming what is wrong', () => {
		const cases: [string, string][] = [
			['By name only.', 'not exactly "By name only"'],
			['Partial Skill:', 'neither exactly "By name only"'],
			['partial skill: the judge', 'neither exactly "By name only"'],
			['Partial Skill: use when grading a spec', 'trigger phrase "use when"'],
			['Partial Skill: the judge. Use this skill when asked to grade', 'trigger phrase "Use this skill when"'],
			['Partial Skill: when to use: grading', 'trigger phrase "when to use"'],
		]
		for (const [description, message] of cases)
			expect(trg5(withDescription(description))).toEqual([
				{ id: 'TRG-5', status: 'fail', message: expect.stringContaining(message), file: 'SKILL.md' },
			])
	})
})

describe('checkTrigger (TRG-7)', () => {
	it('passes a specific description of 12 words or more', () => {
		expect(byId(checkTrigger(goodSkill()))['TRG-7']).toEqual({ id: 'TRG-7', status: 'pass' })
	})

	it('fails a description under 12 words, with its count', () => {
		expect(byId(checkTrigger(withDescription('Use this skill when writing release notes.')))['TRG-7']).toMatchObject({
			status: 'fail',
			file: 'SKILL.md',
			message: 'the description is 7 words, under 12',
		})
	})

	it('fails a generic phrase, whatever its case, naming it', () => {
		const skill = withDescription(
			'Use this skill when the user wants help. It Helps With various tasks around a release.',
		)
		expect(byId(checkTrigger(skill))['TRG-7']).toMatchObject({
			status: 'fail',
			message: 'the description uses "helps with", "various tasks"',
		})
	})

	it('skips a name-only skill, whose short description is the point', () => {
		expect(byId(checkTrigger(withDescription('By name only')))['TRG-7']).toEqual({
			id: 'TRG-7',
			status: 'skipped',
			message: 'the skill is name-only',
		})
	})

	it('leaves a missing description to SPEC-3', () => {
		const skill = goodSkill({ 'SKILL.md': goodSkillMd.replace(/^description: .*\n/m, '') })
		expect(byId(checkTrigger(skill))['TRG-7']).toMatchObject({ status: 'not-checked' })
	})
})

describe('checkTrigger (TRG-9)', () => {
	const trg9 = (skill: SkillFiles) => byId(checkTrigger(skill))['TRG-9']
	const withBody = (body: string, frontmatter = '') =>
		goodSkill({ 'SKILL.md': goodSkillMd.replace(/^---\n\n/m, `${frontmatter}---\n\n${body}\n\n`) })

	it('passes a skill whose body documents no arguments', () => {
		expect(trg9(goodSkill())).toEqual({ id: 'TRG-9', status: 'pass' })
	})

	it('fails each way a body documents arguments when there is no `argument-hint`, naming it', () => {
		const cases: [string, string][] = [
			[
				'| Command | Use |\n| --- | --- |\n| `check [skill]` | check it |',
				'a command table whose commands take arguments',
			],
			['| `vet <source>` | vet it |', 'a command table whose commands take arguments'],
			['Arguments: the release tag', 'an `Arguments:` line'],
			['**Arguments:** the release tag', 'an `Arguments:` line'],
			['## Arguments\n\nThe release tag.', 'an `Arguments` heading'],
			['Draft notes for $ARGUMENTS.', '`$ARGUMENTS`'],
		]
		for (const [body, signal] of cases)
			expect(trg9(withBody(body))).toEqual({
				id: 'TRG-9',
				status: 'fail',
				message: `the body documents arguments (${signal}) and the front matter has no \`argument-hint\``,
				file: 'SKILL.md',
			})
	})

	it('passes a body that documents arguments when the front matter has an `argument-hint`', () => {
		expect(trg9(withBody('Arguments: the release tag', 'argument-hint: "[tag]"\n'))).toEqual({
			id: 'TRG-9',
			status: 'pass',
		})
	})

	it('fails an empty `argument-hint`', () => {
		expect(trg9(withBody('Arguments: the release tag', 'argument-hint: ""\n'))).toMatchObject({ status: 'fail' })
	})

	it('reads no arguments from a command table without them, or from a code fence', () => {
		const body = '| `help` | show help |\n\n```md\nArguments: x\n$ARGUMENTS\n| `check [skill]` | x |\n```'
		expect(trg9(withBody(body))).toEqual({ id: 'TRG-9', status: 'pass' })
	})

	it('skips a name-only skill', () => {
		expect(trg9(withDescription('By name only'))).toEqual({
			id: 'TRG-9',
			status: 'skipped',
			message: 'the skill is name-only',
		})
	})
})
