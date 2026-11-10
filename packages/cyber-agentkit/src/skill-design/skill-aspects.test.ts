import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { referenceLayers } from '../references/reference-layers.js'
import { parseAspectChecks } from './aspect-checks.js'
import { builtInAspects } from './built-in-aspects.js'
import { runCheckScript } from './run-check-script.js'
import { aspectNames, loadAspect } from './skill-aspects.js'
import { goodSkill } from './skill-design.fixtures.js'

const packageRoot = fileURLToPath(new URL('../..', import.meta.url))
const skillMd = readFileSync(new URL('../../skills/skill/SKILL.md', import.meta.url), 'utf8')

async function packageLayers() {
	return referenceLayers({
		root: packageRoot,
		cwd: packageRoot,
		home: homedir(),
		platform: process.platform,
		env: {},
		plugin: { name: 'cyber-agentkit', root: packageRoot },
	})
}

describe('the built-in aspects', () => {
	it('list the same checks as /skill', () => {
		const written = parseAspectChecks(`## Criteria\n${skillMd.replace(/^#{1,3} .*$/gm, '')}`)
		const coded = builtInAspects.filter(({ aspect }) => aspect !== 'specification').flatMap(({ checks }) => checks)
		expect(coded.map(({ id, how }) => `${id} ${how}`)).toEqual(written.map(({ id, how }) => `${id} ${how}`))
		for (const check of coded) expect(skillMd.replace(/\n {2}/g, ' ')).toContain(check.statement)
	})
})

describe('the shipped aspects', () => {
	it('are found Criteria and Verification first, then the open ones', async () => {
		expect(aspectNames(await packageLayers())).toEqual([
			'skill-design.aspects.criteria',
			'skill-design.aspects.verification',
			'skill-design.aspects.security',
		])
	})

	it('each name a check script that decides every script check it lists, and no other', async () => {
		const layers = await packageLayers()
		const skill = goodSkill()
		for (const name of aspectNames(layers)) {
			const aspect = loadAspect(name, layers, (path) => path)
			expect(aspect.problem).toBeUndefined()
			expect(aspect.checkScript, name).toMatch(/skills\/skill\/scripts\/check-[a-z]+\.mjs$/)
			const ran = runCheckScript(aspect.checkScript as string, skill.folder)
			if (!('outcomes' in ran)) throw new Error(ran.problem)
			const declared = aspect.checks.filter(({ how }) => how === 'script').map(({ id }) => id)
			expect(ran.outcomes.map(({ id }) => id)).toEqual(declared)
			expect(ran.outcomes.every(({ status }) => status === 'pass')).toBe(true)
		}
	})
})
