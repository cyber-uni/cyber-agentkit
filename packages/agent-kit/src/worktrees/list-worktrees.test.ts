import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Exec } from './exec.js'
import { ghForgeMergedProbe } from './landed.js'
import { listWorktrees, primaryRoot, type WorktreeEntry } from './list-worktrees.js'

// Real git, not a fake: every signal here is a claim about git's own behaviour (porcelain quoting,
// `--merged` being blind to a squash, `[gone]` after `fetch --prune`), which a fake cannot prove.

const isolated = {
	...process.env,
	GIT_CONFIG_GLOBAL: '/dev/null',
	GIT_CONFIG_SYSTEM: '/dev/null',
	GIT_AUTHOR_NAME: 'test',
	GIT_AUTHOR_EMAIL: 'test@example.invalid',
	GIT_COMMITTER_NAME: 'test',
	GIT_COMMITTER_EMAIL: 'test@example.invalid',
}

/** The library's runner with no git identity at all, as on a fresh CI runner: the squash probe must
 * carry its own. */
const bareExec: Exec = async (cmd, args) => {
	const { GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL, GIT_COMMITTER_NAME, GIT_COMMITTER_EMAIL, ...env } = isolated
	try {
		return execFileSync(cmd, [...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }).trim()
	} catch {
		return null
	}
}

const git = (cwd: string, ...args: string[]) =>
	execFileSync('git', args, { cwd, encoding: 'utf8', env: isolated, stdio: ['ignore', 'pipe', 'pipe'] }).trim()

async function commit(cwd: string, file: string, body: string) {
	await writeFile(join(cwd, file), body)
	git(cwd, 'add', '-A')
	git(cwd, 'commit', '-q', '-m', `change ${file}`)
}

let root: string

beforeEach(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'agent-harness-worktrees-')))
})

afterEach(async () => {
	await rm(root, { recursive: true, force: true })
})

/** A primary checkout on `main` with one commit, and no remote. */
async function localRepo() {
	const primary = join(root, 'repo')
	await mkdir(primary)
	git(primary, 'init', '-q', '-b', 'main')
	await commit(primary, 'a.txt', 'a')
	return primary
}

/** A clone of a bare origin, so `origin/HEAD` resolves and remote branches can be deleted. */
async function clonedRepo() {
	const origin = join(root, 'origin.git')
	const seed = await localRepo()
	git(root, 'clone', '-q', '--bare', seed, origin)
	const primary = join(root, 'clone')
	git(root, 'clone', '-q', origin, primary)
	return primary
}

const add = (primary: string, name: string, ...args: string[]) => {
	const path = join(root, 'repo.worktrees', name)
	git(primary, 'worktree', 'add', '-q', ...args, path)
	return path
}

const byRoot = (entries: WorktreeEntry[], path: string) => entries.find((entry) => entry.root === path)

describe('primaryRoot', () => {
	it('resolves the primary checkout from itself and from a linked worktree', async () => {
		const primary = await localRepo()
		const linked = add(primary, 'repo-1', '-b', 'b1')
		expect(await primaryRoot({ from: primary, exec: bareExec })).toBe(primary)
		expect(await primaryRoot({ from: linked, exec: bareExec })).toBe(primary)
	})

	it('throws outside a repository', async () => {
		await expect(primaryRoot({ from: root, exec: bareExec })).rejects.toThrow(/not inside a git repository/)
	})
})

