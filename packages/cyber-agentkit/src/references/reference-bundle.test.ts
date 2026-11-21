import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bundleDefaults, bundledCopy, pluginRootOf } from './reference-bundle.js'

let root: string

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'bundle-'))
})

afterEach(() => {
	rmSync(root, { recursive: true, force: true })
})

function put(path: string, text: string): void {
	mkdirSync(join(path, '..'), { recursive: true })
	writeFileSync(path, text)
}

/** A plugin with a manifest and one canonical reference; a skill inside it that loads `name`. */
function plugin(
	name: string,
	canonical: string,
	skillText = `Load \`${name}\` with the \`reference\` skill of \`cyber-agentkit\`.\n`,
) {
	put(join(root, 'plugin.json'), '{"name":"demo","version":"1.0.0"}')
	put(join(root, 'references', `${name}.md`), canonical)
	put(join(root, 'skills', 'demo', 'SKILL.md'), `---\nname: demo\ndescription: d\n---\n${skillText}`)
	return join(root, 'skills', 'demo')
}

describe('bundledCopy', () => {
	it('takes default out of an inline extends list, keeping the other plugins', () => {
		expect(bundledCopy('---\nextends: [default, base]\n---\n## A\n\nx\n')).toBe(
			'---\nextends: [base]\n---\n## A\n\nx\n',
		)
	})

	it('drops extends when default was its only entry', () => {
		expect(bundledCopy('---\nextends: [default]\nmerge: patch\n---\n## A\n')).toBe('---\nmerge: patch\n---\n## A\n')
	})

	it('takes default out of a block extends list', () => {
		expect(bundledCopy('---\nextends:\n  - default\n  - base\n---\n## A\n')).toBe(
			'---\nextends:\n  - base\n---\n## A\n',
		)
	})

	it('leaves a document with no frontmatter as it is', () => {
		expect(bundledCopy('## A\n')).toBe('## A\n')
	})
})

describe('bundleDefaults', () => {
	const canonical = '---\nextends: [default]\n---\n## Title\n\n[Bug] <summary>\n'
	const expectedCopy = '## Title\n\n[Bug] <summary>\n'

	it('writes a missing copy in --write mode, and it then checks current', () => {
		const folder = plugin('bug-title', canonical)
		const written = bundleDefaults({ folder, pluginRoot: root, write: true })
		expect(written.entries).toEqual([
			{ name: 'bug-title', state: 'current', file: 'references/bug-title.default.md', written: true },
		])
		expect(readFileSync(join(folder, 'references/bug-title.default.md'), 'utf8')).toBe(bundledCopy(canonical))
		expect(bundleDefaults({ folder, pluginRoot: root, write: false }).ok).toBe(true)
	})

	it('reports a missing copy without writing it when only checking', () => {
		const folder = plugin('bug-title', canonical)
		const report = bundleDefaults({ folder, pluginRoot: root, write: false })
		expect(report.ok).toBe(false)
		expect(report.entries[0]).toEqual({ name: 'bug-title', state: 'missing', file: 'references/bug-title.default.md' })
	})

	it('rewrites a stale copy in --write mode', () => {
		const folder = plugin('bug-title', canonical)
		put(join(folder, 'references/bug-title.default.md'), 'old text\n')
		const report = bundleDefaults({ folder, pluginRoot: root, write: true })
		expect(report.entries[0]).toMatchObject({ state: 'current', written: true })
		expect(readFileSync(join(folder, 'references/bug-title.default.md'), 'utf8')).toBe(expectedCopy)
	})

	it('flags a copy held under the wrong name, and leaves it alone', () => {
		const folder = plugin('bug-title', canonical)
		put(join(folder, 'references/bug-title.md'), 'copy\n')
		const report = bundleDefaults({ folder, pluginRoot: root, write: true })
		expect(report.entries).toEqual([{ name: 'bug-title', state: 'misnamed', file: 'references/bug-title.md' }])
		expect(report.ok).toBe(false)
	})

	it('reports a copy the skill no longer loads as an orphan, and never deletes it', () => {
		const folder = plugin('bug-title', canonical)
		put(join(folder, 'references/retired.default.md'), 'gone\n')
		const report = bundleDefaults({ folder, pluginRoot: root, write: true })
		expect(report.entries).toContainEqual({
			name: 'retired',
			state: 'orphan',
			file: 'references/retired.default.md',
		})
		expect(report.ok).toBe(false)
		expect(readFileSync(join(folder, 'references/retired.default.md'), 'utf8')).toBe('gone\n')
	})

	it('treats a name with no canonical reference in the plugin as unbundled, not a failure', () => {
		const folder = plugin('bug-title', canonical, 'Load `triage` with the `reference` skill of `cyber-agentkit`.\n')
		const report = bundleDefaults({ folder, pluginRoot: root, write: true })
		expect(report.entries).toEqual([{ name: 'triage', state: 'unbundled', file: 'references/triage.default.md' }])
		expect(report.ok).toBe(true)
	})
})

