import { describe, expect, it } from 'vitest'
import { interfaceEntryLinks, interfaceEntryText, parseInterfaceEntry } from './interface-entry.js'

describe('parseInterfaceEntry', () => {
	it('accepts an entry with only an id', () => {
		expect(parseInterfaceEntry('---\nid: release-notes-source\n---\n', 'release-notes-source')).toEqual({
			entry: { id: 'release-notes-source' },
			problems: [],
		})
	})

	it('reads every optional field and the body', () => {
		const text = [
			'---',
			'id: project-tracker',
			'description: Where a project keeps its issues.',
			'plugins: [{name: repobuddy, url: "https://github.com/x/repobuddy"}]',
			'implementations: [github, {name: gitlab, url: "https://example.com/gitlab"}]',
			'usage: [repobuddy:issue]',
			'tags: [tracker, issues]',
			'status: stable',
			'interface: https://example.com/project-tracker.interface.md',
			'---',
			'',
			'Why it exists.',
			'',
		].join('\n')
		const { entry, problems } = parseInterfaceEntry(text, 'project-tracker')
		expect(problems).toEqual([])
		expect(entry).toEqual({
			id: 'project-tracker',
			description: 'Where a project keeps its issues.',
			plugins: [{ name: 'repobuddy', url: 'https://github.com/x/repobuddy' }],
			implementations: [{ name: 'github' }, { name: 'gitlab', url: 'https://example.com/gitlab' }],
			usage: [{ name: 'repobuddy:issue' }],
			tags: ['tracker', 'issues'],
			status: 'stable',
			interface: 'https://example.com/project-tracker.interface.md',
			body: 'Why it exists.',
		})
		expect(interfaceEntryLinks(entry).map(({ field }) => field)).toEqual([
			'plugins repobuddy',
			'implementations gitlab',
			'interface',
		])
	})

	it('names each problem: a missing id, a file name mismatch, an unknown field, and a malformed list', () => {
		expect(parseInterfaceEntry('no header', 'x').problems).toEqual(['the entry has no `---` header', '`id` is missing'])
		expect(parseInterfaceEntry('---\nid: a\nowner: me\ntags: nope\n---\n', 'b').problems).toEqual([
			'`id` `a` does not match the file name `b.md`',
			'`owner` is not an entry field',
			'`tags` is not a list of words',
		])
		expect(parseInterfaceEntry('---\nid: a b\nplugins: x\n---\n').problems).toEqual([
			'`id` `a b` holds a character other than letters, digits, `-`, `_`, or `.`',
			'`plugins` is not a list',
		])
		expect(parseInterfaceEntry('---\n: [\n---\n').problems[0]).toBe('the header is not valid YAML')
	})
})

describe('interfaceEntryText', () => {
	it('writes the header in field order, then the body, and reads back the same', () => {
		const entry = { id: 'a', tags: ['t'], description: 'd', body: 'Body.' }
		const text = interfaceEntryText(entry)
		expect(text).toBe('---\nid: a\ndescription: d\ntags:\n  - t\n---\n\nBody.\n')
		expect(parseInterfaceEntry(text, 'a').entry).toEqual(entry)
	})
})
