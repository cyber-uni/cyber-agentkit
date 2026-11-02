import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceSelectReport } from './reference.command.js'
import { base, errors, fakeHome, json, plugins, repo, select, write, written } from './reference-command.fixtures.js'

describe('select', () => {
	it('writes extends listing the options bottom first, and reports what answers', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: '## Create\n\nb\n' } })

		expect(await select('name', ['a', 'b/name'], { root })).toBe(0)
		expect(readFileSync(join(root, '.agents/references/name.md'), 'utf8')).toBe('---\nextends: [a, b]\n---\n')
		expect(written()).toMatch(/extends: \[a, b\]\. "name" is answered by plugin b, on the stack a → b\./)
	})

	it('keeps the body and other keys, changing only extends', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { name: base } })
		const path = write(
			root,
			'.agents/references/name.md',
			'---\ndescription: mine\nextends: [a]\n---\n\n## Create\n\nmine\n',
		)

		expect(await select('name', ['b', 'default'], { root, format: 'json' })).toBe(0)
		expect(readFileSync(path, 'utf8')).toBe('---\ndescription: mine\nextends: [b, default]\n---\n\n## Create\n\nmine\n')
		expect(json<ReferenceSelectReport>()).toMatchObject({ extends: ['b', 'default'], status: 'found', stack: ['b'] })
	})

	it('writes to the user tier with --scope user', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		expect(await select('name', ['a'], { root, scope: 'user' })).toBe(0)
		expect(existsSync(join(fakeHome.value, '.agents/references/name.md'))).toBe(true)
	})

	it('refuses an option that is neither default nor a plugin holding the name, writing nothing', async () => {
		const root = repo()
		plugins(root, { a: { name: base }, b: { other: 'x\n' } })

		expect(await select('name', ['b'], { root })).toBe(1)
		expect(errors()).toMatch(
			/error: option-invalid: b is neither default nor a plugin holding "name"; the plugins holding it are a\./,
		)
		expect(existsSync(join(root, '.agents/references/name.md'))).toBe(false)
	})

	it('refuses a qualified name, and exits 2 with no option', async () => {
		const root = repo()
		expect(await select('a/name', ['a'], { root })).toBe(1)
		expect(await select('name', [], { root })).toBe(2)
	})

	it('removes extends with --clear, deleting a file left with nothing in it', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })
		const empty = write(root, '.agents/references/name.md', '---\nextends: [a]\n---\n')
		const kept = write(root, '.agents/references/other.md', '---\nextends: [a]\n---\n\nbody\n')

		expect(await select('name', [], { root, clear: true })).toBe(0)
		expect(existsSync(empty)).toBe(false)
		expect(written()).toMatch(/selection cleared; the file was left empty and deleted/)
		expect(await select('other', [], { root, clear: true, format: 'json' })).toBe(0)
		expect(readFileSync(kept, 'utf8')).toBe('body\n')
	})

	it('fails --clear with no selection, stating what answers the name now', async () => {
		const root = repo()
		plugins(root, { a: { name: base } })

		expect(await select('name', [], { root, clear: true })).toBe(1)
		expect(errors()).toMatch(
			/error: no-selection: the project tier holds no selection of "name"\. "name" is answered by plugin a/,
		)
		expect(await select('name', ['a'], { root, clear: true })).toBe(2)
	})
})
