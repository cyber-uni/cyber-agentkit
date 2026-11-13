/** One GitHub REST API read: the HTTP status and the parsed JSON body. */
export type GitHubGet = (path: string) => Promise<{ status: number; body: unknown }>

/** Reads the GitHub REST API, with `GITHUB_TOKEN` or `GH_TOKEN` when one is set (it raises the rate limit). */
export const githubGet: GitHubGet = async (path) => {
	const token = process.env['GITHUB_TOKEN'] || process.env['GH_TOKEN']
	const response = await fetch(`https://api.github.com${path}`, {
		headers: {
			accept: 'application/vnd.github+json',
			'user-agent': 'cyber-agentkit',
			'x-github-api-version': '2022-11-28',
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
		signal: AbortSignal.timeout(20_000),
	})
	const text = await response.text()
	let body: unknown
	try {
		body = JSON.parse(text)
	} catch {
		body = undefined
	}
	return { status: response.status, body }
}

/** A signal `skill vet` could not read, and why. */
export type Unavailable = { available: false; reason: string }

export type PublisherSignal =
	| {
			available: true
			login: string
			kind: 'user' | 'organization'
			/** An organization GitHub shows as verified (it proved a domain); `false` for a user, which cannot be. */
			verified: boolean
			/** Whether an entry on the trust list covers the source. */
			trusted: boolean
	  }
	| Unavailable

export type MaintenanceSignal =
	| {
			available: true
			archived: boolean
			/** The newest commit touching the skill's path, or the repository when no path was given. */
			lastCommit: string | null
			daysSinceCommit: number | null
			latestRelease: { tag: string; published: string } | null
			/** `active` with a commit in the last 365 days, `stale` with none, `archived` when the owner archived it. */
			status: 'active' | 'stale' | 'archived'
	  }
	| Unavailable

export type LicenseSignal =
	| {
			available: true
			/** The SPDX ID GitHub detects for the repository, `NOASSERTION` for one it does not recognize, or `null` for none. */
			repository: string | null
	  }
	| Unavailable

export type SupplyChainSignals = {
	publisher: PublisherSignal
	maintenance: MaintenanceSignal
	license: LicenseSignal
}

/**
 * Installs counted by the `skills` CLI's opt-in telemetry, as skills.sh reports them (`.research/skill-install-counts`,
 * E-IC-2, E-IC-6, E-IC-7). Never a stand-in such as GitHub stars: with no exact match, it is unavailable.
 */
export type InstallsSignal = { available: true; source: 'skills.sh'; count: number } | Unavailable

export const staleAfterDays = 365

const day = 24 * 60 * 60 * 1000

/** One HTTP GET of a JSON endpoint: the status and the parsed body. */
export type JsonGet = (url: string) => Promise<{ status: number; body: unknown }>

export const jsonGet: JsonGet = async (url) => {
	const response = await fetch(url, {
		headers: { accept: 'application/json', 'user-agent': 'cyber-agentkit' },
		signal: AbortSignal.timeout(10_000),
	})
	const text = await response.text()
	try {
		return { status: response.status, body: JSON.parse(text) }
	} catch {
		return { status: response.status, body: undefined }
	}
}

/**
 * Reads the skills.sh install count of the skill `name` in `owner/repo`. The search is fuzzy, so only an entry
 * whose `source` is the repository and whose `skillId` is the name counts. The query carries the skill name only.
 */
export async function readInstalls(
	github: { owner: string; repo: string },
	name: string,
	get: JsonGet,
): Promise<InstallsSignal> {
	const none = (reason: string): Unavailable => ({ available: false, reason })
	let answer: { status: number; body: unknown }
	try {
		answer = await get(`https://skills.sh/api/search?q=${encodeURIComponent(name)}&limit=50`)
	} catch (error) {
		return none(`could not reach skills.sh: ${(error as Error).message}`)
	}
	if (answer.status !== 200) return none(`skills.sh answered ${answer.status}`)
	const skills = (answer.body as { skills?: unknown })?.skills
	if (!Array.isArray(skills)) return none('skills.sh answered in a shape this version does not read')
	const repository = `${github.owner}/${github.repo}`.toLowerCase()
	const matches = skills.filter((entry) => {
		const { source, skillId } = (entry ?? {}) as { source?: unknown; skillId?: unknown }
		return typeof source === 'string' && source.toLowerCase() === repository && skillId === name
	})
	if (matches.length !== 1)
		return none(matches.length ? 'skills.sh lists it more than once' : 'skills.sh does not list it')
	const count = (matches[0] as { installs?: unknown }).installs
	return Number.isInteger(count) && (count as number) >= 0
		? { available: true, source: 'skills.sh', count: count as number }
		: none('skills.sh lists it with no install count')
}

function why(status: number, body: unknown): string {
	const message = (body as { message?: unknown })?.message
	if (status === 404) return 'GitHub has no such repository, or it is private'
	if (status === 403 || status === 429)
		return `GitHub refused the read (${status}${typeof message === 'string' ? `: ${message}` : ''}); set GITHUB_TOKEN to raise the rate limit`
	return `GitHub answered ${status}${typeof message === 'string' ? `: ${message}` : ''}`
}

const string = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

/**
 * Reads who publishes a GitHub repository, whether it is maintained, and its license. A read that fails leaves that
 * signal unavailable with the reason; a signal never blocks an install.
 */
export async function readSignals(
	github: { owner: string; repo: string },
	options: { path?: string | undefined; trusted: boolean; get: GitHubGet; now: Date },
): Promise<SupplyChainSignals> {
	const { owner, repo } = github
	const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
	const unavailable = (reason: string): Unavailable => ({ available: false, reason })
	let repository: { status: number; body: unknown }
	try {
		repository = await options.get(base)
	} catch (error) {
		const reason = `could not reach GitHub: ${(error as Error).message}`
		return {
			publisher: unavailable(reason),
			maintenance: unavailable(reason),
			license: unavailable(reason),
		}
	}
	if (repository.status !== 200) {
		const reason = why(repository.status, repository.body)
		return {
			publisher: unavailable(reason),
			maintenance: unavailable(reason),
			license: unavailable(reason),
		}
	}
	const info = repository.body as {
		owner?: { login?: unknown; type?: unknown }
		archived?: unknown
		license?: { spdx_id?: unknown } | null
	}
	const login = string(info.owner?.login) ?? owner
	const kind = info.owner?.type === 'Organization' ? 'organization' : 'user'

	const publisher = async (): Promise<PublisherSignal> => {
		let verified = false
		if (kind === 'organization') {
			const org = await options.get(`/orgs/${encodeURIComponent(login)}`).catch(() => undefined)
			if (org?.status !== 200)
				return unavailable(org ? why(org.status, org.body) : 'could not reach GitHub for the organization')
			verified = (org.body as { is_verified?: unknown })?.is_verified === true
		}
		return { available: true, login, kind, verified, trusted: options.trusted }
	}

	const maintenance = async (): Promise<MaintenanceSignal> => {
		const query = `?per_page=1${options.path ? `&path=${encodeURIComponent(options.path)}` : ''}`
		const commits = await options.get(`${base}/commits${query}`).catch(() => undefined)
		if (commits?.status !== 200)
			return unavailable(commits ? why(commits.status, commits.body) : 'could not reach GitHub for the commits')
		const first = (commits.body as { commit?: { committer?: { date?: unknown } } }[] | undefined)?.[0]
		const lastCommit = string(first?.commit?.committer?.date) ?? null
		const release = await options.get(`${base}/releases/latest`).catch(() => undefined)
		if (!release || (release.status !== 200 && release.status !== 404))
			return unavailable(release ? why(release.status, release.body) : 'could not reach GitHub for the releases')
		const latest = release.body as { tag_name?: unknown; published_at?: unknown }
		const latestRelease =
			release.status === 200 && string(latest.tag_name)
				? { tag: latest.tag_name as string, published: string(latest.published_at) ?? '' }
				: null
		const daysSinceCommit =
			lastCommit === null ? null : Math.floor((options.now.getTime() - Date.parse(lastCommit)) / day)
		const archived = info.archived === true
		const status = archived
			? 'archived'
			: daysSinceCommit !== null && daysSinceCommit <= staleAfterDays
				? 'active'
				: 'stale'
		return { available: true, archived, lastCommit, daysSinceCommit, latestRelease, status }
	}

	const [publisherSignal, maintenanceSignal] = await Promise.all([publisher(), maintenance()])
	return {
		publisher: publisherSignal,
		maintenance: maintenanceSignal,
		license: { available: true, repository: string(info.license?.spdx_id) ?? null },
	}
}