describe('listWorktrees', () => {
	it('reports the primary and linked worktrees with branch and head', async () => {
		const primary = await localRepo()
		const linked = add(primary, 'repo-1', '-b', 'b1')
		const entries = await listWorktrees({ primaryRoot: primary, exec: bareExec })
		expect(byRoot(entries, primary)).toMatchObject({ linked: false, branch: 'main', detached: false })
		expect(byRoot(entries, linked)).toMatchObject({
			linked: true,
			branch: 'b1',
			head: git(primary, 'rev-parse', 'HEAD'),
			detached: false,
			prunable: false,
		})
	})

	it('reports a detached worktree with no branch', async () => {
		const primary = await localRepo()
		const linked = add(primary, 'repo-1', '--detach')
		const entry = byRoot(await listWorktrees({ primaryRoot: primary, exec: bareExec }), linked)
		expect(entry).toMatchObject({ detached: true })
		expect(entry?.branch).toBeUndefined()
		expect(entry?.merged).toBeUndefined()
	})

	it('reports a lock reason, unquoted, and an empty reason for a bare lock', async () => {
		const primary = await localRepo()
		const leased = add(primary, 'repo-1', '-b', 'b1')
		const held = add(primary, 'repo-2', '-b', 'b2')
		const reason = JSON.stringify({ by: 'agent-harness', leaseId: 'abc', note: 'line\nbreak "quoted" ü' })
		git(primary, 'worktree', 'lock', '--reason', reason, leased)
		git(primary, 'worktree', 'lock', held)
		const entries = await listWorktrees({ primaryRoot: primary, exec: bareExec })
		expect(byRoot(entries, leased)?.locked).toBe(reason)
		expect(byRoot(entries, held)?.locked).toBe('')
		expect(byRoot(entries, primary)?.locked).toBeUndefined()
	})

	it('reports a checkout gone from disk as prunable, with no dirty reading', async () => {
		const primary = await localRepo()
		const linked = add(primary, 'repo-1', '-b', 'b1')
		await rename(linked, join(root, 'moved-away'))
		const entry = byRoot(await listWorktrees({ primaryRoot: primary, exec: bareExec }), linked)
		expect(entry?.prunable).toBe(true)
		expect(entry?.dirty).toBeUndefined()
	})

	it('counts untracked files as dirty, even when the repo hides them', async () => {
		const primary = await localRepo()
		const linked = add(primary, 'repo-1', '-b', 'b1')
		git(primary, 'config', 'status.showUntrackedFiles', 'no')
		expect(byRoot(await listWorktrees({ primaryRoot: primary, exec: bareExec }), linked)?.dirty).toBe(false)
		await mkdir(join(linked, 'nested'))
		await writeFile(join(linked, 'nested', 'new.txt'), 'x')
		expect(byRoot(await listWorktrees({ primaryRoot: primary, exec: bareExec }), linked)?.dirty).toBe(true)
	})

	it('ignores changes to the paths the caller names', async () => {
		const primary = await localRepo()
		const linked = add(primary, 'repo-1', '-b', 'b1')
		await mkdir(join(linked, '.agents/cyberlegion'), { recursive: true })
		await writeFile(join(linked, '.agents/cyberlegion/config.json'), '{}')
		const ignore = ['.agents/cyberlegion/config.json']
		expect(byRoot(await listWorktrees({ primaryRoot: primary, exec: bareExec, ignore }), linked)?.dirty).toBe(false)
		await writeFile(join(linked, 'a.txt'), 'edited')
		expect(byRoot(await listWorktrees({ primaryRoot: primary, exec: bareExec, ignore }), linked)?.dirty).toBe(true)
	})
})

