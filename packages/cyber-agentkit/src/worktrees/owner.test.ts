import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { listWorktrees } from './list-worktrees.js'
import { classifyOwner, LEASE_LIBRARY, parseLeaseReason } from './owner.js'

// Real git: the lease and Claude Code rules read the lock reason back through porcelain, whose
// quoting is git's behaviour, not ours.

const isolated = {
	...process.env,
	GIT_CONFIG_GLOBAL: '/dev/null',
	GIT_CONFIG_SYSTEM: '/dev/null',
	GIT_AUTHOR_NAME: 'test',
	GIT_AUTHOR_EMAIL: 'test@example.invalid',
	GIT_COMMITTER_NAME: 'test',
	GIT_COMMITTER_EMAIL: 'test@example.invalid',
}

const git = (cwd: string, ...args: string[]) =>
	execFileSync('git', args, { cwd, encoding: 'utf8', env: isolated, stdio: ['ignore', 'pipe', 'pipe'] }).trim()

let root: string
let primary: string

beforeEach(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'agent-harness-owner-')))
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

const add = (path: string) => {
	git(primary, 'worktree', 'add', '-q', '--detach', path)
	return path
}

/** Lock the way the lease store does: exclusive-create the `locked` file (E-GIT-L1). */
async function lease(path: string, reason: string) {
	const id = git(path, 'rev-parse', '--git-dir').split('/').at(-1)!
	await writeFile(join(primary, '.git', 'worktrees', id, 'locked'), reason, { flag: 'wx' })
}

async function ownerOf(path: string, codexHome?: string) {
	const entries = await listWorktrees({ primaryRoot: primary })
	const entry = entries.find((entry) => entry.root === path)!
	return classifyOwner(entry, { primaryRoot: primary, codexHome }).owner
}

const leaseReason = JSON.stringify({ library: LEASE_LIBRARY, leaseId: 'l-1', holder: 'pod "a"\nb' })

describe('classifyOwner', () => {
	it('classifies the primary checkout as the user', async () => {
		expect(await ownerOf(primary)).toBe('user')
	})

	it('classifies a worktree holding our lease as self, through porcelain quoting', async () => {
		const path = add(join(root, 'repo.worktrees', 'repo-1'))
		await lease(path, leaseReason)
		expect(await ownerOf(path)).toBe('self')
	})

	it('classifies a worktree locked by a Claude Code session as claude-code, wherever it lives', async () => {
		const path = add(join(root, 'repo.worktrees', 'repo-1'))
		git(primary, 'worktree', 'lock', '--reason', 'claude session x (pid 1 start 2)', path)
		expect(await ownerOf(path)).toBe('claude-code')
	})

	it('classifies an unlocked worktree under .claude/worktrees as claude-code', async () => {
		const path = add(join(primary, '.claude', 'worktrees', 'x'))
		expect(await ownerOf(path)).toBe('claude-code')
	})

	it('classifies a worktree under $CODEX_HOME/worktrees as codex only when the home is given', async () => {
		const codexHome = join(root, 'codex')
		const path = add(join(codexHome, 'worktrees', 'x'))
		expect(await ownerOf(path, codexHome)).toBe('codex')
		expect(await ownerOf(path)).toBe('unknown')
	})

	it('does not take a sibling folder sharing the prefix for Codex', async () => {
		const codexHome = join(root, 'codex')
		const path = add(join(root, 'codex', 'worktrees-old', 'x'))
		expect(await ownerOf(path, codexHome)).toBe('unknown')
	})

	it('classifies an unlocked worktree at one of our slots as self: a released lease', async () => {
		const path = add(join(root, 'repo.worktrees', 'repo-1'))
		expect(await ownerOf(path)).toBe('self')
	})

	it('classifies an unmarked worktree off our slot names as unknown', async () => {
		expect(await ownerOf(add(join(root, 'repo.worktrees', 'feature-x')))).toBe('unknown')
		expect(await ownerOf(add(join(root, 'repo.worktrees', 'repo-01')))).toBe('unknown')
		expect(await ownerOf(add(join(root, 'elsewhere', 'repo-2')))).toBe('unknown')
	})

	it('classifies a lock with a foreign reason as unknown', async () => {
		const path = add(join(root, 'repo.worktrees', 'repo-1'))
		git(primary, 'worktree', 'lock', '--reason', 'on a USB drive', path)
		expect(await ownerOf(path)).toBe('unknown')
	})

	it('cites the evidence each harness rule rests on', async () => {
		const path = add(join(primary, '.claude', 'worktrees', 'x'))
		const entry = (await listWorktrees({ primaryRoot: primary })).find((entry) => entry.root === path)!
		expect(classifyOwner(entry, { primaryRoot: primary }).research).toEqual(['E-CC-W1'])
	})
})

describe('parseLeaseReason', () => {
	it('reads back our lease', () => {
		expect(parseLeaseReason(leaseReason)).toEqual({ library: LEASE_LIBRARY, leaseId: 'l-1', holder: 'pod "a"\nb' })
	})

	it.each([
		undefined,
		'',
		'claude session x',
		'[]',
		'null',
		'{"library":"other","leaseId":"a","holder":"b"}',
		`{"library":"${LEASE_LIBRARY}","leaseId":1,"holder":"b"}`,
	])('rejects %j', (reason) => {
		expect(parseLeaseReason(reason)).toBeUndefined()
	})
})
