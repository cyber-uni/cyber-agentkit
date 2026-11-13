import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, lstatSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'

/** A skill source `skill vet` fetches: a git repository over HTTPS, or a local folder, and where in it the skill is. */
export type VetSource = {
	/** The HTTPS URL the checkout clones, or, for a local source, its absolute folder. */
	url: string
	/** A local source: the absolute folder copied, `--path` included. */
	local?: string
	/** `owner/repo` when the source is on GitHub, which is where the supply-chain signals come from. */
	github?: { owner: string; repo: string }
	/** The branch or tag to check out; the default branch when unset. */
	ref?: string
	/** The folder inside the repository that holds the skill, or that holds several; the whole repository when unset. */
	path?: string
}

const segment = /^[A-Za-z0-9_.-]+$/

function cleanPath(path: string | undefined): string | undefined | { problem: string } {
	if (path === undefined) return undefined
	const parts = path.split('/').filter((part) => part !== '' && part !== '.')
	if (parts.some((part) => part === '..')) return { problem: `the path ${path} leaves the repository` }
	return parts.length ? parts.join('/') : undefined
}

/** A local folder is written as a path: absolute, or starting `./`, `../`, or `~/`, or `.` or `..` alone. */
export function isLocalSource(text: string): boolean {
	return (
		text === '.' ||
		text === '..' ||
		/^(?:\.{1,2}|~)[\\/]/.test(text) ||
		text.startsWith('/') ||
		/^[A-Za-z]:[\\/]/.test(text) ||
		text.startsWith('\\\\')
	)
}

/**
 * Reads a source as `owner/repo`, `owner/repo/<path>`, a GitHub URL (with `/tree/<ref>/<path>`), any other
 * `https://` git URL, or a local folder written as a path. Only HTTPS is cloned, so no `file://`, `ssh`, or `ext::`
 * transport runs; a local folder is copied, never run through git.
 */
export function parseVetSource(
	input: string,
	overrides: { ref?: string | undefined; path?: string | undefined } = {},
	place: { cwd?: string; home?: string } = {},
): VetSource | { problem: string } {
	const text = input.trim()
	if (isLocalSource(text)) {
		if (overrides.ref !== undefined)
			return { problem: `a local folder has no branch or tag; drop --ref ${overrides.ref}` }
		const home = place.home ?? process.env['HOME'] ?? ''
		const base = text.startsWith('~') ? join(home, text.slice(2)) : resolve(place.cwd ?? process.cwd(), text)
		const cleaned = cleanPath(overrides.path)
		if (typeof cleaned === 'object') return cleaned
		const local = cleaned ? join(base, cleaned) : base
		return { url: local, local }
	}
	let owner: string | undefined
	let repo: string | undefined
	let ref: string | undefined
	let path: string | undefined
	let url: string | undefined
	if (/^[a-z][a-z0-9+.-]*:/i.test(text)) {
		let parsed: URL
		try {
			parsed = new URL(text)
		} catch {
			return { problem: `${input} is not a URL` }
		}
		if (parsed.protocol !== 'https:') return { problem: `${input} is not an https:// source` }
		if (parsed.username || parsed.password) return { problem: `${input} carries credentials; remove them` }
		if (parsed.hostname === 'github.com') {
			const parts = parsed.pathname.split('/').filter(Boolean)
			owner = parts[0]
			repo = parts[1]?.replace(/\.git$/, '')
			if (parts[2] === 'tree' || parts[2] === 'blob') {
				ref = parts[3]
				path = parts.slice(4).join('/')
				if (parts[2] === 'blob' && /(^|\/)SKILL\.md$/.test(path)) path = path.replace(/\/?SKILL\.md$/, '')
			} else if (parts.length > 2) path = parts.slice(2).join('/')
		} else url = `${parsed.origin}${parsed.pathname}`
	} else {
		const parts = text.split('/').filter(Boolean)
		if (parts.length < 2) return { problem: `${input} is not owner/repo, a GitHub URL, or an https:// git URL` }
		owner = parts[0]
		repo = parts[1]?.replace(/\.git$/, '')
		path = parts.slice(2).join('/')
	}
	if (url === undefined) {
		if (!owner || !repo || !segment.test(owner) || !segment.test(repo))
			return { problem: `${input} does not name a GitHub owner and repository` }
		url = `https://github.com/${owner}/${repo}.git`
	}
	const cleaned = cleanPath(overrides.path ?? path)
	if (typeof cleaned === 'object') return cleaned
	const chosenRef = overrides.ref ?? ref
	if (chosenRef !== undefined && (chosenRef.startsWith('-') || !/^[A-Za-z0-9_./-]+$/.test(chosenRef)))
		return { problem: `${chosenRef} is not a branch or tag name` }
	return {
		url,
		...(owner && repo ? { github: { owner, repo } } : {}),
		...(chosenRef ? { ref: chosenRef } : {}),
		...(cleaned ? { path: cleaned } : {}),
	}
}

