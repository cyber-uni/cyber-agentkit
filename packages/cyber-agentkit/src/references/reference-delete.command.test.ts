import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceDeleteReport } from './reference.command.js'
import {
	base,
	failure,
	fakeHome,
	json,
	lastError,
	plugins,
	remove,
	repo,
	skill,
	stdout,
	write,
	written,
} from './reference-command.fixtures.js'

describe('delete', () => {
	it('deletes the repo file and reports the status and stack afterwards', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		const path = write(root, '.agents/references/name.md', '## Create\n\nmine\n')

		expect(await remove('name', { root, format: 'json' })).toBe(0)
		expect(existsSync(path)).toBe(false)
		expect(json<ReferenceDeleteReport>()).toEqual({
			path,
			status: 'found',
			stack: ['a'],
			answer: '"name" is answered by plugin a, on the stack a.',
		})
	})

	it('says when a selection went with the file, naming reference select, and gives the options it leaves', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: base } })
		write(root, '.agents/references/name.md', '---\nextends: [a]\n---\n\n## Create\n\nmine\n')

		expect(await remove('name', { root })).toBe(0)
		expect(written()).toMatch(
			/deleted\. "name" is ambiguous: .* Also, the selection extends: \[a\] went with it; run `reference select name <option>\.\.\.` to restore it\./,
		)
	})

	it('answers with a no-file notice when no file is there, exit 0, saying what answers now (R30)', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })

		expect(await remove('name', { root })).toBe(0)
		expect(written()).toMatch(/no-file: .*does not exist.*nothing was deleted\. "name" is answered by plugin a/)
		stdout.mockClear()
		expect(await remove('name', { root, format: 'json' })).toBe(0)
		expect(json()).toMatchObject({ code: 'no-file', status: 'found' })
	})

	it('prints the answer afterwards with --dry-run, deleting nothing', async () => {
		const root = repo()
		const path = write(fakeHome.value, '.agents/references/name.md', 'user\n')
		write(root, '.agents/references/name.md', 'project\n')

		expect(await remove('name', { root, scope: 'user', 'dry-run': true })).toBe(0)
		expect(existsSync(path)).toBe(true)
		expect(written()).toMatch(/would delete\. "name" is answered by the repo file/)
	})

	it('deletes a folder-form file and its emptied folder', async () => {
		const root = repo()
		const path = write(root, '.agents/references/name/README.md', 'folder\n')

		expect(await remove('name', { root })).toBe(0)
		expect(existsSync(dirname(path))).toBe(false)
	})

	it('acts on a plugin or a skill source folder with --plugin or --default', async () => {
		const root = repo()
		const plugin = join(root, 'plugins/house')
		write(plugin, 'plugin.json', JSON.stringify({ name: 'house' }))
		const pluginFile = write(plugin, 'references/name.md', 'x\n')
		const folder = skill(root, 'skills/tracker', { name: 'd\n' })

		expect(await remove('name', { root, plugin })).toBe(0)
		expect(existsSync(pluginFile)).toBe(false)
		expect(await remove('name', { root, default: folder })).toBe(0)
		expect(existsSync(join(folder, 'references/name.default.md'))).toBe(false)
	})

	it('refuses a qualified name, and exits 2 on conflicting places', async () => {
		const root = repo()
		expect(await remove('a/name', { root })).toBe(2)
		expect(lastError().code).toBe('reference-qualified')
		expect(await remove('name', { root, scope: 'user', default: root })).toBe(2)
		expect(lastError().code).toBe('options-conflict')
	})

	it('reports a thrown failure', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', 'x\n')
		failure.value = 'nope'
		expect(await remove('name', { root })).toBe(1)
		expect(lastError()).toEqual({ error: 'Reference deletion failed.', code: 'error' })
	})
})
