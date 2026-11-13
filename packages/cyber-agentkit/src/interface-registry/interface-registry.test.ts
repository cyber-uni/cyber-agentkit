import { describe, expect, it } from 'vitest'
import { listing, registryHost, respond } from './interface-registry.fixtures.js'
import { type RegistryFetch, RegistryUnreachable, readInterfaceRegistry } from './interface-registry.js'

describe('readInterfaceRegistry', () => {
	it('reads every Markdown entry in the folder, sorted, and names entries with problems', async () => {
		const read = await readInterfaceRegistry(
			registryHost({
				'b.md': '---\nid: b\n---\n',
				'a.md': '---\nid: a\ndescription: An a.\n---\n',
				'README.txt': 'skip me',
				'c.md': '---\nid: wrong\n---\n',
			}),
		)
		expect(read.entries).toEqual([{ id: 'a', description: 'An a.' }, { id: 'b' }, { id: 'wrong' }])
		expect(read.invalid).toEqual([{ id: 'c', problems: ['`id` `wrong` does not match the file name `c.md`'] }])
	})

	it('reads a registry folder that does not exist yet as empty', async () => {
		expect(await readInterfaceRegistry(async () => respond(404, {}))).toEqual({ entries: [], invalid: [] })
	})

	it('throws RegistryUnreachable with no network, or when GitHub refuses', async () => {
		const offline: RegistryFetch = async () => {
			throw new TypeError('fetch failed')
		}
		await expect(readInterfaceRegistry(offline)).rejects.toThrow(
			new RegistryUnreachable('cannot reach GitHub: fetch failed'),
		)
		await expect(readInterfaceRegistry(async () => respond(403, {}))).rejects.toBeInstanceOf(RegistryUnreachable)
		await expect(readInterfaceRegistry(async () => respond(200, { not: 'a list' }))).rejects.toBeInstanceOf(
			RegistryUnreachable,
		)
		const entryFails: RegistryFetch = async (url) => {
			if (url === listing) return respond(200, [{ type: 'file', name: 'a.md', download_url: 'https://raw.test/a.md' }])
			throw new TypeError('socket hang up')
		}
		await expect(readInterfaceRegistry(entryFails)).rejects.toBeInstanceOf(RegistryUnreachable)
	})
})
