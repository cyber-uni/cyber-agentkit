import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { run } from '../cli.js'

const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
const printed = () => stdout.mock.calls.map(([chunk]) => String(chunk)).join('')

afterEach(() => {
	vi.unstubAllEnvs()
	stdout.mockClear()
	stderr.mockClear()
})

function places() {
	const root = realpathSync(mkdtempSync(join(tmpdir(), 'harness-command-root-')))
	mkdirSync(join(root, '.git'))
	const home = realpathSync(mkdtempSync(join(tmpdir(), 'harness-command-home-')))
	vi.stubEnv('HOME', home)
	vi.stubEnv('USERPROFILE', home)
	const repoFile = join(root, '.agents', 'references', 'harnesses.yaml')
	const userFile = join(home, '.agents', 'references', 'harnesses.yaml')
	return { root, home, repoFile, userFile }
}

const harness = async (...args: string[]) => {
	stdout.mockClear()
	const code = await run(['node', 'cyber-agentkit', 'harness', ...args, '--format', 'json'])
	return { code, out: code === 0 ? JSON.parse(printed()) : undefined }
}

describe('harness add, remove, and list', () => {
	it('declares harnesses in the repo by default and in the user tier with --scope user', async () => {
		const { root, repoFile, userFile } = places()
		expect(await harness('add', 'cursor', '--root', root)).toEqual({
			code: 0,
			out: { scope: 'repo', file: repoFile, declared: ['cursor'] },
		})
		expect(await harness('add', 'vscode-copilot', '--scope', 'user', '--root', root)).toEqual({
			code: 0,
			out: { scope: 'user', file: '~/.agents/references/harnesses.yaml', declared: ['vscode-copilot'] },
		})
		expect(readFileSync(repoFile, 'utf8')).toBe('declared:\n  - cursor\n')
		expect(readFileSync(userFile, 'utf8')).toBe('declared:\n  - vscode-copilot\n')
	})

	it('lists the repo and user declarations combined, each with the files that declare it', async () => {
		const { root, repoFile } = places()
		await harness('add', 'cursor', 'vscode-copilot', '--root', root)
		await harness('add', 'vscode-copilot', '--scope', 'user', '--root', root)
		const { out } = await harness('list', '--root', root)
		expect(out.declared).toEqual([
			{ harness: 'cursor', evidence: [repoFile] },
			{ harness: 'vscode-copilot', evidence: [repoFile, '~/.agents/references/harnesses.yaml'] },
		])
	})

	it('removes from one tier only, so the other tier still declares it', async () => {
		const { root } = places()
		await harness('add', 'cursor', '--root', root)
		await harness('add', 'cursor', '--scope', 'user', '--root', root)
		expect((await harness('remove', 'cursor', '--root', root)).out.declared).toEqual([])
		expect((await harness('list', '--root', root)).out.declared).toEqual([
			{ harness: 'cursor', evidence: ['~/.agents/references/harnesses.yaml'] },
		])
	})

	it('refuses an unknown ID as a usage error naming the valid IDs, and writes nothing', async () => {
		const { root, repoFile } = places()
		const { code } = await harness('add', 'cursor', 'vscode', '--root', root)
		expect(code).toBe(2)
		const { error, code: errorCode } = JSON.parse(printed())
		expect(errorCode).toBe('invalid-usage')
		expect(error).toContain('"vscode" is not a harness ID')
		expect(error).toContain('vscode-copilot')
		expect(error).toContain('claude-code')
		expect(() => readFileSync(repoFile)).toThrow()
	})

	it("keeps a YAML file's other keys and comments", async () => {
		const { root, repoFile } = places()
		mkdirSync(join(root, '.agents', 'references'), { recursive: true })
		writeFileSync(repoFile, '# Harnesses this project is used with\nnote: kept\ndeclared: [cursor]\n')
		await harness('add', 'codex', '--root', root)
		const text = readFileSync(repoFile, 'utf8')
		expect(text).toContain('# Harnesses this project is used with')
		expect(text).toContain('note: kept')
		expect(
			(await harness('list', '--root', root)).out.declared.map(({ harness }: { harness: string }) => harness),
		).toEqual(['cursor', 'codex'])
	})

	it('refuses --scope other than repo or user', async () => {
		const { root } = places()
		expect((await harness('add', 'cursor', '--scope', 'project', '--root', root)).code).toBe(2)
	})
})
