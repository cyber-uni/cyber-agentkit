import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkReferences } from './reference-check.js'
import type { ReferenceLayer, ReferenceLayers } from './reference-layers.js'
import { legacyRewrite } from './reference-legacy.js'
import { resolveReference } from './resolve-reference.js'

function tempDir(prefix = 'reference-legacy-'): string {
	return mkdtempSync(join(tmpdir(), prefix))
}

function write(root: string, relPath: string, content: string): string {
	const path = join(root, relPath)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
	return path
}

function layer(tier: ReferenceLayer['tier'], documents: Record<string, string> = {}): ReferenceLayer {
	const dir = tempDir()
	for (const [file, content] of Object.entries(documents)) write(dir, file, content)
	return { tier, dir }
}

function plugin(name: string, documents: Record<string, string> = {}): ReferenceLayer {
	return { ...layer('plugin', documents), plugin: name }
}

/** A skill folder holding `references/` and a `SKILL.md`, as the `default` tier reads it. */
function skill(documents: Record<string, string>): ReferenceLayer {
	const folder = tempDir('reference-legacy-skill-')
	write(folder, 'SKILL.md', '---\nname: tracker-skill\n---\n')
	for (const [file, content] of Object.entries(documents)) write(folder, join('references', file), content)
	return { tier: 'default', dir: join(folder, 'references'), skill: 'tracker-skill' }
}

const name = 'tracker'
const base = '## Create\n\nbase create\n\n## Close\n\nbase close\n'
const doc = (frontmatter: string, body: string) => `---\n${frontmatter}\n---\n\n${body}`

function legacyWarnings(resolved: ReturnType<typeof resolveReference>) {
	return resolved.warnings.filter(({ code }) => code === 'reference-legacy-format')
}

