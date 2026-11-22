import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ReferenceAdviseReport, ReferenceAuditReport, ReferenceUsesReport } from './reference.command.js'
import { advise, audit, json, plugins, repo, stderr, stdout, uses, write } from './reference-command.fixtures.js'

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

async function adviceFor(paths: string[], args: Record<string, unknown> = {}): Promise<ReferenceAdviseReport> {
	stdout.mockClear()
	expect(await advise(paths, args)).toBe(0)
	return json<ReferenceAdviseReport>()
}

async function usesOf(paths: string[], args: Record<string, unknown> = {}): Promise<ReferenceUsesReport> {
	stdout.mockClear()
	expect(await uses(paths, args)).toBe(0)
	return json<ReferenceUsesReport>()
}

describe('reference advise', () => {
	it('lists the text files it read, with their sizes, leaving bundled default copies out', async () => {
		const root = repo()
		const folder = fileBugSkill(root)
		const found = await adviceFor([folder])
		expect(found.files).toEqual([{ path: `${folder}/SKILL.md`, bytes: Buffer.byteLength(fileBug) }])
	})

	it('leads to the host, tool, path, url, and step list, each a candidate with its line', async () => {
		const root = repo()
		const folder = fileBugSkill(root)
		const found = await adviceFor([folder])
		const leads = found.leads.map(({ file, line, category, kind, match }) => ({ file, line, category, kind, match }))
		const file = `${folder}/SKILL.md`
		expect(leads).toEqual(
			expect.arrayContaining([
				{ file, line: 8, category: 'provider', kind: 'host', match: 'GitHub' },
				{ file, line: 8, category: 'tool', kind: 'command', match: 'gh issue create' },
				{ file, line: 9, category: 'environment', kind: 'path', match: '~/reports/' },
				{ file, line: 9, category: 'environment', kind: 'url', match: 'https://example.com/guide' },
				{ file, line: 11, category: 'workflow', kind: 'steps', match: '1. Write the test.' },
			]),
		)
		for (const lead of found.leads) {
			expect((lead as Record<string, unknown>)['verdict'], 'a lead carries no verdict').toBeUndefined()
			expect(lead.status).toBe('candidate')
		}
		expect(found.leads.find(({ kind }) => kind === 'steps')).toMatchObject({ lines: 3 })
	})

	it('reads every line, front matter included, since it does not know what kind of file it reads', async () => {
		const root = repo()
		const found = await adviceFor([fileBugSkill(root)])
		expect(found.leads).toEqual(
			expect.arrayContaining([expect.objectContaining({ line: 3, kind: 'command', match: 'gh issue create' })]),
		)
	})

	it('works on any text an agent reads: an AGENTS.md and an agent definition, given as files', async () => {
		const root = repo()
		const agents = write(root, 'AGENTS.md', '# Guide\n\nOpen pull requests on GitLab with `glab mr create`.\n')
		const agent = write(root, 'agents/triager.md', '---\nname: triager\n---\n\nFile each bug in Jira.\n')
		const found = await adviceFor([agents, agent])
		expect(found.files.map(({ path }) => path)).toEqual([agents, agent])
		expect(found.leads.map(({ file, match }) => ({ file, match }))).toEqual(
			expect.arrayContaining([
				{ file: agents, match: 'GitLab' },
				{ file: agents, match: 'glab mr create' },
				{ file: agent, match: 'Jira' },
			]),
		)
	})

	it('says whether the text is the author’s to edit: not when it is an installed copy', async () => {
		const root = repo()
		expect((await adviceFor([fileBugSkill(root)])).editable).toBe(true)
		write(root, 'node_modules/p/skills/s/SKILL.md', '---\nname: s\ndescription: d\n---\n\nRun `gh pr create`.\n')
		const installed = await adviceFor([join(root, 'node_modules/p/skills/s')])
		expect(installed.editable).toBe(false)
		expect(installed.leads.length).toBeGreaterThan(0)
	})

	it('adds the terms --also names as provider leads, so the list extends without a code change', async () => {
		const root = repo()
		const file = write(root, 'AGENTS.md', 'Post to Teamwork.\n')
		expect((await adviceFor([file])).leads ?? []).toEqual([])
		const found = await adviceFor([file], { also: ['Teamwork'] })
		expect(found.leads).toMatchObject([{ line: 1, category: 'provider', kind: 'term', match: 'Teamwork' }])
	})

	it('reports no loads: those are what `uses` lists', async () => {
		const root = repo()
		const found = (await adviceFor([fileBugSkill(root)])) as Record<string, unknown>
		expect(found['loads']).toBeUndefined()
		expect(found['gaps']).toBeUndefined()
	})

	it('fails as a usage error on a path where nothing is, and takes no skill name', async () => {
		const root = repo()
		fileBugSkill(root)
		stdout.mockClear()
		expect(await advise(['file-bug'])).toBe(2)
		expect(json<{ code: string }>().code).toBe('path-not-found')
	})

	it('changes no file', async () => {
		const root = repo()
		const folder = fileBugSkill(root)
		await adviceFor([folder])
		expect(readFileSync(join(folder, 'SKILL.md'), 'utf8')).toBe(fileBug)
	})
})

