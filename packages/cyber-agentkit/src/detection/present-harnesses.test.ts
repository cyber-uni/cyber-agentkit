import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installedHarnesses, presentHarnesses } from './present-harnesses.js'

function bin(...names: string[]): string {
	const dir = mkdtempSync(join(tmpdir(), 'present-harnesses-'))
	for (const name of names) {
		writeFileSync(join(dir, name), '#!/bin/sh\n')
		chmodSync(join(dir, name), 0o755)
	}
	return dir
}

const claudeEnv = { CLAUDECODE: '1', CLAUDE_CODE_CHILD_SESSION: '1' }

describe('installedHarnesses', () => {
	it('reports a harness whose verified headless executable is on PATH', () => {
		const dir = bin('codex', 'copilot')
		const found = installedHarnesses({ env: { PATH: dir }, platform: 'linux' })
		expect(found.map(({ harness }) => harness)).toEqual(['codex', 'copilot-cli'])
		expect(found[0]).toMatchObject({ executable: 'codex', path: join(dir, 'codex') })
		expect(found[0]?.research).toContain('E-CODEX-H1')
	})

	it.each([
		['claude', 'claude-code'],
		['codex', 'codex'],
		['copilot', 'copilot-cli'],
		['cursor-agent', 'cursor'],
		['gemini', 'gemini-cli'],
		['qwen', 'qwen-code'],
	])('reports %s on PATH as %s', (executable, harness) => {
		const dir = bin(executable)
		expect(installedHarnesses({ env: { PATH: dir }, platform: 'linux' })).toEqual([
			expect.objectContaining({ harness, executable, evidence: [join(dir, executable)] }),
		])
	})

	it('skips a file that is not executable, and a folder of the same name', () => {
		const dir = bin()
		writeFileSync(join(dir, 'codex'), '')
		mkdirSync(join(dir, 'claude'))
		expect(installedHarnesses({ env: { PATH: dir }, platform: 'linux' })).toEqual([])
	})

	it('finds a Windows executable through PATHEXT', () => {
		const dir = bin('codex.CMD')
		const found = installedHarnesses({ env: { Path: dir, PATHEXT: '.EXE;.CMD' }, platform: 'win32' })
		expect(found.map(({ harness }) => harness)).toEqual(['codex'])
	})

	it('reports no IDE-only harness from a rejected signal: the `cursor` or `code` command (E-CUR-N1, E-VSC-N2)', () => {
		const dir = bin('cursor', 'code', 'agent')
		expect(installedHarnesses({ env: { PATH: dir }, platform: 'linux' })).toEqual([])
	})

	it('reports the Cursor CLI by `cursor-agent`, the name its installer still links (E-CUR-N3)', () => {
		const dir = bin('cursor-agent')
		expect(installedHarnesses({ env: { PATH: dir }, platform: 'linux' })).toEqual([
			{
				harness: 'cursor',
				executable: 'cursor-agent',
				path: join(dir, 'cursor-agent'),
				evidence: [join(dir, 'cursor-agent')],
				research: expect.arrayContaining(['E-CUR-H1']),
			},
		])
	})

	it('reports nothing with no PATH', () => {
		expect(installedHarnesses({ env: {}, platform: 'linux' })).toEqual([])
	})
})

describe('presentHarnesses', () => {
	it('returns only the running harness by default', () => {
		const result = presentHarnesses({ env: { ...claudeEnv, PATH: bin('codex') }, platform: 'linux' })
		expect(result).toEqual({
			running: 'claude-code',
			harnesses: [{ harness: 'claude-code', source: 'running', evidence: ['CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION'] }],
		})
	})

	it('returns none when the running harness is unknown', () => {
		expect(presentHarnesses({ env: { PATH: bin('codex') }, platform: 'linux' })).toEqual({
			running: 'unknown',
			harnesses: [],
		})
	})

	it('adds the installed harnesses after the running one with all, each once', () => {
		const dir = bin('claude', 'codex')
		const result = presentHarnesses({ env: { ...claudeEnv, PATH: dir }, platform: 'linux', all: true })
		expect(result.harnesses).toEqual([
			{ harness: 'claude-code', source: 'running', evidence: ['CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION'] },
			{ harness: 'codex', source: 'installed', evidence: [join(dir, 'codex')] },
		])
	})

	it('adds nested harnesses from the environment with all, while the running one stays unknown', () => {
		const result = presentHarnesses({ env: { ...claudeEnv, CODEX_THREAD_ID: 't' }, platform: 'linux', all: true })
		expect(result.running).toBe('unknown')
		expect(result.harnesses.map(({ harness, source }) => [harness, source])).toEqual([
			['claude-code', 'environment'],
			['codex', 'environment'],
		])
	})
})
