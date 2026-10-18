import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AcquireError, type AcquireOptions, acquire, explain, type WorktreeCreator } from './acquire.js'
import type { Exec } from './exec.js'
import { type LeaseFs, leaseFile, nodeLeaseFs, release } from './lease.js'
import { probeProcesses } from './occupancy.js'
import { LEASE_LIBRARY } from './owner.js'
import type { ProcessInfo } from './process-source.js'

// Real git repos; the process probe is a fixture shaped like E-PROC-CC1.

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

const probeOf = (processes: ProcessInfo[] | null) => probeProcesses({ source: async () => processes })

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
const slot = (n: number) => join(root, 'repo.worktrees', `repo-${n}`)

let leaseCount = 0
async function options(extra: Partial<AcquireOptions> = {}): Promise<AcquireOptions> {
	return {
		primaryRoot: primary,
		holder: 'pod-a',
		exec,
		probe: await probeOf([]),
		newLeaseId: () => `lease-${++leaseCount}`,
		...extra,
	}
}

async function commitOnMain(file: string) {
	await writeFile(join(primary, file), file)
	git(primary, 'add', '-A')
	git(primary, 'commit', '-q', '-m', file)
}

beforeEach(async () => {
	leaseCount = 0
	root = await realpath(await mkdtemp(join(tmpdir(), 'agent-harness-acquire-')))
	primary = join(root, 'repo')
	await mkdir(primary)
	git(primary, 'init', '-q', '-b', 'main')
	await writeFile(join(primary, '.gitignore'), 'node_modules/\n')
	await commitOnMain('a.txt')
})

afterEach(async () => {
	await rm(root, { recursive: true, force: true })
})

