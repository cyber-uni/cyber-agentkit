import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReferenceRegisterReport } from '../references/reference.command.js'
import {
	check,
	json,
	list,
	load,
	register,
	repo,
	stdout,
	tempDir,
	write,
} from '../references/reference-command.fixtures.js'
import type { GhResult } from './github-cli.js'
import { registryHost } from './interface-registry.fixtures.js'

/** Every `gh` call the command made, and the answer each one gets. Nothing reaches GitHub. */
const ghHoisted = vi.hoisted(() => ({
	calls: [] as string[][],
	answer: (_args: readonly string[]): GhResult => ({ ok: false, stdout: '', stderr: 'not stubbed' }),
}))

vi.mock('./github-cli.js', () => ({
	gh: async (args: readonly string[]) => {
		ghHoisted.calls.push([...args])
		return ghHoisted.answer(args)
	},
}))

const ok = (stdout = ''): GhResult => ({ ok: true, stdout, stderr: '' })
const fail = (stderr = 'nope'): GhResult => ({ ok: false, stdout: '', stderr })

/** A signed-in `gh` that can fork, and answers each write with a url. */
function signedIn(login = 'dana') {
	ghHoisted.answer = (args) => {
		const [first, second] = args
		if (first === 'api' && second === 'user') return ok(login)
		if (first === 'api' && second === 'repos/cyber-uni/cyber-agentkit') return ok('true')
		if (first === 'auth') return ok()
		if (first === 'repo') return ok()
		if (first === 'api' && String(second).endsWith('/git/ref/heads/main')) return ok('abc123')
		if (first === 'api') return ok('{}')
		if (first === 'pr') return ok('https://github.com/cyber-uni/cyber-agentkit/pull/9')
		if (first === 'issue') return ok('https://github.com/cyber-uni/cyber-agentkit/issues/8')
		return fail()
	}
}

const registry = {
	'project-tracker.md': '---\nid: project-tracker\ndescription: Where a project files and tracks its issues.\n---\n',
	'change-request-host.md':
		'---\nid: change-request-host\ndescription: Where a change is proposed and reviewed as a pull request.\n---\n',
}

const capabilities = {
	'gitlab.md': '---\nsystem: gitlab\ndescription: GitLab, a code host with issues and epics.\n---\n',
}

const fetchMock = vi.fn(registryHost(registry, capabilities))

beforeEach(() => {
	ghHoisted.calls = []
	ghHoisted.answer = () => fail('not signed in')
	fetchMock.mockReset()
	fetchMock.mockImplementation(registryHost(registry, capabilities))
	vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
	vi.unstubAllGlobals()
})

const opened = () => ghHoisted.calls.filter(([first]) => first === 'pr' || first === 'issue' || first === 'repo')

