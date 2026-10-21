import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Exec } from './exec.js'
import { nodeSeedFs, type SeedFs, seedWorktree } from './seed-worktree.js'

// Real git: which files match and which are ignored is git's own `.gitignore` semantics.

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

async function put(root: string, path: string, body = path) {
	await mkdir(dirname(join(root, path)), { recursive: true })
	await writeFile(join(root, path), body)
}

let root: string
let primary: string
let worktree: string

beforeEach(async () => {
	root = await realpath(await mkdtemp(join(tmpdir(), 'agent-harness-seed-')))
	primary = join(root, 'repo')
	await mkdir(primary)
	git(primary, 'init', '-q', '-b', 'main')
	await put(primary, '.gitignore', '.env\n.env.*\nsecrets/\nnode_modules/\n')
	await put(primary, 'tracked.json')
	git(primary, 'add', '-A')
	git(primary, 'commit', '-q', '-m', 'init')
	worktree = join(root, 'repo.worktrees', 'repo-1')
	git(primary, 'worktree', 'add', '-q', '--detach', worktree)
})

afterEach(async () => {
	await rm(root, { recursive: true, force: true })
})

describe('seedWorktree', () => {
	it('reports absent and copies nothing without a .worktreeinclude', async () => {
		await put(primary, '.env')
		expect(await seedWorktree(primary, worktree, { exec })).toEqual({ include: 'absent', copied: [], skipped: [] })
	})

	it('copies only files that match a pattern and are gitignored', async () => {
		await put(primary, '.worktreeinclude', '# env files\n.env\n.env.local\nsecrets/\ntracked.json\nnotes.txt\n')
		await put(primary, '.env', 'A=1')
		await put(primary, '.env.local')
		await put(primary, '.env.production')
		await put(primary, 'secrets/deep/key.pem')
		await put(primary, 'notes.txt')
		await put(primary, 'node_modules/pkg/index.js')

		const inventory = await seedWorktree(primary, worktree, { exec })

		expect(inventory.include).toBe('present')
		expect(inventory.copied.sort()).toEqual(['.env', '.env.local', 'secrets/deep/key.pem'])
		// Untracked but not ignored: work that belongs to the source checkout.
		expect(inventory.skipped).toEqual([{ path: 'notes.txt', reason: 'not-ignored' }])
		expect(await readFile(join(worktree, '.env'), 'utf8')).toBe('A=1')
		expect(await readFile(join(worktree, 'secrets/deep/key.pem'), 'utf8')).toBe('secrets/deep/key.pem')
	})

	it('honours negation, as .gitignore does', async () => {
		await put(primary, '.worktreeinclude', '.env.*\n!.env.production\n')
		await put(primary, '.env.local')
		await put(primary, '.env.production')
		const inventory = await seedWorktree(primary, worktree, { exec })
		expect(inventory.copied).toEqual(['.env.local'])
	})

	it('keeps a file the worktree already has unless overwrite is set', async () => {
		await put(primary, '.worktreeinclude', '.env\n')
		await put(primary, '.env', 'source')
		await put(worktree, '.env', 'edited')

		expect(await seedWorktree(primary, worktree, { exec })).toEqual({
			include: 'present',
			copied: [],
			skipped: [{ path: '.env', reason: 'exists' }],
		})
		expect(await readFile(join(worktree, '.env'), 'utf8')).toBe('edited')

		expect((await seedWorktree(primary, worktree, { exec, overwrite: true })).copied).toEqual(['.env'])
		expect(await readFile(join(worktree, '.env'), 'utf8')).toBe('source')
	})

	it('copies paths with spaces and glob characters literally', async () => {
		await put(primary, '.gitignore', 'local/\n')
		await put(primary, '.worktreeinclude', 'local/\n')
		await put(primary, 'local/a b [x].txt')
		await put(primary, 'local/a b x.txt')
		const inventory = await seedWorktree(primary, worktree, { exec })
		expect(inventory.copied.sort()).toEqual(['local/a b [x].txt', 'local/a b x.txt'])
	})

	it('records a failed copy and carries on', async () => {
		await put(primary, '.worktreeinclude', '.env*\n')
		await put(primary, '.env')
		await put(primary, '.env.local')
		const fs: SeedFs = {
			...nodeSeedFs,
			copyFile: async (from, to) => {
				if (from.endsWith('.env')) throw new Error('denied')
				await nodeSeedFs.copyFile(from, to)
			},
		}
		const inventory = await seedWorktree(primary, worktree, { exec, fs })
		expect(inventory.copied).toEqual(['.env.local'])
		expect(inventory.skipped).toEqual([{ path: '.env', reason: 'failed', error: 'denied' }])
	})

	it('reports unknown and copies nothing when git cannot answer', async () => {
		await put(primary, '.worktreeinclude', '.env\n')
		await put(primary, '.env')
		const inventory = await seedWorktree(primary, worktree, { exec: async () => null })
		expect(inventory).toEqual({ include: 'unknown', copied: [], skipped: [] })
	})

	it('runs no command but git', async () => {
		await put(primary, '.worktreeinclude', '.env\n')
		await put(primary, '.env')
		const commands = new Set<string>()
		await seedWorktree(primary, worktree, {
			exec: (cmd, args) => {
				commands.add(cmd)
				return exec(cmd, args)
			},
		})
		expect([...commands]).toEqual(['git'])
	})
})
