import { describe, expect, it } from 'vitest'
import {
	blueprintSystemOf,
	capabilityEntryLinks,
	capabilityEntryText,
	parseCapabilityEntry,
} from './capability-entry.js'

describe('parseCapabilityEntry', () => {
	it('accepts an entry with only a system', () => {
		expect(parseCapabilityEntry('---\nsystem: asana\n---\n', 'asana')).toEqual({
			entry: { system: 'asana' },
			problems: [],
		})
	})

	it('reads the plugins that ship the capability reference, the blueprints on it, and the body', () => {
		const text = [
			'---',
			'system: asana',
			'description: Asana, a work-management service.',
			'plugins: [{name: cyber-asana, url: "https://github.com/x/cyber-asana"}]',
			'blueprints:',
			'  - project-tracker.blueprints.asana.sections',
			'  - {name: project-tracker.blueprints.asana.custom-field, url: "https://example.com/cf.md"}',
			'tags: [tracker]',
			'status: draft',
			'---',
			'',
			'How the blueprints differ.',
			'',
		].join('\n')
		const { entry, problems } = parseCapabilityEntry(text, 'asana')
		expect(problems).toEqual([])
		expect(entry).toEqual({
			system: 'asana',
			description: 'Asana, a work-management service.',
			plugins: [{ name: 'cyber-asana', url: 'https://github.com/x/cyber-asana' }],
			blueprints: [
				{ name: 'project-tracker.blueprints.asana.sections' },
				{ name: 'project-tracker.blueprints.asana.custom-field', url: 'https://example.com/cf.md' },
			],
			tags: ['tracker'],
			status: 'draft',
			body: 'How the blueprints differ.',
		})
		expect(capabilityEntryLinks(entry)).toEqual([
			{ field: 'plugins cyber-asana', url: 'https://github.com/x/cyber-asana' },
			{ field: 'blueprints project-tracker.blueprints.asana.custom-field', url: 'https://example.com/cf.md' },
		])
	})

	it('names each problem: a missing or dotted system, a file name mismatch, an unknown field', () => {
		expect(parseCapabilityEntry('---\ndescription: x\n---\n', 'asana').problems).toEqual(['`system` is missing'])
		expect(parseCapabilityEntry('---\nsystem: asana.cloud\n---\n').problems).toEqual([
			'`system` `asana.cloud` is not one name segment: use letters, digits, and `-` or `_` between them, no dot',
		])
		expect(parseCapabilityEntry('---\nsystem: jira\n---\n', 'asana').problems).toEqual([
			'`system` `jira` does not match the file name `asana.md`',
		])
		expect(parseCapabilityEntry('---\nsystem: asana\ninterface: x\n---\n', 'asana').problems).toEqual([
			'`interface` is not an entry field',
		])
	})

	it('fails a blueprint that is not named for this system', () => {
		const text = '---\nsystem: asana\nblueprints: [project-tracker.blueprints.jira.epics, asana-sections]\n---\n'
		expect(parseCapabilityEntry(text, 'asana').problems).toEqual([
			'`blueprints` entry `project-tracker.blueprints.jira.epics` is not a blueprint of `asana`: name it `<interface>.blueprints.asana.<solution>`',
			'`blueprints` entry `asana-sections` is not a blueprint of `asana`: name it `<interface>.blueprints.asana.<solution>`',
		])
	})
})

describe('blueprintSystemOf', () => {
	it('reads the system after the last `.blueprints.`, and needs a solution', () => {
		expect(blueprintSystemOf('project-tracker.blueprints.asana.sections')).toBe('asana')
		expect(blueprintSystemOf('a.blueprints.b.blueprints.gitlab.epics.v2')).toBe('gitlab')
		expect(blueprintSystemOf('project-tracker.blueprints.asana')).toBeUndefined()
		expect(blueprintSystemOf('asana.capabilities')).toBeUndefined()
	})
})

describe('capabilityEntryText', () => {
	it('writes the header in field order, then the body, and reads back the same', () => {
		const entry = {
			system: 'gitlab',
			status: 'draft',
			blueprints: [{ name: 'project-tracker.blueprints.gitlab.issues' }],
			plugins: [{ name: 'repobuddy' }],
			body: 'Why.',
		}
		const text = capabilityEntryText(entry)
		expect(text).toBe(
			'---\nsystem: gitlab\nplugins:\n  - name: repobuddy\nblueprints:\n  - name: project-tracker.blueprints.gitlab.issues\nstatus: draft\n---\n\nWhy.\n',
		)
		expect(parseCapabilityEntry(text, 'gitlab')).toEqual({ entry, problems: [] })
	})
})
