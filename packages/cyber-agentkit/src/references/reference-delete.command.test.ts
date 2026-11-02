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

	it('says when a selection went with the file, naming customize --extends, and gives the options it leaves (UC11.4)', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: base } })
		write(root, '.agents/references/name.md', '---\nextends: [a]\n---\n\n## Create\n\nmine\n')

		expect(await remove('name', { root })).toBe(0)
		expect(written()).toMatch(
			/deleted\. "name" is ambiguous: .* Also, the selection extends: \[a\] went with it; run `reference customize name --extends a` to restore it\./,
		)
		expect(written()).not.toMatch(/select /)
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

	it('deletes a non-Markdown file with its metadata file, and a metadata file alone by itself (R95, UC11.6)', async () => {
		const root = repo()
		const data = write(root, '.agents/references/conf.json', '{}\n')
		const meta = write(root, '.agents/references/conf.meta.md', '---\ndescription: d\nextends: [a]\n---\n')

		expect(await remove('conf', { root, format: 'json' })).toBe(0)
		expect(existsSync(data)).toBe(false)
		expect(existsSync(meta)).toBe(false)
		expect(json<ReferenceDeleteReport>()).toMatchObject({
			path: data,
			metadataFile: meta,
			selection: expect.any(String),
		})

		const alone = write(root, '.agents/references/pick.meta.md', '---\nextends: [a]\n---\n')
		stdout.mockClear()
		expect(await remove('pick', { root })).toBe(0)
		expect(existsSync(alone)).toBe(false)
		expect(written()).toMatch(/selection extends: \[a\] went with it/)
	})

	it('deletes the <name>/README.md that answers in a plugin folder (J7)', async () => {
		const root = repo()
		const plugin = join(root, 'plugins/house')
		write(plugin, 'plugin.json', JSON.stringify({ name: 'house' }))
		const readme = write(plugin, 'references/name/README.md', 'x\n')

		expect(await remove('name', { root, plugin })).toBe(0)
		expect(existsSync(readme)).toBe(false)
	})

	it('deletes a folder’s project section with --in, saying what answers now', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		const path = write(root, 'packages/app/.agents/references/name.md', '## Create\n\napp\n')

		expect(await remove('name', { root, in: join(root, 'packages/app'), format: 'json' })).toBe(0)
		expect(existsSync(path)).toBe(false)
		expect(json<ReferenceDeleteReport>()).toMatchObject({
			path,
			folder: 'packages/app',
			status: 'found',
			answer: '"name" is answered by plugin a, on the stack a.',
		})

		stdout.mockClear()
		expect(await remove('name', { root, in: join(root, 'packages/app') })).toBe(0)
		expect(written()).toMatch(/no-file: .*there is no project section for packages\/app of "name" to delete/)
	})

	it('reports the project sections that still answer', async () => {
		const root = repo()
		write(root, '.agents/references/name.md', 'main\n')
		write(root, 'app/.agents/references/name.md', 'app\n')

		expect(await remove('name', { root })).toBe(0)
		expect(written()).toMatch(/"name" is answered only by the project sections of app\./)
	})

	it('refuses --in outside the root or missing, before reading the root', async () => {
		const root = repo()
		expect(await remove('name', { root: join(root, 'gone'), in: root })).toBe(2)
		expect(lastError().code).toBe('in-not-below-root')
		expect(await remove('name', { root, in: join(root, 'missing') })).toBe(1)
		expect(lastError().code).toBe('in-folder-missing')
		expect(await remove('name', { root, in: join(root, 'app'), scope: 'user' })).toBe(2)
		expect(lastError().code).toBe('options-conflict')
	})
})
