import { describe, expect, it } from 'vitest'
import { lookupInterface, normalizeInterfaceId } from './interface-lookup.js'

describe('normalizeInterfaceId', () => {
	it('reads case and `-`, `_`, `.` alike', () => {
		expect(normalizeInterfaceId('Project_Tracker.Capabilities')).toBe('project-tracker-capabilities')
	})
})

describe('lookupInterface', () => {
	const registry = [
		{ id: 'project-tracker', description: 'Where a project files and tracks its issues.' },
		{ id: 'change-request-host', description: 'Where a change is proposed and reviewed as a pull request.' },
		{ id: 'deploy-gate' },
	]

	it('finds the same id after normalizing', () => {
		const lookup = lookupInterface('Project_Tracker', undefined, registry)
		expect(lookup.same?.id).toBe('project-tracker')
		expect(lookup.compared).toBe(3)
	})

	it('lists an id sharing words, with the words it shares', () => {
		expect(lookupInterface('issue-tracker', undefined, registry).near).toEqual([
			{ id: 'project-tracker', description: registry[0]?.description, reasons: ['the id shares the word `tracker`'] },
		])
	})

	it('lists an id that differs by plural or a small spelling change', () => {
		expect(lookupInterface('deploy-gates', undefined, registry).near[0]?.reasons).toEqual([
			'the id differs only by plural',
		])
		expect(lookupInterface('deploi-gate', undefined, registry).near[0]?.reasons).toEqual([
			'the id differs by a small spelling change',
		])
	})

	it('lists a description sharing most of its meaningful words, and gives every reason', () => {
		const { same, near } = lookupInterface('pull-request-host', 'Where a change is proposed and reviewed.', registry)
		expect(same).toBeUndefined()
		expect(near).toEqual([
			{
				id: 'change-request-host',
				description: registry[1]?.description,
				reasons: [
					'the id shares the words `request`, `host`',
					'the description shares 4 of 4 meaningful words: `where`, `change`, `proposed`, `reviewed`',
				],
			},
		])
	})

	it('finds nothing close for a new name, and never treats a near match as the same', () => {
		expect(lookupInterface('release-notes-source', "Where a release's notes come from.", registry)).toEqual({
			near: [],
			compared: 3,
		})
	})
})
