import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Exec } from './exec.js'
import { LEASE_LIBRARY } from './owner.js'
import type { ProcessInfo, ProcessSource } from './process-source.js'
import { type PruneWorktreesOptions, pruneWorktrees } from './prune-worktrees.js'

// Real git for the worktrees; processes come from fixtures shaped like E-PROC-CC1 and E-PROC-CC2.

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

const unreadable: ProcessSource = async () => null

const claude = (pid: number, cwd: string): ProcessInfo => ({
	pid,
	ppid: 1,
	exe: '/home/u/.local/share/claude/versions/2.1.291',
	argv: ['claude'],
	cwd,
	env: {},
})

const orphanedVite = (pid: number, cwd: string): ProcessInfo => ({
	pid,
	ppid: 1,
	exe: '/usr/bin/node',
	argv: ['node', 'vite'],
	cwd,
	env: { CLAUDECODE: '1', CLAUDE_CODE_CHILD_SESSION: '1', CLAUDE_PID: '999', CLAUDE_CODE_SESSION_ID: 'gone' },
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

const run = (options: Partial<PruneWorktreesOptions> = {}) =>
	pruneWorktrees({ primaryRoot: primary, exec, source: fixed([]), ...options })

beforeEach(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'agent-harness-prune-')))
	primary = join(root, 'repo')
	await mkdir(primary)
	git(primary, 'init', '-q', '-b', 'main')
	await writeFile(join(primary, '.gitignore'), 'node_modules/\n')
	git(primary, 'add', '-A')
	git(primary, 'commit', '-q', '-m', 'init')
})

afterEach(async () => {
	await rm(root, { recursive: true, force: true })
})

