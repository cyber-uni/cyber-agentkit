import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Exec } from './exec.js'
import { LEASE_LIBRARY } from './owner.js'
import type { ProcessInfo, ProcessSource } from './process-source.js'
import { type RemoveWorktreeOptions, removeWorktree } from './remove-worktree.js'

const isolated = {
	...process.env,
	GIT_CONFIG_GLOBAL: '/dev/null',
	GIT_CONFIG_SYSTEM: '/dev/null',
	GIT_AUTHOR_NAME: 'test',
	GIT_AUTHOR_EMAIL: 'test@example.invalid',
	GIT_COMMITTER_NAME: 'test',
	GIT_COMMITTER_EMAIL: 'test@example.invalid',
}

const exec: Exec = async (cmd, args) => {
	try {
		return execFileSync(cmd, [...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: isolated }).trim()
	} catch {
		return null
	}
}

const git = (cwd: string, ...args: string[]) =>
	execFileSync('git', args, { cwd, encoding: 'utf8', env: isolated, stdio: ['ignore', 'pipe', 'pipe'] }).trim()

const fixed =
	(processes: ProcessInfo[]): ProcessSource =>
	async () =>
		processes

const claude = (pid: number, cwd: string): ProcessInfo => ({
	pid,
	ppid: 1,
	exe: '/home/u/.local/share/claude/versions/2.1.291',
	argv: ['claude'],
	cwd,
	env: {},
})

let root: string
let primary: string

function addWorktree(path: string, branch: string) {
	git(primary, 'worktree', 'add', '-q', '-b', branch, path)
	return path
}

const slot = (n: number) => join(root, 'repo.worktrees', `repo-${n}`)

async function lock(worktree: string, reason: string) {
	await writeFile(join(git(worktree, 'rev-parse', '--path-format=absolute', '--git-dir'), 'locked'), reason)
}

const run = (target: string, options: Partial<RemoveWorktreeOptions> = {}) =>
	removeWorktree({ primaryRoot: primary, root: target, exec, source: fixed([]), ...options })

beforeEach(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'agent-harness-remove-')))
	primary = join(root, 'repo')
	await mkdir(primary)
	git(primary, 'init', '-q', '-b', 'main')
	await writeFile(join(primary, 'a.txt'), 'a')
	git(primary, 'add', '-A')
	git(primary, 'commit', '-q', '-m', 'init')
})

afterEach(async () => {
	await rm(root, { recursive: true, force: true })
})

describe('removeWorktree', () => {
	it('removes a landed, clean, idle slot', async () => {
		const wt = addWorktree(slot(1), 'feat-1')

		const outcome = await run(wt)

		expect(outcome).toMatchObject({ root: wt, branch: 'feat-1', owner: 'self', status: 'removed' })
		expect(existsSync(wt)).toBe(false)
	})

	it('never removes the primary checkout, force or not', async () => {
		for (const force of [false, true]) {
			expect(await run(primary, { force })).toMatchObject({ status: 'skipped', reason: 'primary' })
		}
		expect(existsSync(primary)).toBe(true)
	})

	it('reports a path that is no worktree as unlisted', async () => {
		const outcome = await run(join(root, 'nowhere'), { force: true })

		expect(outcome).toMatchObject({ status: 'skipped', reason: 'unlisted', owner: 'unknown' })
	})

	it('skips a dirty and an unmerged worktree, and force removes them', async () => {
		const dirty = addWorktree(slot(1), 'feat-1')
		await writeFile(join(dirty, 'scratch.txt'), 'x')
		const unmerged = addWorktree(slot(2), 'feat-2')
		await writeFile(join(unmerged, 'b.txt'), 'b')
		git(unmerged, 'add', '-A')
		git(unmerged, 'commit', '-q', '-m', 'work')

		expect(await run(dirty)).toMatchObject({ status: 'skipped', reason: 'dirty' })
		expect(await run(unmerged)).toMatchObject({ status: 'skipped', reason: 'unmerged' })
		expect(await run(dirty, { force: true })).toMatchObject({ status: 'removed' })
		expect(await run(unmerged, { force: true })).toMatchObject({ status: 'removed' })
		expect(existsSync(dirty) || existsSync(unmerged)).toBe(false)
	})

	it('skips a foreign worktree, and force removes an unlocked one', async () => {
		const legacy = addWorktree(join(root, 'repo.worktrees', 'old-branch'), 'old-branch')

		expect(await run(legacy)).toMatchObject({ owner: 'unknown', status: 'skipped', reason: 'foreign' })
		expect(await run(legacy, { force: true })).toMatchObject({ status: 'removed' })
		expect(existsSync(legacy)).toBe(false)
	})

	it('keeps a foreign-locked worktree under force: git refuses a single --force', async () => {
		const wt = addWorktree(slot(1), 'feat-1')
		await lock(wt, 'someone else')

		expect(await run(wt, { force: true })).toMatchObject({ status: 'failed' })
		expect(existsSync(wt)).toBe(true)
	})

	it('never breaks a lease, force or not', async () => {
		const wt = addWorktree(slot(1), 'feat-1')
		await lock(wt, JSON.stringify({ library: LEASE_LIBRARY, leaseId: 'l1', holder: 'h' }))

		for (const force of [false, true]) {
			expect(await run(wt, { force })).toMatchObject({ owner: 'self', status: 'skipped', reason: 'leased' })
		}
		expect(existsSync(wt)).toBe(true)
	})

	it('skips a busy worktree, and force removes it, reporting the session without killing it', async () => {
		const wt = addWorktree(slot(1), 'feat-1')
		const source = fixed([claude(100, wt)])

		const skipped = await run(wt, { source })
		expect(skipped).toMatchObject({ status: 'skipped', reason: 'busy' })
		expect(skipped.occupants).toHaveLength(1)

		const forced = await run(wt, { source, force: true })
		expect(forced).toMatchObject({ status: 'removed' })
		expect(forced.occupants).toHaveLength(1)
	})

	it('skips as unverified when the probe cannot read, unless force', async () => {
		const wt = addWorktree(slot(1), 'feat-1')
		const unreadable: ProcessSource = async () => null

		expect(await run(wt, { source: unreadable })).toMatchObject({ status: 'skipped', reason: 'unverified' })
		expect(await run(wt, { source: unreadable, force: true })).toMatchObject({ status: 'removed' })
	})

	it('skips a prunable worktree, and force removes its entry', async () => {
		const wt = addWorktree(slot(1), 'feat-1')
		await rm(wt, { recursive: true, force: true })

		expect(await run(wt)).toMatchObject({ status: 'skipped', reason: 'prunable' })
		expect(await run(wt, { force: true })).toMatchObject({ status: 'removed' })
		expect(git(primary, 'worktree', 'list', '--porcelain')).not.toContain('repo.worktrees')
	})
})