describe('register', () => {
	it('stops on the same id after normalizing, points at the entry, and records nothing', async () => {
		signedIn()
		expect(await register('Project_Tracker', { yes: true })).toBe(1)
		expect(json()).toMatchObject({
			code: 'interface-registered',
			registered: 'project-tracker',
			url: 'https://github.com/cyber-uni/cyber-agentkit/blob/main/registry/interfaces/project-tracker.md',
		})
		expect(opened()).toEqual([])
	})

	it('shows near matches with why each matched, and stops even with --yes until each is named in --seen', async () => {
		signedIn()
		expect(
			await register('pull-request-host', { description: 'Where a change is proposed and reviewed.', yes: true }),
		).toBe(0)
		const report = json<ReferenceRegisterReport & { help: string[] }>()
		expect(report.recorded).toBe(false)
		expect(report.near).toEqual([
			expect.objectContaining({
				id: 'change-request-host',
				reasons: expect.arrayContaining(['the id shares the words `request`, `host`']),
			}),
		])
		expect(report.help).toContain('To go on, run again with `--seen change-request-host`.')
		expect(opened()).toEqual([])
	})

	it('only shows the default route and the entry without --yes or --as', async () => {
		signedIn()
		expect(
			await register('release-notes-source', { description: "Where a release's notes come from.", tag: ['release'] }),
		).toBe(0)
		const report = json<ReferenceRegisterReport & { help: string[] }>()
		expect(report).toMatchObject({
			id: 'release-notes-source',
			recorded: false,
			route: 'pull-request',
			why: 'the GitHub tool is signed in as `dana` and can fork cyber-uni/cyber-agentkit',
			compared: 2,
			entry:
				"---\nid: release-notes-source\ndescription: Where a release's notes come from.\ntags:\n  - release\n---\n",
		})
		expect(report.help[0]).toMatch(/^Nothing was opened\. Run again with `--yes`/)
		expect(opened()).toEqual([])
	})

	it('opens a pull request adding the entry file from a fork on --yes, carrying the lookup result', async () => {
		signedIn()
		expect(await register('release-notes-source', { yes: true })).toBe(0)
		expect(json<ReferenceRegisterReport>()).toMatchObject({
			recorded: true,
			route: 'pull-request',
			url: 'https://github.com/cyber-uni/cyber-agentkit/pull/9',
		})
		const put = ghHoisted.calls.find((args) => args.includes('PUT'))
		expect(put).toContain('repos/dana/cyber-agentkit/contents/registry/interfaces/release-notes-source.md')
		expect(put).toContain('branch=register-interface/release-notes-source')
		const content = put?.find((arg) => arg.startsWith('content='))?.slice('content='.length) ?? ''
		expect(Buffer.from(content, 'base64').toString('utf8')).toBe('---\nid: release-notes-source\n---\n')
		const pr = ghHoisted.calls.find(([first]) => first === 'pr') ?? []
		expect(pr).toEqual(expect.arrayContaining(['--head', 'dana:register-interface/release-notes-source']))
		expect(pr[pr.indexOf('--body') + 1]).toContain(
			'compared it against 2 registered interfaces. It found no near matches.',
		)
	})

	it('records the near matches that were shown when going on past them', async () => {
		signedIn()
		expect(
			await register('pull-request-host', {
				description: 'Where a change is proposed and reviewed.',
				seen: ['change-request-host'],
				as: 'issue',
			}),
		).toBe(0)
		expect(json<ReferenceRegisterReport>()).toMatchObject({
			recorded: true,
			route: 'issue',
			why: '`--as` forced it',
			url: 'https://github.com/cyber-uni/cyber-agentkit/issues/8',
		})
		const issue = ghHoisted.calls.find(([first]) => first === 'issue') ?? []
		const body = issue[issue.indexOf('--body') + 1]
		expect(body).toContain('These near matches were shown, and the registrant chose to go on:')
		expect(body).toContain('- `change-request-host`: the id shares the words `request`, `host`')
		expect(body).toContain('````md\n---\nid: pull-request-host\n')
	})

	it('defaults to an issue when gh is signed out, says why, and gives the new-issue page instead of filing', async () => {
		expect(await register('release-notes-source')).toBe(0)
		expect(json<ReferenceRegisterReport>()).toMatchObject({
			route: 'issue',
			why: 'the GitHub tool (`gh`) is not signed in, so it cannot fork and push',
			recorded: false,
		})

		stdout.mockClear()
		expect(await register('release-notes-source', { yes: true })).toBe(0)
		const report = json<ReferenceRegisterReport>()
		expect(report.recorded).toBe(false)
		expect(report.url).toMatch(/^https:\/\/github\.com\/cyber-uni\/cyber-agentkit\/issues\/new\?title=Register\+the/)
		expect(ghHoisted.calls.filter(([first]) => first === 'issue')).toEqual([])
	})

	it('says so and records nothing with no network', async () => {
		signedIn()
		fetchMock.mockImplementation(async () => {
			throw new TypeError('fetch failed')
		})
		expect(await register('release-notes-source', { yes: true })).toBe(1)
		expect(json()).toMatchObject({ code: 'registry-unreachable' })
		expect(opened()).toEqual([])
	})

	it('reports a failed GitHub step as record-failed', async () => {
		signedIn()
		const answer = ghHoisted.answer
		ghHoisted.answer = (args) => (args[0] === 'pr' ? fail('no permission') : answer(args))
		expect(await register('release-notes-source', { yes: true })).toBe(1)
		expect(json()).toMatchObject({
			code: 'record-failed',
			error: 'Opening the pull request failed: no permission. Nothing more was opened.',
		})
	})

	it('reads a prepared entry from --file, with options over its fields', async () => {
		const dir = tempDir()
		const file = write(dir, 'entry.md', '---\nid: release-notes-source\nstatus: draft\n---\n\nWhy.\n')
		expect(await register('release-notes-source', { file, status: 'stable' })).toBe(0)
		expect(json<ReferenceRegisterReport>().entry).toBe('---\nid: release-notes-source\nstatus: stable\n---\n\nWhy.\n')

		stdout.mockClear()
		const wrong = write(dir, 'wrong.md', '---\nid: other\n---\n')
		expect(await register('release-notes-source', { file: wrong })).toBe(2)
		expect(json()).toMatchObject({ code: 'entry-invalid' })
	})

	it('refuses an invalid id or route as usage errors', async () => {
		expect(await register('bad id')).toBe(2)
		expect(json()).toMatchObject({ code: 'id-invalid' })
		stdout.mockClear()
		expect(await register('fine', { as: 'email' })).toBe(2)
		expect(json()).toMatchObject({ code: 'route-unknown' })
		expect(fetchMock).not.toHaveBeenCalled()
	})
})

