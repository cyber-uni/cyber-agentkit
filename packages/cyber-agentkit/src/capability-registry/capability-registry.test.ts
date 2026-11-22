import { describe, expect, it } from 'vitest'
import { registryHost, respond } from '../interface-registry/interface-registry.fixtures.js'
import { lookupCapability, readCapabilityRegistry } from './capability-registry.js'

describe('readCapabilityRegistry', () => {
	it('reads every system entry from the capability folder, sorted, and names entries with problems', async () => {
		const read = await readCapabilityRegistry(
			registryHost(
				{ 'asana.md': '---\nid: asana\n---\n' },
				{
					'jira.md': '---\nsystem: jira\n---\n',
					'asana.md': '---\nsystem: asana\ndescription: Asana.\n---\n',
					'gitlab.md': '---\nsystem: github\n---\n',
				},
			),
		)
		expect(read.entries).toEqual([{ system: 'asana', description: 'Asana.' }, { system: 'github' }, { system: 'jira' }])
		expect(read.invalid).toEqual([
			{ id: 'gitlab', problems: ['`system` `github` does not match the file name `gitlab.md`'] },
		])
	})

	it('reads a capability folder that does not exist yet as empty', async () => {
		expect(await readCapabilityRegistry(async () => respond(404, {}))).toEqual({ entries: [], invalid: [] })
	})
})

describe('lookupCapability', () => {
	const entries = [{ system: 'gitlab', description: 'GitLab, a code host with issues and epics.' }, { system: 'asana' }]

	it('finds the same system once normalized', () => {
		expect(lookupCapability('GitLab', undefined, entries).same).toEqual(entries[0])
	})

	it('lists a near system with why, and never decides it is the same', () => {
		const found = lookupCapability('gitlab-self-hosted', undefined, entries)
		expect(found.same).toBeUndefined()
		expect(found.near).toEqual([
			{ id: 'gitlab', description: entries[0]?.description, reasons: ['the id shares the word `gitlab`'] },
		])
		expect(found.compared).toBe(2)
	})
})