describe('listWorktrees landed signals', () => {
	it('reports an ancestor of the default branch as merged, and new work as not merged', async () => {
		const primary = await localRepo()
		const landed = add(primary, 'repo-1', '-b', 'landed')
		const fresh = add(primary, 'repo-2', '-b', 'fresh')
		await commit(fresh, 'b.txt', 'b')
		const entries = await listWorktrees({ primaryRoot: primary, exec: bareExec })
		expect(byRoot(entries, landed)).toMatchObject({ merged: true, mergedSignal: 'ancestor' })
		expect(byRoot(entries, fresh)).toMatchObject({ merged: false })
		expect(byRoot(entries, fresh)?.mergedSignal).toBeUndefined()
	})

	it('recognises a squash merge by patch id', async () => {
		const primary = await localRepo()
		const feature = add(primary, 'repo-1', '-b', 'feature')
		await commit(feature, 'b.txt', 'b')
		await commit(feature, 'c.txt', 'c')
		git(primary, 'merge', '-q', '--squash', 'feature')
		git(primary, 'commit', '-q', '-m', 'squash feature')
		const entry = byRoot(await listWorktrees({ primaryRoot: primary, exec: bareExec }), feature)
		expect(entry).toMatchObject({ merged: true, mergedSignal: 'squash-patch' })
	})

	it('does not match a squash that was edited on the way in', async () => {
		const primary = await localRepo()
		const feature = add(primary, 'repo-1', '-b', 'feature')
		await commit(feature, 'b.txt', 'b')
		git(primary, 'merge', '-q', '--squash', 'feature')
		await writeFile(join(primary, 'b.txt'), 'b, edited')
		git(primary, 'commit', '-q', '-am', 'edited squash')
		expect(byRoot(await listWorktrees({ primaryRoot: primary, exec: bareExec }), feature)?.merged).toBe(false)
	})

	it('measures against origin/HEAD and reports a deleted upstream as landed', async () => {
		const primary = await clonedRepo()
		const feature = add(primary, 'repo-1', '-b', 'feature')
		await commit(feature, 'b.txt', 'b')
		git(feature, 'push', '-q', '-u', 'origin', 'feature')
		git(primary, 'push', '-q', 'origin', '--delete', 'feature')
		git(primary, 'fetch', '-q', '--prune')
		const entry = byRoot(await listWorktrees({ primaryRoot: primary, exec: bareExec }), feature)
		expect(entry).toMatchObject({ merged: true, mergedSignal: 'upstream-gone' })
	})

	it('asks the forge last, and only when given a probe', async () => {
		const primary = await localRepo()
		const feature = add(primary, 'repo-1', '-b', 'feature')
		await commit(feature, 'b.txt', 'b')
		const asked: string[] = []
		const forge = async (branch: string) => {
			asked.push(branch)
			return branch === 'feature'
		}
		expect(byRoot(await listWorktrees({ primaryRoot: primary, exec: bareExec }), feature)?.merged).toBe(false)
		const entries = await listWorktrees({ primaryRoot: primary, exec: bareExec, forge })
		expect(byRoot(entries, feature)).toMatchObject({ merged: true, mergedSignal: 'forge' })
		expect(asked).toEqual(['feature'])
	})

	it('leaves merged undetermined when there is no default branch to compare against', async () => {
		const primary = await localRepo()
		const feature = add(primary, 'repo-1', '-b', 'feature')
		git(primary, 'checkout', '-q', '--detach')
		const entry = byRoot(await listWorktrees({ primaryRoot: primary, exec: bareExec }), feature)
		expect(entry?.merged).toBeUndefined()
	})
})

describe('ghForgeMergedProbe', () => {
	const fakeExec =
		(answers: Record<string, string | null>): Exec =>
		async (cmd, args) =>
			answers[`${cmd} ${args.join(' ')}`] ?? null

	const remote = 'git -C /repo remote get-url origin'
	const prList = (slug: string) => `gh pr list --repo ${slug} --head feature --state merged --json number --limit 1`

	it('reports a merged pull request for the branch', async () => {
		const probe = ghForgeMergedProbe(
			fakeExec({ [remote]: 'git@github.com:acme/widgets.git', [prList('acme/widgets')]: '[{"number":7}]' }),
			'/repo',
		)
		expect(await probe('feature')).toBe(true)
	})

	it('reports false when no merged pull request exists', async () => {
		const probe = ghForgeMergedProbe(
			fakeExec({ [remote]: 'https://github.com/acme/widgets', [prList('acme/widgets')]: '[]' }),
			'/repo',
		)
		expect(await probe('feature')).toBe(false)
	})

	it('cannot say when there is no origin, gh fails, or gh answers garbage', async () => {
		expect(await ghForgeMergedProbe(fakeExec({}), '/repo')('feature')).toBeUndefined()
		expect(
			await ghForgeMergedProbe(fakeExec({ [remote]: 'git@github.com:acme/widgets.git' }), '/repo')('feature'),
		).toBeUndefined()
		expect(
			await ghForgeMergedProbe(
				fakeExec({ [remote]: 'git@github.com:acme/widgets.git', [prList('acme/widgets')]: 'not json' }),
				'/repo',
			)('feature'),
		).toBeUndefined()
	})
})