describe('acquire', () => {
	it('creates the first slot, detached at the base, and leases it', async () => {
		const result = await acquire(await options())
		expect(result).toEqual({
			worktree: slot(1),
			leaseId: 'lease-1',
			holder: 'pod-a',
			commonDir: join(primary, '.git'),
			reused: false,
			verified: true,
			lingering: [],
		})
		expect(git(slot(1), 'rev-parse', 'HEAD')).toBe(git(primary, 'rev-parse', 'main'))
		const reason = await readFile((await leaseFile(slot(1), exec))!, 'utf8')
		expect(JSON.parse(reason)).toEqual({ library: LEASE_LIBRARY, leaseId: 'lease-1', holder: 'pod-a' })
	})

	it('creates a new branch at the base when asked', async () => {
		const result = await acquire(await options({ branch: 'feat/x' }))
		expect(result.branch).toBe('feat/x')
		expect(git(slot(1), 'branch', '--show-current')).toBe('feat/x')
	})

	it('never hands out a leased worktree, whatever the probe sees', async () => {
		await acquire(await options())
		const second = await acquire(await options({ holder: 'pod-b' }))
		expect(second.worktree).toBe(slot(2))
		const verdicts = await explain(await options())
		expect(verdicts.map((v) => [v.worktree.root, v.skip, v.holder])).toEqual([
			[primary, 'primary', undefined],
			[slot(1), 'leased', 'pod-a'],
			[slot(2), 'leased', 'pod-b'],
		])
	})

	it('reuses a released worktree, resetting it to the base and keeping node_modules', async () => {
		const first = await acquire(await options({ ignore: ['marker.txt'] }))
		await mkdir(join(slot(1), 'node_modules'))
		await writeFile(join(slot(1), 'node_modules', 'dep.js'), 'dep')
		await writeFile(join(slot(1), 'marker.txt'), 'tool marker')
		expect(await release(first, { exec })).toEqual({ released: true })
		await commitOnMain('b.txt')

		const second = await acquire(await options({ holder: 'pod-b', ignore: ['marker.txt'] }))
		expect(second).toMatchObject({ worktree: slot(1), leaseId: 'lease-2', holder: 'pod-b', reused: true })
		expect(git(slot(1), 'rev-parse', 'HEAD')).toBe(git(primary, 'rev-parse', 'main'))
		expect(git(slot(1), 'status', '--porcelain', '--untracked-files=all')).toBe('')
		expect(await readFile(join(slot(1), 'node_modules', 'dep.js'), 'utf8')).toBe('dep')
		expect(await readFile(join(slot(1), 'b.txt'), 'utf8')).toBe('b.txt')
	})

	it('deletes the previous branch when it has landed, and reports it', async () => {
		const first = await acquire(await options({ branch: 'feat/old' }))
		await writeFile(join(slot(1), 'old.txt'), 'old')
		git(slot(1), 'add', '-A')
		git(slot(1), 'commit', '-q', '-m', 'old')
		git(primary, 'merge', '-q', '--ff-only', 'feat/old')
		await release(first, { exec })

		const second = await acquire(await options({ branch: 'feat/new' }))
		expect(second).toMatchObject({
			reused: true,
			branch: 'feat/new',
			previousBranch: 'feat/old',
			previousBranchDeleted: true,
		})
		expect(git(slot(1), 'branch', '--show-current')).toBe('feat/new')
		expect(git(primary, 'branch', '--list', 'feat/old')).toBe('')
	})

	it('skips an unmerged or dirty worktree and creates another', async () => {
		const unmerged = await acquire(await options({ branch: 'feat/wip' }))
		await writeFile(join(slot(1), 'wip.txt'), 'wip')
		git(slot(1), 'add', '-A')
		git(slot(1), 'commit', '-q', '-m', 'wip')
		await release(unmerged, { exec })
		const dirty = await acquire(await options())
		await writeFile(join(slot(2), 'scratch.txt'), 'scratch')
		await release(dirty, { exec })

		expect((await acquire(await options())).worktree).toBe(slot(3))
		const skips = (await explain(await options())).map((v) => v.skip)
		expect(skips).toEqual(['primary', 'unmerged', 'dirty', 'leased'])
	})

	it('skips a worktree a live agent session works in', async () => {
		await release(await acquire(await options()), { exec })
		const busy = await options({ probe: await probeOf([claude(10, join(slot(1), 'src'))]) })
		expect((await acquire(busy)).worktree).toBe(slot(2))
		const verdict = (await explain(busy))[1]!
		expect(verdict.skip).toBe('busy')
		expect(verdict.occupancy?.occupants.map((session) => session.pid)).toEqual([10])
	})

	it('reports lingering dev services in a reused worktree without touching them', async () => {
		await release(await acquire(await options()), { exec })
		const orphan: ProcessInfo = {
			pid: 20,
			ppid: 1,
			exe: '/usr/bin/node',
			argv: ['node', 'vite'],
			cwd: slot(1),
			env: { CLAUDECODE: '1', CLAUDE_CODE_CHILD_SESSION: '1', CLAUDE_PID: '999' },
		}
		const result = await acquire(await options({ probe: await probeOf([orphan]) }))
		expect(result.reused).toBe(true)
		expect(result.lingering.map((process) => [process.pid, process.reason])).toEqual([[20, 'session-gone']])
	})

	it('reuses unverified when the probe cannot read processes, unless strict', async () => {
		await release(await acquire(await options()), { exec })
		const unknown = await probeOf(null)
		expect((await explain(await options({ probe: unknown, strict: true })))[1]!.skip).toBe('unverified')
		const result = await acquire(await options({ probe: unknown }))
		expect(result).toMatchObject({ worktree: slot(1), reused: true, verified: false })
	})

	it('leaves foreign worktrees alone, including a locked slot', async () => {
		git(primary, 'worktree', 'add', '-q', '--detach', join(root, 'repo.worktrees', 'feature-x'))
		git(primary, 'worktree', 'add', '-q', '--detach', slot(1))
		git(primary, 'worktree', 'lock', '--reason', 'on a USB drive', slot(1))
		expect((await acquire(await options())).worktree).toBe(slot(2))
		const verdicts = await explain(await options())
		expect(verdicts.map((v) => [v.worktree.root, v.skip, v.owner.owner])).toEqual([
			[primary, 'primary', 'user'],
			[join(root, 'repo.worktrees', 'feature-x'), 'foreign', 'unknown'],
			[slot(1), 'foreign', 'unknown'],
			[slot(2), 'leased', 'self'],
		])
	})

	it('applies the caller predicate after the safety checks', async () => {
		await release(await acquire(await options()), { exec })
		const picky = await options({ available: () => false })
		expect((await acquire(picky)).worktree).toBe(slot(2))
		expect((await explain(picky))[1]!.skip).toBe('rejected')
	})

	it('creates no more than max slots', async () => {
		await acquire(await options({ max: 1 }))
		const error = await acquire(await options({ max: 1 })).catch((e: unknown) => e)
		expect(error).toBeInstanceOf(AcquireError)
		expect(error).toMatchObject({ code: 'pool-full' })
		expect((error as AcquireError).verdicts.map((v) => v.skip)).toEqual(['primary', 'leased'])
	})

	it('assigns the lowest unused slot number', async () => {
		const first = await acquire(await options())
		await acquire(await options())
		await release(first, { exec })
		git(primary, 'worktree', 'remove', slot(1))
		expect((await acquire(await options())).worktree).toBe(slot(1))
	})

	it('hands the injected creator the library-chosen path', async () => {
		const requests: Parameters<WorktreeCreator>[0][] = []
		const create: WorktreeCreator = async (request) => {
			requests.push(request)
			git(primary, 'worktree', 'add', '-q', '--detach', request.path, request.base)
		}
		const result = await acquire(await options({ create }))
		expect(requests).toEqual([
			{ primaryRoot: primary, path: slot(1), base: git(primary, 'rev-parse', 'main'), branch: undefined },
		])
		expect(result.worktree).toBe(slot(1))
	})

	it('moves on when `git worktree lock` overwrites the lease right after the claim', async () => {
		await release(await acquire(await options()), { exec })
		let raced = false
		const racing: LeaseFs = {
			...nodeLeaseFs,
			async createExclusive(path, text) {
				const created = await nodeLeaseFs.createExclusive(path, text)
				if (created && !raced) {
					raced = true
					await writeFile(path, 'user lock')
				}
				return created
			},
		}
		const result = await acquire(await options({ fs: racing }))
		expect(result.worktree).toBe(slot(2))
		expect((await explain(await options()))[1]).toMatchObject({ skip: 'foreign', worktree: { locked: 'user lock' } })
	})

	it('undoes the creator side effects when the created slot loses its claim, and retries', async () => {
		const made: string[] = []
		const undone: string[] = []
		const create: WorktreeCreator = async (request) => {
			made.push(request.path)
			git(primary, 'worktree', 'add', '-q', '--detach', request.path, request.base)
		}
		let raced = false
		const racing: LeaseFs = {
			...nodeLeaseFs,
			async createExclusive(path, text) {
				if (!raced) {
					raced = true
					await writeFile(path, 'user lock')
				}
				return nodeLeaseFs.createExclusive(path, text)
			},
		}
		const result = await acquire(
			await options({
				create,
				fs: racing,
				undoCreate: async (request) => {
					undone.push(request.path)
				},
			}),
		)
		expect(undone).toEqual([slot(1)])
		expect(made).toEqual([slot(1), slot(2)])
		expect(result.worktree).toBe(slot(2))
		// The checkout itself is left to whoever holds the lock.
		expect(git(slot(1), 'rev-parse', 'HEAD')).toBeTruthy()
	})

	it('does not undo a creator whose claim held', async () => {
		const undone: string[] = []
		await acquire(await options({ undoCreate: async (request) => void undone.push(request.path) }))
		expect(undone).toEqual([])
	})

	it('fails when there is no base to reset to', async () => {
		const error = await acquire(await options({ base: 'nope' })).catch((e: unknown) => e)
		expect(error).toMatchObject({ code: 'no-base' })
	})
})