describe('legacy forms at load (R119)', () => {
	it('reads merge-sections as patch, warning reference-legacy-format with its 2.0 form and the fix', () => {
		const resolved = resolveReference(name, [
			layer('repo', { [`${name}.md`]: doc('merge: merge-sections', '## Create\n\nmine\n') }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.content).toBe('## Create\n\nmine\n\n## Close\n\nbase close\n')
		expect(resolved.warnings.map(({ code }) => code)).toEqual(['reference-legacy-format'])
		expect(resolved.warnings[0]?.message).toMatch(/`merge: merge-sections` is a version 1 form, and it reads as patch/)
		expect(resolved.warnings[0]?.message).toMatch(/no merge: patch is the default.*Run `reference migrate`/)
	})

	it('reads first-wins as patch, naming merge: replace as its 2.0 form', () => {
		const resolved = resolveReference(name, [
			layer('user', { [`${name}.md`]: doc('merge: first-wins', '## Create\n\nmine\n') }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.content).toBe('## Create\n\nmine\n\n## Close\n\nbase close\n')
		expect(legacyWarnings(resolved)).toHaveLength(1)
		expect(legacyWarnings(resolved)[0]?.message).toMatch(/its 2.0 form is merge: replace/)
	})

	it('ignores overrides, naming extends as its 2.0 form', () => {
		const resolved = resolveReference(name, [
			plugin('b', { [`${name}.md`]: doc('overrides: [a/tracker]', '## Create\n\nb create\n') }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.status).toBe('ambiguous')
		expect(legacyWarnings(resolved)[0]?.message).toMatch(/`overrides: \[a\/tracker\]`.*its 2.0 form is extends: \[a\]/)
	})

	it("names the plugin's author as the one who fixes an installed plugin's file", () => {
		const resolved = resolveReference(name, [plugin('a', { [`${name}.md`]: doc('merge: merge-sections', base) })])

		expect(legacyWarnings(resolved)[0]?.message).toMatch(
			/Plugin a's author rewrites it with `reference migrate --plugin <its source folder>`/,
		)
	})

	it('names no migrate fix for a managed file', () => {
		const resolved = resolveReference(name, [
			layer('managed', { [`${name}.md`]: doc('merge: merge-sections', '## Create\n\nadmin\n') }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(legacyWarnings(resolved)[0]?.message).toMatch(/never changes a managed file/)
	})

	it("warns on a skill's default in the old layout, which is not read", () => {
		const resolved = resolveReference(name, [skill({ [`${name}.md`]: base })])

		expect(resolved.status).toBe('missing')
		expect(legacyWarnings(resolved)[0]?.message).toMatch(
			/`references\/tracker.md` is a version 1 form, and it is not read as the default; its 2.0 form is references\/tracker.default.md.*`reference migrate tracker --default /,
		)
	})

	it('does not warn on the old layout when the skill holds a default of the name', () => {
		const resolved = resolveReference(name, [skill({ [`${name}.md`]: 'old\n', [`${name}.default.md`]: base })])

		expect(resolved.content).toBe(base)
		expect(legacyWarnings(resolved)).toEqual([])
	})

	it('leaves a 2.0 file alone', () => {
		const resolved = resolveReference(name, [
			layer('repo', { [`${name}.md`]: doc('merge: patch\nextends: [a]', '## Create\n\nmine\n') }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(legacyWarnings(resolved)).toEqual([])
	})

	it('fails the compose check on a legacy form in the main document', () => {
		const [entry] = checkReferences(
			[
				layer('repo', { [`${name}.md`]: doc('merge: merge-sections', '## Create\n\nmine\n') }),
				plugin('a', { [`${name}.md`]: base }),
			],
			{ names: [name] },
		)

		expect(entry?.status).toBe('failed')
		expect(entry?.failures.map(({ check }) => check)).toEqual(['compose'])
		expect(entry?.failures[0]?.message).toMatch(/reference-legacy-format/)
	})
})

describe('legacy forms in a project section (R119)', () => {
	function sections(files: Record<string, string>) {
		const root = tempDir('reference-legacy-root-')
		for (const [file, content] of Object.entries(files)) write(root, file, content)
		const layers: ReferenceLayers = {
			layers: [{ tier: 'repo', dir: join(root, '.agents', 'references') }],
			root,
			projects: new Map(),
			harnesses: [],
		}
		return resolveReference(name, layers)
	}

	it('warns a legacy merge as a legacy form, not as a key a section does not carry', () => {
		const resolved = sections({
			[`.agents/references/${name}.md`]: base,
			[`pkg/.agents/references/${name}.md`]: doc('merge: merge-sections', '## Create\n\npkg\n'),
		})

		expect(resolved.projectSections).toHaveLength(1)
		expect(resolved.warnings.map(({ code }) => code)).toEqual(['reference-legacy-format'])
		expect(resolved.warnings[0]?.message).toMatch(/no merge: a project section carries none/)
	})

	it('warns a selection select wrote below the root, giving the customize that records it for the repository', () => {
		const resolved = sections({
			[`.agents/references/${name}.md`]: base,
			[`pkg/.agents/references/${name}.md`]: '---\nextends: [a, default]\n---\n',
		})

		expect(resolved.warnings.map(({ code }) => code)).toEqual(['reference-legacy-format'])
		expect(resolved.warnings[0]?.message).toMatch(
			/its extends is ignored\. To fix it, .*`reference customize tracker --extends a default` at the root/,
		)
	})

	it('still warns an extends with a body as a key a section does not carry', () => {
		const resolved = sections({
			[`.agents/references/${name}.md`]: base,
			[`pkg/.agents/references/${name}.md`]: doc('extends: [a]', '## Create\n\npkg\n'),
		})

		expect(resolved.warnings.map(({ code }) => code)).toEqual(['project-section-key-ignored'])
	})
})

describe('qualified-name overrides at load (R119)', () => {
	const override = doc('merge: merge-sections', '## Create\n\nmine\n')

	it('does not read a repo <plugin>/<name>.md, warning with its 2.0 form and migrate', () => {
		const resolved = resolveReference(name, [
			layer('repo', { [`a/${name}.md`]: override }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(resolved.content).toBe(base)
		expect(resolved.warnings.map(({ code }) => code)).toEqual(['reference-legacy-format'])
		expect(resolved.warnings[0]?.message).toMatch(
			/`a\/tracker\.md` is a version 1 form, and it is not read; its 2\.0 form is tracker\.md with extends: \[a\]\. Run `reference migrate`/,
		)
	})

	it('warns on a user <plugin>/<name>.md, even for a plugin that is not installed', () => {
		const resolved = resolveReference(name, [
			layer('user', { [`gone/${name}.md`]: override }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(legacyWarnings(resolved)).toHaveLength(1)
		expect(legacyWarnings(resolved)[0]?.message).toMatch(/`gone\/tracker\.md`.*extends: \[gone\]/)
	})

	it('leaves a reference in folder form alone, and an override of another name', () => {
		const resolved = resolveReference(name, [
			layer('repo', { 'a/README.md': '# a\n', [`a/${name}.md`]: override, ['b/other.md']: override }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(legacyWarnings(resolved)).toEqual([])
	})

	it('fails the compose check on one', () => {
		const [entry] = checkReferences(
			[layer('repo', { [`a/${name}.md`]: override }), plugin('a', { [`${name}.md`]: base })],
			{ names: [name] },
		)

		expect(entry?.status).toBe('failed')
		expect(entry?.failures[0]?.message).toMatch(/reference-legacy-format.*a\/tracker\.md/)
	})

	it('is reported when check runs over every name', () => {
		const entries = checkReferences([
			layer('repo', { [`a/${name}.md`]: override }),
			plugin('a', { [`${name}.md`]: base }),
		])

		expect(entries.find((entry) => entry.name === name)?.failures[0]?.message).toMatch(/a\/tracker\.md/)
	})
})

describe('qualified-name overrides in a project folder (R119)', () => {
	function layers(files: Record<string, string>): ReferenceLayers {
		const root = tempDir('reference-legacy-root-')
		for (const [file, content] of Object.entries(files)) write(root, file, content)
		return {
			layers: [{ tier: 'repo', dir: join(root, '.agents', 'references') }],
			root,
			projects: new Map(),
			harnesses: [],
		}
	}
	const files = {
		[`.agents/references/${name}.md`]: base,
		[`pkg/.agents/references/a/${name}.md`]: '## Create\n\npkg\n',
	}

	it('warns at load, giving the customize that picks the plugin for the repository', () => {
		const resolved = resolveReference(name, layers(files))

		expect(resolved.content).toBe(base)
		expect(resolved.warnings.map(({ code }) => code)).toEqual(['reference-legacy-format'])
		expect(resolved.warnings[0]?.message).toMatch(
			/`a\/tracker\.md` is a version 1 form, and it is not read\. To fix it, pick plugin a .*`reference customize tracker --extends a` at the root/,
		)
	})

	it('passes the warning on in check', () => {
		const [entry] = checkReferences(layers(files), { names: [name] })

		expect(entry?.warnings.map(({ code }) => code)).toContain('reference-legacy-format')
	})
})

describe('renames a plugin declares at load (R120)', () => {
	it('answers an older name as itself, warning with the new name and migrate', () => {
		const resolved = resolveReference('project-tracker.contract', [
			layer('repo', { 'project-tracker.contract.md': '## Version\n\nmine\n' }),
			plugin('repobuddy', {
				'_renames.yaml': 'project-tracker.contract: project-tracker.capabilities.interface\n',
				'project-tracker.capabilities.interface.md': '---\ninterface:\n  version: 1\n---\n',
			}),
		])

		expect(resolved.status).toBe('found')
		expect(resolved.content).toBe('## Version\n\nmine\n')
		expect(resolved.warnings).toEqual([
			{
				code: 'reference-renamed',
				message:
					'plugin repobuddy renamed "project-tracker.contract" to "project-tracker.capabilities.interface": load "project-tracker.capabilities.interface" instead, and run `reference migrate` to rename the files filed under "project-tracker.contract"',
			},
		])
	})

	it('does not warn while a plugin still holds the older name as its own', () => {
		const resolved = resolveReference('old', [
			plugin('a', { '_renames.yaml': 'old: new\n', 'new.md': 'new\n' }),
			plugin('b', { 'old.md': 'old\n' }),
		])

		expect(resolved.warnings).toEqual([])
	})

	it('is not itself a reference name', () => {
		const resolved = resolveReference('_renames', [plugin('a', { '_renames.yaml': 'old: new\n' })])

		expect(resolved.status).toBe('invalid')
	})
})

describe('legacyRewrite (R122)', () => {
	it('drops overrides already named by extends', () => {
		expect(legacyRewrite({ overrides: ['a'], extends: ['a', { b: 'combine' }] }, 'x', 'contribution', name)).toEqual({
			findings: [expect.objectContaining({ form: 'overrides', to: 'removed: extends already names each plugin' })],
			keys: { overrides: undefined },
		})
	})

	it('leaves overrides to a person when extends leaves one of its plugins out', () => {
		const { findings, keys } = legacyRewrite({ overrides: ['a', 'c'], extends: ['a'] }, 'x', 'contribution', name)

		expect(findings).toEqual([
			expect.objectContaining({ form: 'overrides', manual: expect.stringMatching(/does not name c/) }),
		])
		expect(keys).toEqual({})
	})
})
