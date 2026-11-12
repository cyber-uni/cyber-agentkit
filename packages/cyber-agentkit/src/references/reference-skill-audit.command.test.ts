import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceAuditReport } from './reference.command.js'
import { audit, harness, json, plugins, repo, stdout, write } from './reference-command.fixtures.js'

const fileBug = [
	'---',
	'name: file-bug',
	'description: Files a bug. Run `gh issue create` always.',
	'---',
	'',
	'# File a bug',
	'',
	'Run `gh issue create` on GitHub, with the title `[Bug] <summary>`.',
	'Save the report to ~/reports/ and see https://example.com/guide.',
	'',
	'1. Write the test.',
	'2. Make it pass.',
	'3. Refactor.',
	'',
	'Load `bug-title` and `triage` with the `reference` skill of `cyber-agentkit`.',
	'',
].join('\n')

function fileBugSkill(root: string, extra: Record<string, string> = {}): string {
	write(root, 'skills/file-bug/SKILL.md', fileBug)
	write(root, 'skills/file-bug/references/bug-title.default.md', '## Title\n\n[Bug] <summary>\n')
	for (const [path, text] of Object.entries(extra)) write(root, `skills/file-bug/${path}`, text)
	return join(root, 'skills/file-bug')
}

async function report(folder: string, args: Record<string, unknown> = {}): Promise<ReferenceAuditReport> {
	stdout.mockClear()
	expect(await audit(folder, args)).toBe(0)
	return json<ReferenceAuditReport>()
}

describe('reference audit: a skill given by folder', () => {
	it('lists its files with their sizes', async () => {
		const root = repo()
		const folder = fileBugSkill(root)
		const found = await report(folder, { root })
		expect(found.skill).toEqual({ name: 'file-bug', folder })
		expect(found.files).toEqual([
			{ path: 'SKILL.md', bytes: Buffer.byteLength(fileBug) },
			{ path: 'references/bug-title.default.md', bytes: Buffer.byteLength('## Title\n\n[Bug] <summary>\n') },
		])
	})

	it('leads to the host, tool, path, url, and step list, each a candidate with its line', async () => {
		const root = repo()
		const found = await report(fileBugSkill(root), { root })
		const leads = found.leads.map(({ file, line, category, kind, match }) => ({ file, line, category, kind, match }))
		expect(leads).toEqual(
			expect.arrayContaining([
				{ file: 'SKILL.md', line: 8, category: 'provider', kind: 'host', match: 'GitHub' },
				{ file: 'SKILL.md', line: 8, category: 'tool', kind: 'command', match: 'gh issue create' },
				{ file: 'SKILL.md', line: 9, category: 'environment', kind: 'path', match: '~/reports/' },
				{ file: 'SKILL.md', line: 9, category: 'environment', kind: 'url', match: 'https://example.com/guide' },
				{ file: 'SKILL.md', line: 11, category: 'workflow', kind: 'steps', match: '1. Write the test.' },
			]),
		)
		for (const lead of found.leads) {
			expect((lead as Record<string, unknown>)['verdict'], 'a lead carries no verdict').toBeUndefined()
			expect(lead.status).toBe('candidate')
		}
		expect(found.leads.find(({ kind }) => kind === 'steps')).toMatchObject({ lines: 3 })
	})

	it('leaves the frontmatter and the skill’s own defaults out of the leads', async () => {
		const root = repo()
		const folder = fileBugSkill(root, { 'references/host.default.md': 'Run `gh pr create` on GitHub.\n' })
		const found = await report(folder, { root })
		expect(found.leads.some(({ line, file }) => file === 'SKILL.md' && line <= 5)).toBe(false)
		expect(found.leads.some(({ file }) => file.endsWith('.default.md'))).toBe(false)
	})

	it('lists the references it loads, which ship a default, and which have none', async () => {
		const root = repo()
		const found = await report(fileBugSkill(root), { root })
		expect(found.loads).toEqual([
			{ name: 'bug-title', default: true, status: 'found', answeredBy: ['default'], defaultAnswers: true },
			{ name: 'triage', default: false, status: 'missing', answeredBy: [], defaultAnswers: false },
		])
		expect(found.gaps).toEqual(['triage'])
	})

	it('names the tiers that answer a load, and says the default no longer answers alone', async () => {
		const root = repo()
		plugins(root, { other: { 'bug-title': '## Title\n\nplugin title\n' } })
		write(root, '.agents/references/bug-title.md', '## Title\n\nmine\n')
		const found = await report(fileBugSkill(root), { root })
		expect(found.loads?.[0]).toMatchObject({ name: 'bug-title', default: true, defaultAnswers: false })
		expect(found.loads?.[0]?.answeredBy).toContain('repo')
	})

	it('reads an interface load as an interface, not as a reference with a gap', async () => {
		const root = repo()
		write(
			root,
			'skills/s/SKILL.md',
			'---\nname: s\ndescription: d\n---\n\nLoad the implementations of the `project-tracker` interface with the `reference` skill of `cyber-agentkit`.\n',
		)
		const found = await report(join(root, 'skills/s'), { root })
		expect(found.interfaces).toEqual(['project-tracker'])
		expect(found.loads).toBeUndefined()
		expect(found.gaps).toBeUndefined()
	})

	it('says whether the folder is the author’s to edit: not when it is an installed copy', async () => {
		const root = repo()
		expect((await report(fileBugSkill(root), { root })).editable).toBe(true)
		write(root, 'node_modules/p/skills/s/SKILL.md', '---\nname: s\ndescription: d\n---\n\nRun `gh pr create`.\n')
		const installed = await report(join(root, 'node_modules/p/skills/s'), { root })
		expect(installed.editable).toBe(false)
		expect(installed.leads.length).toBeGreaterThan(0)
	})

	it('adds the terms --also names as provider leads, so the list extends without a code change', async () => {
		const root = repo()
		write(root, 'skills/s/SKILL.md', '---\nname: s\ndescription: d\n---\n\nPost to Teamwork.\n')
		const folder = join(root, 'skills/s')
		expect((await report(folder, { root })).leads ?? []).toEqual([])
		const found = await report(folder, { root, also: ['Teamwork'] })
		expect(found.leads).toMatchObject([{ line: 6, category: 'provider', kind: 'term', match: 'Teamwork' }])
	})

	it('changes no file', async () => {
		const root = repo()
		const folder = fileBugSkill(root)
		await report(folder, { root })
		expect(readFileSync(join(folder, 'SKILL.md'), 'utf8')).toBe(fileBug)
	})
})

describe('reference audit: a skill given by name', () => {
	it('finds an installed skill by its name', async () => {
		const root = repo()
		harness.candidates = ['claude-code']
		write(root, '.claude/skills/file-bug/SKILL.md', fileBug)
		const found = await report('file-bug', { root })
		expect(found.skill.name).toBe('file-bug')
		expect(found.skill.folder).toContain('file-bug')
	})

	it('fails with the folders when two skills share the name, and with no folder when none does', async () => {
		const root = repo()
		harness.candidates = ['claude-code']
		write(root, '.claude/skills/a/SKILL.md', '---\nname: dup\ndescription: d\n---\n')
		write(root, '.claude/skills/b/SKILL.md', '---\nname: dup\ndescription: d\n---\n')
		expect(await audit('dup', { root })).toBe(1)
		expect(json<{ code: string; details: { folders: string[] } }>()).toMatchObject({ code: 'skill-ambiguous' })
		stdout.mockClear()
		expect(await audit('nothing', { root })).toBe(2)
		expect(json<{ code: string }>().code).toBe('skill-not-found')
	})
})