describe('release', () => {
	it('releases only the lease it is given', async () => {
		const lease = await acquire(await options())
		expect(await release({ ...lease, leaseId: 'other' }, { exec })).toEqual({ released: false, reason: 'lost' })
		expect(await release(lease, { exec })).toEqual({ released: true })
		expect(await release(lease, { exec })).toEqual({ released: false, reason: 'lost' })
	})

	it('reports a lease broken by `git worktree unlock` as lost', async () => {
		const lease = await acquire(await options())
		git(primary, 'worktree', 'unlock', slot(1))
		expect(await release(lease, { exec })).toEqual({ released: false, reason: 'lost' })
	})

	it('clears the lock of a leased worktree whose directory is gone, so prune can take it', async () => {
		const lease = await acquire(await options())
		await rm(slot(1), { recursive: true, force: true })
		expect(await release(lease, { exec })).toEqual({ released: true })
		git(primary, 'worktree', 'prune')
		expect(git(primary, 'worktree', 'list', '--porcelain')).not.toContain(slot(1))
	})

	it('does not recycle', async () => {
		const lease = await acquire(await options())
		await writeFile(join(slot(1), 'scratch.txt'), 'scratch')
		await release(lease, { exec })
		expect(await readFile(join(slot(1), 'scratch.txt'), 'utf8')).toBe('scratch')
	})
})
