import { describe, expect, it } from 'vitest'
import { knownBy } from '../references/reference-loads.js'
import { checkLoads, leadInNames } from './load-checks.js'
import { makeSkill } from './skill-design.fixtures.js'

const known = knownBy((name) => ['triage.rules', 'triage.labels', 'scaffold.recipe.interface'].includes(name))

function skillMd(metadata: string, body: string): string {
	return `---\nname: release-notes\ndescription: Write release notes.\n${metadata}---\n\n# Release notes\n\n${body}\n`
}

describe('checkLoads (SHP-20)', () => {
	it('passes a skill that declares each load and mentions each declared name', () => {
		const skill = makeSkill({
			'SKILL.md': skillMd(
				'metadata:\n  references: triage.rules\n  reference-interfaces: scaffold.recipe\n',
				'Load `triage.rules` with the `reference` skill. Load the implementations of the `scaffold.recipe` interface with the `reference` skill.',
			),
		})
		expect(checkLoads(skill, known)).toEqual({ id: 'SHP-20', status: 'pass' })
	})

	it('passes a skill that loads nothing and declares nothing', () => {
		expect(checkLoads(makeSkill({ 'SKILL.md': skillMd('', 'Run `gh release create`.') }), known).status).toBe('pass')
	})

	it('fails a backticked name that resolves and is not declared, in a skill not written in English', () => {
		const skill = makeSkill({ 'SKILL.md': skillMd('', '`triage.rules` を `reference` スキルで読み込む。') })
		const outcome = checkLoads(skill, known)
		expect(outcome).toMatchObject({ status: 'fail', file: 'SKILL.md' })
		expect(outcome.message).toContain('`triage.rules`')
		expect(outcome.message).toContain('metadata.references')
	})

	it('fails a resolving name the declared list leaves out, and an interface under its own key', () => {
		const skill = makeSkill({
			'SKILL.md': skillMd(
				'metadata:\n  references: triage.rules\n',
				'Read `triage.rules`, then `triage.labels`, then the `scaffold.recipe` implementations.',
			),
		})
		const message = checkLoads(skill, known).message ?? ''
		expect(message).toContain('`triage.labels`, which the skill does not declare; add it to `metadata.references`')
		expect(message).toContain(
			'`scaffold.recipe`, which the skill does not declare; add it to `metadata.reference-interfaces`',
		)
	})

	it('fails a declared name no text mentions in backticks', () => {
		const skill = makeSkill({ 'SKILL.md': skillMd('metadata:\n  references: triage.rules\n', 'Write the notes.') })
		expect(checkLoads(skill, known).message).toContain(
			'declares `triage.rules`, and no text the agent reads mentions it',
		)
	})

	it('finds a mention in a file under references/, not in a fenced example', () => {
		const skill = makeSkill({
			'SKILL.md': skillMd(
				'metadata:\n  references: triage.rules\n',
				'See [steps](references/steps.md).\n\n```\n`triage.labels`\n```',
			),
			'references/steps.md': 'Load `triage.rules` with the `reference` skill.\n',
		})
		expect(checkLoads(skill, known).status).toBe('pass')
	})

	it('fails the lead-in-plus-bullets form when its names are not declared, even with no resolver', () => {
		const skill = makeSkill({
			'SKILL.md': skillMd(
				'',
				'Load these with the `reference` skill of `cyber-agentkit`:\n\n- `project-tracker.levels`: how deep.\n- `project-tracker.kinds`: what kind.',
			),
		})
		const message = checkLoads(skill).message ?? ''
		expect(message).toContain('lists under a load lead-in `project-tracker.levels`')
		expect(message).toContain('`project-tracker.kinds`')
	})

	it('passes the lead-in form once its names are declared', () => {
		const skill = makeSkill({
			'SKILL.md': skillMd(
				'metadata:\n  references: project-tracker.levels\n',
				'Load these with the `reference` skill of `cyber-agentkit`:\n\n- `project-tracker.levels`: how deep.',
			),
		})
		expect(checkLoads(skill).status).toBe('pass')
	})

	it('fails an English load line of a name that resolves nowhere when it is not declared', () => {
		const skill = makeSkill({ 'SKILL.md': skillMd('', 'Load `missing.one` with the `reference` skill.') })
		expect(checkLoads(skill, known).message).toContain('loads `missing.one`')
	})

	it('fails a list value that is not a string, which the spec does not allow', () => {
		const skill = makeSkill({
			'SKILL.md': skillMd('metadata:\n  references:\n    - triage.rules\n', 'Read `triage.rules`.'),
		})
		expect(checkLoads(skill, known).message).toContain('`metadata.references` is not a string')
	})
})

describe('leadInNames', () => {
	it('reads nothing from a load line that names its references itself', () => {
		expect(leadInNames('Load `a` with the `reference` skill:\n\n- `b`: x\n')).toEqual([])
	})
})
