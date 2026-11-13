import { describe, expect, it } from 'vitest'
import { type GitHubGet, type JsonGet, readInstalls, readSignals } from './vet-signals.js'

const now = new Date('2026-11-13T00:00:00Z')
const repo = { owner: 'acme', repo: 'skills' }

function github(answers: Record<string, { status: number; body?: unknown }>): GitHubGet & { asked: string[] } {
	const asked: string[] = []
	const get = (async (path: string) => {
		asked.push(path)
		const answer = answers[path.split('?')[0] as string]
		return answer ? { status: answer.status, body: answer.body } : { status: 404, body: { message: 'Not Found' } }
	}) as GitHubGet & { asked: string[] }
	get.asked = asked
	return get
}

const repository = (overrides: Record<string, unknown> = {}) => ({
	status: 200,
	body: { owner: { login: 'acme', type: 'Organization' }, archived: false, license: { spdx_id: 'MIT' }, ...overrides },
})

describe('readSignals', () => {
	it('reads the publisher, whether it is maintained, and the license', async () => {
		const get = github({
			'/repos/acme/skills': repository(),
			'/orgs/acme': { status: 200, body: { is_verified: true } },
			'/repos/acme/skills/commits': {
				status: 200,
				body: [{ commit: { committer: { date: '2026-11-03T00:00:00Z' } } }],
			},
			'/repos/acme/skills/releases/latest': {
				status: 200,
				body: { tag_name: 'v1.2.0', published_at: '2026-10-01T00:00:00Z' },
			},
		})
		const signals = await readSignals(repo, { path: 'tools/x', trusted: ['ACME'], get, now })
		expect(signals).toEqual({
			publisher: { available: true, login: 'acme', kind: 'organization', verified: true, trusted: true },
			maintenance: {
				available: true,
				archived: false,
				lastCommit: '2026-11-03T00:00:00Z',
				daysSinceCommit: 10,
				latestRelease: { tag: 'v1.2.0', published: '2026-10-01T00:00:00Z' },
				status: 'active',
			},
			license: { available: true, repository: 'MIT' },
		})
		expect(get.asked).toContain('/repos/acme/skills/commits?per_page=1&path=tools%2Fx')
	})

	it('reports no license, no release, and a stale repository with no commit in two years', async () => {
		const get = github({
			'/repos/acme/skills': repository({ owner: { login: 'acme', type: 'User' }, license: null }),
			'/repos/acme/skills/commits': {
				status: 200,
				body: [{ commit: { committer: { date: '2024-11-01T00:00:00Z' } } }],
			},
		})
		const signals = await readSignals(repo, { trusted: [], get, now })
		expect(signals.publisher).toEqual({ available: true, login: 'acme', kind: 'user', verified: false, trusted: false })
		expect(signals.license).toEqual({ available: true, repository: null })
		expect(signals.maintenance).toMatchObject({ status: 'stale', latestRelease: null, daysSinceCommit: 742 })
	})

	it('reports an archived repository as archived', async () => {
		const get = github({
			'/repos/acme/skills': repository({ owner: { login: 'acme', type: 'User' }, archived: true }),
			'/repos/acme/skills/commits': {
				status: 200,
				body: [{ commit: { committer: { date: '2026-11-01T00:00:00Z' } } }],
			},
		})
		expect((await readSignals(repo, { trusted: [], get, now })).maintenance).toMatchObject({ status: 'archived' })
	})

	it('leaves each signal unavailable, with the reason, when GitHub refuses or cannot be reached', async () => {
		const limited = github({ '/repos/acme/skills': { status: 403, body: { message: 'API rate limit exceeded' } } })
		const signals = await readSignals(repo, { trusted: [], get: limited, now })
		expect(signals.publisher).toMatchObject({ available: false, reason: expect.stringContaining('GITHUB_TOKEN') })
		expect(signals.license).toMatchObject({ available: false })
		const down: GitHubGet = async () => {
			throw new Error('getaddrinfo ENOTFOUND')
		}
		expect((await readSignals(repo, { trusted: [], get: down, now })).maintenance).toMatchObject({
			available: false,
			reason: expect.stringContaining('ENOTFOUND'),
		})
	})
})

describe('readInstalls', () => {
	const answer =
		(status: number, body: unknown): JsonGet =>
		async () => ({ status, body })

	it('takes only the entry whose source is the repository and whose skillId is the name', async () => {
		const get = answer(200, {
			skills: [
				{ source: 'someone/else', skillId: 'release-notes', installs: 999 },
				{ source: 'Acme/Skills', skillId: 'release-notes', installs: 42 },
				{ source: 'acme/skills', skillId: 'release-notes-pro', installs: 7 },
			],
		})
		expect(await readInstalls(repo, 'release-notes', get)).toEqual({ available: true, source: 'skills.sh', count: 42 })
	})

	it('sends the skill name only', async () => {
		const urls: string[] = []
		await readInstalls(repo, 'release notes', async (url) => {
			urls.push(url)
			return { status: 200, body: { skills: [] } }
		})
		expect(urls).toEqual(['https://skills.sh/api/search?q=release%20notes&limit=50'])
	})

	it('shows no count, never a stand-in, on no match, an ambiguous match, a refusal, or a changed shape', async () => {
		expect(await readInstalls(repo, 'x', answer(200, { skills: [] }))).toMatchObject({ available: false })
		const twice = { source: 'acme/skills', skillId: 'x', installs: 1 }
		expect(await readInstalls(repo, 'x', answer(200, { skills: [twice, twice] }))).toMatchObject({ available: false })
		expect(await readInstalls(repo, 'x', answer(500, undefined))).toMatchObject({ available: false })
		expect(await readInstalls(repo, 'x', answer(200, { results: [] }))).toMatchObject({ available: false })
		expect(
			await readInstalls(repo, 'x', answer(200, { skills: [{ source: 'acme/skills', skillId: 'x', installs: '9' }] })),
		).toMatchObject({ available: false })
		const down: JsonGet = async () => {
			throw new Error('timeout')
		}
		expect(await readInstalls(repo, 'x', down)).toMatchObject({
			available: false,
			reason: expect.stringContaining('timeout'),
		})
	})
})