/** Puts the source's files in `folder`, which exists and is empty, and names the commit it checked out. */
export type FetchSource = (source: VetSource, folder: string) => { commit?: string } | { problem: string }

/**
 * Clones the source with git, shallow and with nothing of it run: no hooks, no submodules, no LFS filters, and
 * symbolic links checked out as plain files, so no link reaches outside the checkout.
 */
export const cloneSource: FetchSource = (source, folder) => {
	if (source.local) return copyLocal(source.local, folder)
	const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' }
	const config = [
		'-c',
		'core.hooksPath=/dev/null',
		'-c',
		'core.symlinks=false',
		'-c',
		'protocol.allow=never',
		'-c',
		'protocol.https.allow=always',
	]
	const branch = source.ref ? ['--branch', source.ref] : []
	try {
		execFileSync(
			'git',
			[
				...config,
				'clone',
				'--quiet',
				'--depth',
				'1',
				'--single-branch',
				'--no-recurse-submodules',
				...branch,
				'--',
				source.url,
				folder,
			],
			{ env, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120_000 },
		)
	} catch (error) {
		const reason =
			(error as { stderr?: Buffer }).stderr?.toString().trim().split('\n').at(-1) || (error as Error).message
		return { problem: `git could not clone ${source.url}: ${reason}` }
	}
	try {
		const commit = execFileSync('git', ['-C', folder, 'rev-parse', 'HEAD'], { encoding: 'utf8', env }).trim()
		return { commit }
	} catch {
		return {}
	}
}

const notCopied = new Set(['.git'])

/**
 * Copies a local folder's files into `folder`, leaving out `.git` and every symbolic link, so nothing in the copy
 * reaches outside it and no git configuration of the source is read. It runs nothing, git included.
 */
export function copyLocal(from: string, folder: string): { commit?: string } | { problem: string } {
	if (!isAbsolute(from) || !existsSync(from)) return { problem: `${from} does not exist` }
	if (!statSync(from).isDirectory()) return { problem: `${from} is not a folder` }
	try {
		cpSync(from, folder, {
			recursive: true,
			filter: (path) => path === from || (!notCopied.has(basename(path)) && !lstatSync(path).isSymbolicLink()),
		})
	} catch (error) {
		return { problem: `could not copy ${from}: ${(error as Error).message}` }
	}
	return {}
}

/** Runs `work` on a fresh folder under the system temp folder, and removes the folder afterwards, whatever happens. */
export async function inTemporaryFolder<T>(work: (folder: string) => Promise<T> | T): Promise<T> {
	const folder = mkdtempSync(join(tmpdir(), 'cyber-agentkit-vet-'))
	try {
		return await work(folder)
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
}

const skipped = new Set(['.git', 'node_modules'])

/** Every folder at or under `start` that holds a `SKILL.md`, relative to `root`, sorted; at most `limit` of them. */
export function findSkillFolders(root: string, start: string, limit = 100): string[] {
	const found: string[] = []
	const walk = (folder: string) => {
		if (found.length >= limit) return
		const entries = readdirSync(folder, { withFileTypes: true })
		if (entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md'))
			found.push(relative(root, folder).split(sep).join('/') || '.')
		for (const entry of entries) if (entry.isDirectory() && !skipped.has(entry.name)) walk(join(folder, entry.name))
	}
	const from = resolve(root, start)
	if (existsSync(from)) walk(from)
	return found.sort()
}