describe('pruneWorktrees', () => {
	it('is a dry run by default: reports a landed, clean worktree as a candidate and removes nothing', async () => {
		const wt = addWorktree(slot(1), 'feat-1')

		const report = await run()

		expect(report).toEqual({
			applied: false,
			worktrees: [
				{
					root: primary,
					branch: 'main',
					owner: 'user',
					status: 'skipped',
					reason: 'primary',
					occupants: [],
					lingering: [],
					unlinked: [],
				},
				{
					root: wt,
					branch: 'feat-1',
					owner: 'self',
					status: 'candidate',
					occupants: [],
					lingering: [],
					unlinked: [],
				},
			],
		})
		expect(existsSync(wt)).toBe(true)
	})

	it('removes the candidates and runs git worktree prune when applied', async () => {
		const wt = addWorktree(slot(1), 'feat-1')
		await mkdir(join(wt, 'node_modules'))
		await writeFile(join(wt, 'node_modules', 'pkg.js'), '')
		const gone = addWorktree(slot(2), 'feat-2')
		await rm(gone, { recursive: true, force: true })

		const report = await run({ apply: true })

		expect(report.applied).toBe(true)
		expect(report.pruned).toBe(true)
		expect(report.worktrees.find((outcome) => outcome.root === wt)?.status).toBe('removed')
		expect(report.worktrees.find((outcome) => outcome.root === gone)?.reason).toBe('prunable')
		expect(existsSync(wt)).toBe(false)
		expect(git(primary, 'worktree', 'list', '--porcelain')).not.toContain('repo.worktrees')
	})

	it('never removes the primary checkout', async () => {
		const report = await run({ apply: true })
		expect(report.worktrees).toMatchObject([{ root: primary, status: 'skipped', reason: 'primary' }])
		expect(existsSync(join(primary, '.git'))).toBe(true)
	})

	it('leaves a worktree outside the library layout as foreign', async () => {
		const elsewhere = addWorktree(join(root, 'elsewhere'), 'feat-1')
		const misnamed = addWorktree(join(root, 'repo.worktrees', 'feat-x'), 'feat-2')
		const claudeCode = addWorktree(join(primary, '.claude', 'worktrees', 'w1'), 'feat-3')

		const report = await run({ apply: true })

		expect(report.worktrees.slice(1)).toMatchObject([
			{ root: elsewhere, owner: 'unknown', reason: 'foreign' },
			{ root: misnamed, owner: 'unknown', reason: 'foreign' },
			{ root: claudeCode, owner: 'claude-code', reason: 'foreign' },
		])
		expect([elsewhere, misnamed, claudeCode].every((path) => existsSync(path))).toBe(true)
	})

	it('leaves a worktree locked by anyone else as foreign, even in the library layout', async () => {
		const byClaude = addWorktree(slot(1), 'feat-1')
		const byUser = addWorktree(slot(2), 'feat-2')
		await lock(byClaude, 'claude session w1 (pid 10 start 5)')
		await lock(byUser, '')

		const report = await run({ apply: true })

		expect(report.worktrees.slice(1)).toMatchObject([
			{ root: byClaude, owner: 'claude-code', reason: 'foreign' },
			{ root: byUser, owner: 'unknown', reason: 'foreign' },
		])
	})

	it('leaves a leased worktree', async () => {
		const wt = addWorktree(slot(1), 'feat-1')
		await lock(wt, JSON.stringify({ library: LEASE_LIBRARY, leaseId: 'l-1', holder: 'pod' }))

		const report = await run({ apply: true })

		expect(report.worktrees[1]).toMatchObject({ root: wt, owner: 'self', status: 'skipped', reason: 'leased' })
		expect(existsSync(wt)).toBe(true)
	})

	it('leaves a busy worktree and reports a lingering service in it without killing it', async () => {
		const wt = addWorktree(slot(1), 'feat-1')
		const idle = addWorktree(slot(2), 'feat-2')

		const report = await run({ apply: true, source: fixed([claude(10, wt), orphanedVite(20, idle)]) })

		expect(report.worktrees[1]).toMatchObject({
			root: wt,
			status: 'skipped',
			reason: 'busy',
			occupants: [{ harness: 'claude-code', pid: 10 }],
		})
		expect(report.worktrees[2]).toMatchObject({
			root: idle,
			status: 'removed',
			lingering: [{ pid: 20, reason: 'session-gone' }],
		})
	})

	it('skips every worktree when the probe cannot read processes, unless the caller opts out of strictness', async () => {
		const wt = addWorktree(slot(1), 'feat-1')

		const strict = await run({ apply: true, source: unreadable })
		expect(strict.worktrees[1]).toMatchObject({ root: wt, status: 'skipped', reason: 'unverified' })
		expect(existsSync(wt)).toBe(true)

		const lenient = await run({ apply: true, source: unreadable, strict: false })
		expect(lenient.worktrees[1]).toMatchObject({ root: wt, status: 'removed', unverified: true })
	})

	it('leaves a dirty worktree, unless the change is on the ignore list', async () => {
		const wt = addWorktree(slot(1), 'feat-1')
		await mkdir(join(wt, '.agents'))
		await writeFile(join(wt, '.agents', 'marker.json'), '{}')

		expect((await run({ apply: true })).worktrees[1]).toMatchObject({ reason: 'dirty' })

		const report = await run({ apply: true, ignore: ['.agents/marker.json'] })
		expect(report.worktrees[1]).toMatchObject({ root: wt, status: 'removed' })
		expect(existsSync(wt)).toBe(false)
	})

	it('leaves a worktree whose branch has not landed, or whose landing cannot be told', async () => {
		const unmerged = addWorktree(slot(1), 'feat-1')
		await writeFile(join(unmerged, 'work.txt'), 'work')
		git(unmerged, 'add', '-A')
		git(unmerged, 'commit', '-q', '-m', 'work')
		const detached = slot(2)
		git(primary, 'worktree', 'add', '-q', '--detach', detached)

		const report = await run({ apply: true })

		expect(report.worktrees.slice(1)).toMatchObject([
			{ root: unmerged, reason: 'unmerged' },
			{ root: detached, reason: 'merge-unknown' },
		])
	})

	it('considers only the given roots', async () => {
		const one = addWorktree(slot(1), 'feat-1')
		const two = addWorktree(slot(2), 'feat-2')

		const report = await run({ apply: true, roots: [two] })

		expect(report.worktrees.map((outcome) => outcome.root)).toEqual([two])
		expect(existsSync(one)).toBe(true)
		expect(existsSync(two)).toBe(false)
	})
})
