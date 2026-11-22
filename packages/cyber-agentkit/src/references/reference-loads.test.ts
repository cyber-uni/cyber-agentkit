import { describe, expect, it } from 'vitest'
import { backtickedNames, declaredLoads, detectedLoads, knownBy, skillFrontmatter } from './reference-loads.js'

const known = knownBy((name) => ['triage.rules', 'release-notes.tone', 'scaffold.recipe.interface'].includes(name))

describe('declaredLoads', () => {
	it('reads the space-separated names under `metadata.references` and `metadata.reference-interfaces`', () => {
		const frontmatter = skillFrontmatter(
			'---\nname: x\nmetadata:\n  references: a.b  c\n  reference-interfaces: scaffold.recipe\n---\nbody\n',
		)
		expect(declaredLoads(frontmatter)).toEqual({ names: ['a.b', 'c'], interfaces: ['scaffold.recipe'] })
	})

	it('answers an empty list as declared, so a skill can say it loads nothing', () => {
		expect(declaredLoads({ metadata: { references: '' } })).toEqual({ names: [], interfaces: [] })
	})

	it('answers undefined when neither key is set, or there is no metadata map', () => {
		expect(declaredLoads({ metadata: { author: 'me' } })).toBeUndefined()
		expect(declaredLoads({ metadata: 'x' })).toBeUndefined()
		expect(declaredLoads(undefined)).toBeUndefined()
	})

	it('reads no names from a value that is not a string, which the spec does not allow', () => {
		expect(declaredLoads({ metadata: { references: ['a'] } })).toEqual({ names: [], interfaces: [] })
	})
})

describe('skillFrontmatter', () => {
	it('answers undefined for no front matter, invalid YAML, or a front matter that is not a mapping', () => {
		expect(skillFrontmatter('# no front matter\n')).toBeUndefined()
		expect(skillFrontmatter('---\n: : :\n---\n')).toBeUndefined()
		expect(skillFrontmatter('---\n- a\n---\n')).toBeUndefined()
	})
})

describe('backtickedNames', () => {
	it('keeps spans that read as a name, bare or qualified with a plugin, outside fences', () => {
		const text = 'Use `a.b`, `plugin/c-d`, `gh issue create`, `--flag`, `a.b` again.\n```\n`fenced`\n```\n'
		expect(backtickedNames(text)).toEqual(['a.b', 'plugin/c-d'])
	})
})

describe('detectedLoads', () => {
	it('counts a backticked name only when it is known here, whatever language surrounds it', () => {
		expect(detectedLoads('まず `triage.rules` を読み込み、`unknown.name` は無視する。', known)).toEqual({
			names: ['triage.rules'],
			interfaces: [],
		})
	})

	it('counts a backticked name whose interface document is known as an interface load', () => {
		expect(detectedLoads('Cargar las implementaciones de `scaffold.recipe`.', known)).toEqual({
			names: [],
			interfaces: ['scaffold.recipe'],
		})
	})

	it('still counts an English load line of a name known nowhere, so a missing load is found', () => {
		expect(detectedLoads('Load `missing.one` with the `reference` skill.', known)).toEqual({
			names: ['missing.one'],
			interfaces: [],
		})
	})

	it('counts nothing in a fenced example', () => {
		expect(detectedLoads('```\nLoad `missing.one` with the `reference` skill. `triage.rules`\n```\n', known)).toEqual({
			names: [],
			interfaces: [],
		})
	})
})

describe('knownBy', () => {
	it('asks the resolver once per name', () => {
		const asked: string[] = []
		const once = knownBy((name) => {
			asked.push(name)
			return false
		})
		once('a')
		once('a')
		expect(asked).toEqual(['a', 'a.interface'])
	})
})
