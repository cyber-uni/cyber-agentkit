import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const srcDir = join(import.meta.dirname, '..')
// Topics whose harness facts the source may cite; a later topic adds to harness-detection.
const evidencePaths = ['harness-detection', 'worktree-management'].map((topic) =>
	join(import.meta.dirname, '../../../../.research', topic, 'evidence.md'),
)

async function sourceFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true, recursive: true })
	return entries
		.filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
		.map((e) => join(e.parentPath, e.name))
}

describe('research citations', () => {
	it('cites only evidence IDs that exist in a research topic', async () => {
		const evidence = (await Promise.all(evidencePaths.map((path) => readFile(path, 'utf8')))).join('\n')
		const known = new Set([...evidence.matchAll(/^\| (E-[A-Z]+-[A-Z]\d+|E-PROC-[A-Z]+\d+) \|/gm)].map((m) => m[1]))

		const cited = new Set<string>()
		for (const file of await sourceFiles(srcDir)) {
			const text = await readFile(file, 'utf8')
			for (const match of text.matchAll(
				/\bE-(?:(?:CC|CUR|CODEX|COPILOT|OC|KILO|GEM|QWEN|VSC|CLINE|CRUSH|OH|AUG)-[A-Z]\d+|PROC-[A-Z]+\d+)\b/g,
			))
				cited.add(match[0])
		}

		expect(cited.size).toBeGreaterThan(0)
		expect([...cited].filter((id) => !known.has(id))).toEqual([])
	})
})