describe('register <system>.capabilities', () => {
	it('stops on a system already in the capability registry and points at its entry', async () => {
		signedIn()
		expect(await register('GitLab.capabilities', { yes: true })).toBe(1)
		expect(json()).toMatchObject({
			code: 'capability-registered',
			registered: 'gitlab',
			url: 'https://github.com/cyber-uni/cyber-agentkit/blob/main/registry/capabilities/gitlab.md',
		})
		expect(opened()).toEqual([])
	})

	it('compares systems only, not interfaces, and shows a near system', async () => {
		signedIn()
		expect(await register('gitlab-dedicated.capabilities')).toBe(0)
		const report = json<ReferenceRegisterReport & { help: string[] }>()
		expect(report).toMatchObject({ id: 'gitlab-dedicated.capabilities', system: 'gitlab-dedicated', compared: 1 })
		expect(report.near).toEqual([expect.objectContaining({ id: 'gitlab' })])
		expect(report.help[0]).toBe('None of these is taken as the same system; you decide. Nothing was recorded.')
	})

	it('shows the system entry with its plugins and blueprints, then opens a pull request adding it', async () => {
		signedIn()
		const args = {
			description: 'Asana, a work-management service.',
			plugin: ['cyber-asana'],
			blueprint: ['project-tracker.blueprints.asana.sections,project-tracker.blueprints.asana.custom-field'],
		}
		expect(await register('asana.capabilities', args)).toBe(0)
		const text = [
			'---',
			'system: asana',
			'description: Asana, a work-management service.',
			'plugins:',
			'  - name: cyber-asana',
			'blueprints:',
			'  - name: project-tracker.blueprints.asana.sections',
			'  - name: project-tracker.blueprints.asana.custom-field',
			'---',
			'',
		].join('\n')
		expect(json<ReferenceRegisterReport>()).toMatchObject({
			id: 'asana.capabilities',
			system: 'asana',
			recorded: false,
			route: 'pull-request',
			compared: 1,
			entry: text,
		})

		stdout.mockClear()
		expect(await register('asana.capabilities', { ...args, yes: true })).toBe(0)
		expect(json<ReferenceRegisterReport>()).toMatchObject({ recorded: true })
		const put = ghHoisted.calls.find((args) => args.includes('PUT'))
		expect(put).toContain('repos/dana/cyber-agentkit/contents/registry/capabilities/asana.md')
		expect(put).toContain('branch=register-capabilities/asana')
		const content = put?.find((arg) => arg.startsWith('content='))?.slice('content='.length) ?? ''
		expect(Buffer.from(content, 'base64').toString('utf8')).toBe(text)
		const pr = ghHoisted.calls.find(([first]) => first === 'pr') ?? []
		expect(pr).toEqual(expect.arrayContaining(['docs(registry): register the asana capability reference']))
		expect(pr[pr.indexOf('--body') + 1]).toContain('compared it against 1 registered system. It found no near matches.')
	})

	it('files an issue titled for the capability reference', async () => {
		signedIn()
		expect(await register('asana.capabilities', { as: 'issue' })).toBe(0)
		const issue = ghHoisted.calls.find(([first]) => first === 'issue') ?? []
		expect(issue).toEqual(expect.arrayContaining(['Register the asana capability reference']))
		expect(issue[issue.indexOf('--body') + 1]).toContain('````md\n---\nsystem: asana\n')
	})

	it('reads a prepared system entry from --file, and fails one whose blueprint is for another system', async () => {
		const dir = tempDir()
		const good = write(dir, 'asana.md', '---\nsystem: asana\nstatus: draft\n---\n')
		expect(await register('asana.capabilities', { file: good })).toBe(0)
		expect(json<ReferenceRegisterReport>().entry).toBe('---\nsystem: asana\nstatus: draft\n---\n')

		stdout.mockClear()
		const bad = write(dir, 'bad.md', '---\nsystem: asana\nblueprints: [project-tracker.blueprints.jira.epics]\n---\n')
		expect(await register('asana.capabilities', { file: bad })).toBe(2)
		expect(json()).toMatchObject({ code: 'entry-invalid' })
	})

	it('refuses a dotted system and the options of the other kind as usage errors, reading nothing', async () => {
		expect(await register('asana.cloud.capabilities')).toBe(2)
		expect(json()).toMatchObject({ code: 'id-invalid' })
		stdout.mockClear()
		expect(await register('asana.capabilities', { interface: 'https://example.com/x.md' })).toBe(2)
		expect(json()).toMatchObject({ code: 'option-not-for-capabilities' })
		stdout.mockClear()
		expect(await register('release-notes-source', { blueprint: ['x.blueprints.a.b'] })).toBe(2)
		expect(json()).toMatchObject({ code: 'option-not-for-interfaces' })
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it('says the capability registry cannot be read with no network', async () => {
		fetchMock.mockImplementation(async () => {
			throw new TypeError('fetch failed')
		})
		expect(await register('asana.capabilities')).toBe(1)
		expect(json()).toMatchObject({ code: 'registry-unreachable' })
		expect(json<{ error: string }>().error).toMatch(/^Cannot read the capability registry/)
	})
})

describe('the registry stays out of reference use', () => {
	it('load, list, and check never read the registry, and an unregistered interface or system raises nothing', async () => {
		const root = repo()
		write(
			root,
			'.agents/references/acme-deploy-gate.interface.md',
			'---\ninterface:\n  cardinality: one\n  version: 1\n  sections: [Gate]\n---\n',
		)
		write(root, '.agents/references/acme-deploy-gate.md', '---\nimplements: acme-deploy-gate@1\n---\n\n## Gate\n\nok\n')
		write(
			root,
			'.agents/references/gitlab.capabilities.md',
			'---\ndescription: GitLab.\n---\n\n## System\n\nGitLab.\n\n## Detect\n\nThe remote.\n\n## Verified\n\n- 17: run.\n',
		)
		expect(await load(['acme-deploy-gate'], { root })).toBe(0)
		expect(await load(['gitlab.capabilities'], { root })).toBe(0)
		expect(await list({ root })).toBe(0)
		stdout.mockClear()
		expect(await check(['acme-deploy-gate', 'gitlab.capabilities'], { root })).toBe(0)
		expect(JSON.stringify(json())).not.toMatch(/regist/i)
		expect(fetchMock).not.toHaveBeenCalled()
		expect(ghHoisted.calls).toEqual([])
	})
})
