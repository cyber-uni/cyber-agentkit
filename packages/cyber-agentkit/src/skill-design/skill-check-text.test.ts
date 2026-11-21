import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const check = readFileSync(join(import.meta.dirname, '../../skills/skill/references/check.md'), 'utf8')

describe('the skill skill text: SHP-5 and SHP-6', () => {
	const step = check.slice(check.indexOf('To decide SHP-5 and SHP-6'), check.indexOf('To decide SHP-3'))

	it('resolves a named skill to its folder, then hands the reference commands that folder', () => {
		expect(step).toContain('`skill where <name>`')
		expect(step).toContain('`advise <skill folder>`')
		expect(step).toContain('`uses <skill folder>`')
		expect(step).not.toContain('audit')
	})

	it('keeps the front matter a skill-specific judgment of its own', () => {
		expect(step).toContain('a lead in the\n`description` is the trigger, which stays in the skill')
	})
})
