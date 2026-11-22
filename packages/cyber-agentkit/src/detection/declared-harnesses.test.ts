import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { harnessIds } from '../harness/harness-id.js'
import { declaredHarnesses } from './declared-harnesses.js'

function places() {
	const root = mkdtempSync(join(tmpdir(), 'declared-harnesses-root-'))
	mkdirSync(join(root, '.git'))
	const home = mkdtempSync(join(tmpdir(), 'declared-harnesses-home-'))
	const write = (where: string, file: string, text: string) => {
		const dir = join(where, '.agents', 'references')
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, file), text)
		return join(dir, file)
	}
	return { root, home, write }
}

describe('declaredHarnesses', () => {
	it('declares nothing when neither tier holds a declaration', () => {
		const { root, home } = places()
		expect(declaredHarnesses({ root, home })).toEqual({ harnesses: [], rejected: [] })
	})

	it('combines the repo and the user declarations, each harness once with every file that declares it', () => {
		const { root, home, write } = places()
		const repo = write(root, 'harnesses.yaml', 'declared:\n  - cursor\n  - vscode-copilot\n')
		const user = write(home, 'harnesses.yaml', 'declared: [vscode-copilot, codex]\n')
		expect(declaredHarnesses({ root, home }).harnesses).toEqual([
			{ harness: 'cursor', evidence: [repo] },
			{ harness: 'codex', evidence: [user] },
			{ harness: 'vscode-copilot', evidence: [repo, user] },
		])
	})

	it('reads a JSON declaration too', () => {
		const { root, home, write } = places()
		const file = write(home, 'harnesses.json', '{ "declared": ["cursor"] }\n')
		expect(declaredHarnesses({ root, home }).harnesses).toEqual([{ harness: 'cursor', evidence: [file] }])
	})

	it('finds the repo from the working folder when no root is given', () => {
		const { root, home, write } = places()
		const file = write(root, 'harnesses.yaml', 'declared: [cursor]\n')
		mkdirSync(join(root, 'deep'))
		expect(declaredHarnesses({ cwd: join(root, 'deep'), home }).harnesses).toEqual([
			{ harness: 'cursor', evidence: [file] },
		])
	})

	it('rejects an entry that is not a harness ID, naming every valid ID', () => {
		const { root, home, write } = places()
		const file = write(root, 'harnesses.yaml', 'declared: [cursor, copilot]\n')
		const { harnesses, rejected } = declaredHarnesses({ root, home })
		expect(harnesses).toEqual([{ harness: 'cursor', evidence: [file] }])
		expect(rejected).toEqual([{ file, harness: 'copilot', message: expect.stringContaining('is not a harness ID') }])
		for (const id of harnessIds) expect(rejected[0]?.message).toContain(id)
	})

	it('rejects a file that is not a mapping with a declared list', () => {
		const { root, home, write } = places()
		const file = write(home, 'harnesses.yaml', '- cursor\n')
		expect(declaredHarnesses({ root, home })).toEqual({
			harnesses: [],
			rejected: [{ file, message: expect.stringContaining('`declared` list') }],
		})
	})

	it('rejects a Markdown file under the name', () => {
		const { root, home, write } = places()
		const file = write(root, 'harnesses.md', '# Harnesses\n')
		expect(declaredHarnesses({ root, home }).rejected).toEqual([
			{ file, message: expect.stringContaining('not YAML or JSON') },
		])
	})
})
