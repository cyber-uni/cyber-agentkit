import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { comparePaths, type ProjectFolderCache, projectReferenceFolders } from './reference-projects.js'

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), 'reference-projects-'))
}

function write(root: string, relPath: string, content = 'x\n'): void {
	const path = join(root, relPath)
	mkdirSync(dirname(path), { recursive: true })
	writeFileSync(path, content)
}

function git(root: string, ...args: string[]): void {
	execFileSync('git', args, { cwd: root, stdio: 'ignore' })
}

function gitRepo(): string {
	const root = tempDir()
	git(root, 'init', '-q')
	return root
}

const folders = (root: string, cache?: ProjectFolderCache) =>
	projectReferenceFolders(root, cache).map(({ folder }) => folder)

describe('projectReferenceFolders in a git repository (C10)', () => {
	it('finds each folder strictly below the root holding .agents/references/, never the root itself', () => {
		const root = gitRepo()
		write(root, '.agents/references/name.md')
		write(root, 'packages/app/.agents/references/name.md')
		write(root, 'packages/app/src/.agents/references/other.md')

		expect(projectReferenceFolders(root)).toEqual([
			{ folder: 'packages/app', dir: join(root, 'packages', 'app', '.agents', 'references') },
			{ folder: 'packages/app/src', dir: join(root, 'packages', 'app', 'src', '.agents', 'references') },
		])
	})

	it('leaves out a folder an ignore file ignores, tracked or not (R12)', () => {
		const root = gitRepo()
		write(root, '.gitignore', 'build/\nvendor/\n')
		write(root, 'build/.agents/references/name.md')
		write(root, 'vendor/.agents/references/name.md')
		git(root, 'add', '-f', 'vendor/.agents/references/name.md')
		write(root, 'app/.agents/references/name.md')

		expect(folders(root)).toEqual(['app'])
	})

	it('reads a nested ignore file as git does', () => {
		const root = gitRepo()
		write(root, 'app/.gitignore', 'generated/\n')
		write(root, 'app/generated/.agents/references/name.md')
		write(root, 'app/.agents/references/name.md')

		expect(folders(root)).toEqual(['app'])
	})

	it('puts folders in path order, segment by segment by character code, a folder before the folders inside it', () => {
		const root = gitRepo()
		for (const folder of ['b', 'a-b', 'a/c', 'a', 'B']) write(root, `${folder}/.agents/references/name.md`)

		expect(folders(root)).toEqual(['B', 'a', 'a/c', 'a-b', 'b'])
	})

	it('lists the files once per root and keeps them in the cache for the run', () => {
		const root = gitRepo()
		write(root, 'app/.agents/references/name.md')
		const cache: ProjectFolderCache = new Map()

		expect(folders(root, cache)).toEqual(['app'])
		write(root, 'later/.agents/references/name.md')
		expect(folders(root, cache)).toEqual(['app'])
		expect(cache.size).toBe(1)
		expect(folders(root)).toEqual(['app', 'later'])
	})
})

describe('projectReferenceFolders outside git', () => {
	it('walks the tree from the root and ignores nothing', () => {
		const root = tempDir()
		write(root, '.gitignore', 'build/\n')
		write(root, '.agents/references/name.md')
		write(root, 'build/.agents/references/name.md')
		write(root, 'node_modules/pkg/.agents/references/name.md')
		write(root, 'app/.agents/references/name.md')

		expect(folders(root)).toEqual(['app', 'build', 'node_modules/pkg'])
	})

	it('never follows a symlink', () => {
		const root = tempDir()
		const elsewhere = tempDir()
		write(elsewhere, 'linked/.agents/references/name.md')
		symlinkSync(join(elsewhere, 'linked'), join(root, 'linked'))
		write(root, 'app/.agents/references/name.md')

		expect(folders(root)).toEqual(['app'])
	})

	it('skips an empty .agents/references/ folder and does not walk into one', () => {
		const root = tempDir()
		mkdirSync(join(root, 'empty', '.agents', 'references'), { recursive: true })
		write(root, 'app/.agents/references/deep/.agents/references/name.md')

		expect(folders(root)).toEqual(['app'])
	})
})

describe('comparePaths', () => {
	it('compares segment by segment by character code', () => {
		expect(['a-b', 'a/c', 'a'].sort(comparePaths)).toEqual(['a', 'a/c', 'a-b'])
	})
})
