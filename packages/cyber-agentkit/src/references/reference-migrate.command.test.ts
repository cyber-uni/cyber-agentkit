import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceMigrateReport } from './reference.command.js'
import {
	base,
	fakeHome,
	json,
	lastError,
	load,
	migrate,
	plugins,
	repo,
	stdout,
	write,
	written,
} from './reference-command.fixtures.js'

describe('migrate', () => {
	it('prints the plan in text and writes nothing, exit 0 (R121)', async () => {
		const root = repo()
		const path = write(root, '.agents/references/name.md', '---\nmerge: merge-sections\n---\n\n## Create\n\nmine\n')

		expect(await migrate(undefined, { root })).toBe(0)
		expect(written()).toBe(
			`${path} (repo): merge-sections: merge: merge-sections → no merge: patch is the default\n\n1 change to make; run \`reference migrate --write\` with the same arguments to apply it.\n`,
		)
		expect(readFileSync(path, 'utf8')).toMatch(/merge-sections/)
	})

	it('applies the plan with --write and returns it, marking a user file as one no git history restores', async () => {
		const root = repo()
		const path = write(fakeHome.value, '.agents/references/name.md', '---\nmerge: first-wins\n---\n\nmine\n')

		expect(await migrate(undefined, { root, write: true })).toBe(0)
		expect(written()).toBe(
			'~/.agents/references/name.md (user): first-wins: merge: first-wins → merge: replace; a user file, which no git history restores\n\nmigrated 1 change.\n',
		)
		expect(readFileSync(path, 'utf8')).toBe('---\nmerge: replace\n---\n\nmine\n')
	})

	it('gives the plan as a record in json, with written set once applied', async () => {
		const root = repo()
		plugins(root, { a: { new: base } })
		write(root, 'node_modules/a/references/_renames.yaml', 'old: new\n')
		write(root, '.agents/references/old.md', '## Create\n\nmine\n')

		expect(await migrate(['new'], { root, format: 'json', write: true })).toBe(0)
		expect(json<ReferenceMigrateReport>()).toEqual({
			changes: [
				{
					path: join(root, '.agents/references/old.md'),
					tier: 'repo',
					name: 'old',
					form: 'renamed',
					from: 'old.md',
					to: 'new.md',
					by: "plugin a's _renames.yaml",
				},
			],
			written: true,
		})
		stdout.mockClear()
		expect(await load(['new'], { root })).toBe(0)
		expect(written()).toBe('## Create\n\nmine\n\n## Close\n\nbase close\n')
	})

	it('answers an explicit zero when there is nothing to migrate (UC22.1)', async () => {
		const root = repo()

		expect(await migrate(undefined, { root })).toBe(0)
		expect(written()).toMatch(/^empty: 0 changes/)
	})

	it('says a manual row needs a person', async () => {
		const root = repo()
		write(root, 'pkg/.agents/references/name.md', '---\nextends: [a]\n---\n')

		expect(await migrate(undefined, { root, write: true })).toBe(0)
		expect(written()).toMatch(
			/\(project pkg\): project-selection: extends: \[a\]: manual: .*reference customize name --extends a/,
		)
		expect(written()).toMatch(/nothing to apply\. 1 needs a person, as each says\./)
	})

	it('refuses --plugin with --default as a usage error, exit 2', async () => {
		const root = repo()

		expect(await migrate(undefined, { root, plugin: root, default: root })).toBe(2)
		expect(lastError().code).toBe('options-conflict')
	})

	it('refuses a plugin folder that is not one, exit 1 (UC22.8)', async () => {
		const root = repo()

		expect(await migrate(undefined, { root, plugin: root })).toBe(1)
		expect(lastError().code).toBe('folder-invalid')
	})
})