describe('bundleDefaults: an interface the skill loads', () => {
	const iface = '## Steps\n\nRequired.\n'
	const load = 'Load the implementations of the `recipe` interface with the `reference` skill of `cyber-agentkit`.\n'

	it('bundles the interface document as <id>.interface.default.md', () => {
		const folder = plugin('recipe.interface', iface, load)
		const written = bundleDefaults({ folder, pluginRoot: root, write: true })

		expect(written.entries).toEqual([
			{ name: 'recipe.interface', state: 'current', file: 'references/recipe.interface.default.md', written: true },
		])
		expect(readFileSync(join(folder, 'references/recipe.interface.default.md'), 'utf8')).toBe(iface)
	})

	it('reads a skill copy named <id>.interface.md as misnamed, and leaves it alone', () => {
		const folder = plugin('recipe.interface', iface, load)
		put(join(folder, 'references/recipe.interface.md'), iface)
		const report = bundleDefaults({ folder, pluginRoot: root, write: true })

		expect(report.entries).toEqual([
			{ name: 'recipe.interface', state: 'misnamed', file: 'references/recipe.interface.md' },
		])
		expect(report.ok).toBe(false)
	})

	it('reports the interface copy as an orphan once the skill stops loading it', () => {
		const folder = plugin('recipe.interface', iface, load)
		put(join(folder, 'references/recipe.interface.default.md'), iface)
		put(join(folder, 'SKILL.md'), '---\nname: demo\ndescription: d\n---\nNo load line.\n')
		const report = bundleDefaults({ folder, pluginRoot: root, write: false })

		expect(report.entries).toEqual([
			{ name: 'recipe.interface', state: 'orphan', file: 'references/recipe.interface.default.md' },
		])
	})
})

describe('bundleDefaults: dotted names', () => {
	const load = [
		'Load `project-tracker.levels` with the `reference` skill of `cyber-agentkit`.',
		'Load the implementations of the `project-tracker.capabilities` interface with the `reference` skill of `cyber-agentkit`.',
		'',
	].join('\n')

	it('treats the copies of dotted names as current, not orphans, and finds the interface copy', () => {
		const folder = plugin('project-tracker.levels', '## Levels\n', load)
		put(join(root, 'references', 'project-tracker.capabilities.interface.md'), '## Capabilities\n')
		put(join(folder, 'references/project-tracker.levels.default.md'), '## Levels\n')
		put(join(folder, 'references/project-tracker.capabilities.interface.default.md'), '## Capabilities\n')
		const report = bundleDefaults({ folder, pluginRoot: root, write: false })

		expect(report.entries).toEqual([
			{
				name: 'project-tracker.capabilities.interface',
				state: 'current',
				file: 'references/project-tracker.capabilities.interface.default.md',
			},
			{ name: 'project-tracker.levels', state: 'current', file: 'references/project-tracker.levels.default.md' },
		])
		expect(report.ok).toBe(true)
	})
})

describe('pluginRootOf', () => {
	it('finds the nearest folder above a skill that carries a plugin manifest', () => {
		plugin('bug-title', '## Title\n')
		expect(pluginRootOf(join(root, 'skills', 'demo'))).toBe(root)
	})

	it('finds none when no manifest is above the skill', () => {
		put(join(root, 'skills', 'demo', 'SKILL.md'), '---\nname: demo\n---\n')
		expect(pluginRootOf(join(root, 'skills', 'demo'))).toBeUndefined()
	})
})

describe('bundleDefaults: a folder that is not a skill', () => {
	it('bundles the copies an agent definition folder loads, with no SKILL.md', () => {
		put(join(root, 'plugin.json'), '{"name":"demo","version":"1.0.0"}')
		put(join(root, 'references', 'bug-title.md'), '## Title\n\nx\n')
		put(join(root, 'agents', 'filer.md'), 'Load `bug-title` with the `reference` skill of `cyber-agentkit`.\n')
		const folder = join(root, 'agents')
		const report = bundleDefaults({ folder, pluginRoot: root, write: true })
		expect(report.folder).toBe(folder)
		expect(report.entries).toEqual([
			{ name: 'bug-title', state: 'current', file: 'references/bug-title.default.md', written: true },
		])
	})
})