describe('reference uses', () => {
	it('lists the references it loads, the files that load each, which ship a default, and which have none', async () => {
		const root = repo()
		const folder = fileBugSkill(root)
		const found = await usesOf([folder], { root })
		const files = [`${folder}/SKILL.md`]
		expect(found.loads).toEqual([
			{
				name: 'bug-title',
				default: true,
				status: 'found',
				answeredBy: ['default'],
				defaultAnswers: true,
				files,
				source: 'detected',
			},
			{
				name: 'triage',
				default: false,
				status: 'missing',
				answeredBy: [],
				defaultAnswers: false,
				files,
				source: 'detected',
			},
		])
		expect(found.gaps).toEqual(['triage'])
	})

	it('names the tiers that answer a load, and says the default no longer answers alone', async () => {
		const root = repo()
		plugins(root, { other: { 'bug-title': '## Title\n\nplugin title\n' } })
		write(root, '.agents/references/bug-title.md', '## Title\n\nmine\n')
		const found = await usesOf([fileBugSkill(root)], { root })
		expect(found.loads?.[0]).toMatchObject({ name: 'bug-title', default: true, defaultAnswers: false })
		expect(found.loads?.[0]?.answeredBy).toContain('repo')
	})

	it('reads an interface load as an interface, not as a reference with a gap', async () => {
		const root = repo()
		const file = write(
			root,
			'AGENTS.md',
			'Load the implementations of the `project-tracker` interface with the `reference` skill of `cyber-agentkit`.\n',
		)
		const found = await usesOf([file], { root })
		expect(found.interfaces).toEqual(['project-tracker'])
		expect(found.loads).toBeUndefined()
		expect(found.gaps).toBeUndefined()
	})

	it('looks for a file’s bundled default beside it, in the references folder of its own folder', async () => {
		const root = repo()
		write(root, 'agents/references/bug-title.default.md', '## Title\n\nmine\n')
		const file = write(root, 'agents/filer.md', 'Load `bug-title` with the `reference` skill of `cyber-agentkit`.\n')
		const found = await usesOf([file], { root })
		expect(found.loads).toMatchObject([{ name: 'bug-title', default: true, defaultAnswers: true }])
	})

	it('reads the list a skill declares under `metadata.references`, and only that list', async () => {
		const root = repo()
		write(root, 'skills/triage/references/triage.rules.default.md', '## Rules\n\nmine\n')
		write(root, '.agents/references/bug-title.md', '## Title\n\nmine\n')
		const folder = join(root, 'skills/triage')
		write(
			root,
			'skills/triage/SKILL.md',
			[
				'---',
				'name: triage',
				'description: Triages a bug.',
				'metadata:',
				'  references: triage.rules triage.labels',
				'  reference-interfaces: project-tracker',
				'---',
				'',
				'Read `triage.rules` and `triage.labels` first. `bug-title` is mentioned but not loaded.',
				'',
			].join('\n'),
		)
		const found = await usesOf([folder], { root })
		expect(found.loads?.map(({ name, source, files }) => ({ name, source, files }))).toEqual([
			{ name: 'triage.rules', source: 'declared', files: [`${folder}/SKILL.md`] },
			{ name: 'triage.labels', source: 'declared', files: [`${folder}/SKILL.md`] },
		])
		expect(found.interfaces).toEqual(['project-tracker'])
		expect(found.gaps).toEqual(['triage.labels'])
	})

	it('counts a backticked name that resolves here as a load when the skill declares none, in any language', async () => {
		const root = repo()
		write(root, '.agents/references/release-notes.tone.md', '## Tone\n\nplain\n')
		const folder = join(root, 'skills/notes')
		write(root, 'skills/notes/references/release-notes.sections.default.md', '## Sections\n\nall\n')
		write(
			root,
			'skills/notes/SKILL.md',
			[
				'---',
				'name: notes',
				'description: リリースノートを書く。',
				'---',
				'',
				'`reference` スキルで `release-notes.tone` を読み込み、その口調で書く。',
				'次に `release-notes.sections` と `gh release create` を使う。',
				'',
			].join('\n'),
		)
		const found = await usesOf([folder], { root })
		expect(found.loads?.map(({ name, source }) => ({ name, source }))).toEqual([
			{ name: 'release-notes.tone', source: 'detected' },
			{ name: 'release-notes.sections', source: 'detected' },
		])
	})

	it('reads names listed in bullets under a lead-in when they resolve, the form a declared list replaces', async () => {
		const root = repo()
		write(root, '.agents/references/project-tracker.levels.md', '## Levels\n\nthree\n')
		const file = write(
			root,
			'skills/issue/SKILL.md',
			[
				'---',
				'name: issue',
				'description: Files an issue.',
				'---',
				'',
				'Load these with the `reference` skill of `cyber-agentkit`:',
				'',
				'- `project-tracker.levels`: how deep a plan goes.',
				'',
			].join('\n'),
		)
		const found = await usesOf([file], { root })
		expect(found.loads?.map(({ name }) => name)).toEqual(['project-tracker.levels'])
	})

	it('reads no load from a fenced example', async () => {
		const root = repo()
		write(root, '.agents/references/bug-title.md', '## Title\n\nmine\n')
		const file = write(
			root,
			'AGENTS.md',
			['```md', 'Load `bug-title` with the `reference` skill of `cyber-agentkit`.', '```', ''].join('\n'),
		)
		const found = await usesOf([file], { root })
		expect(found.loads).toBeUndefined()
	})

	it('reports no leads: those are what `advise` gives', async () => {
		const root = repo()
		const found = (await usesOf([fileBugSkill(root)], { root })) as Record<string, unknown>
		expect(found['leads']).toBeUndefined()
	})
})

describe('reference audit (deprecated)', () => {
	it('prints a notice naming advise and uses, and still reports both for a folder', async () => {
		const root = repo()
		const folder = fileBugSkill(root)
		stdout.mockClear()
		stderr.mockClear()
		expect(await audit([folder], { root })).toBe(0)
		const notice = stderr.mock.calls.map(([text]) => String(text)).join('')
		expect(notice).toContain('deprecated')
		expect(notice).toContain('reference advise')
		expect(notice).toContain('reference uses')
		const found = json<ReferenceAuditReport>()
		expect(found.deprecated).toContain('reference advise')
		expect(found.leads.length).toBeGreaterThan(0)
		expect(found.gaps).toEqual(['triage'])
	})

	it('no longer looks a skill up by name', async () => {
		const root = repo()
		write(root, 'skills/file-bug/SKILL.md', fileBug)
		stdout.mockClear()
		expect(await audit(['file-bug'], { root })).toBe(2)
		expect(json<{ code: string }>().code).toBe('path-not-found')
	})
})
