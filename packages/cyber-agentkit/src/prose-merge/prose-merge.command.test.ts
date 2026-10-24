import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { run } from '../cli.js'

const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

afterEach(() => {
	stdout.mockClear()
	stderr.mockClear()
	process.exitCode = undefined
})

const argv = (...args: string[]) => ['node', 'cyber-agentkit', 'prose-update', ...args]
const printed = () => stdout.mock.calls.map(([chunk]) => String(chunk)).join('')

describe('prose-update classify', () => {
	it('prints the outcome and the merged text as json', async () => {
		const code = await run(
			argv('classify', '--offered', 'A. B. C.', '--found', 'A. B. Mine.', '--retired', 'A. B.', '--format', 'json'),
		)
		const out = JSON.parse(printed())

		expect(code).toBe(0)
		expect(out).toMatchObject({ outcome: 'update', text: 'A. B. C. Mine.' })
		expect(out.parts[0]).toMatchObject({ outcome: 'update', shared: 2, baseSentences: 2, revision: 'append' })
	})

	it('reads inputs from files and a history text', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'prose-merge-'))
		writeFileSync(join(dir, 'history.md'), '## Superseded 2026-01 — r\n\n```markdown\nA. B.\n```\n')
		writeFileSync(join(dir, 'found.md'), 'A. B.\n')
		const code = await run(
			argv(
				'classify',
				'--offered',
				'A. B. C.',
				'--found-from',
				join(dir, 'found.md'),
				'--history-from',
				join(dir, 'history.md'),
				'--format',
				'json',
			),
		)

		expect(code).toBe(0)
		expect(JSON.parse(printed()).base).toEqual({ index: 0, date: '2026-01' })
	})

	it('refuses an empty offered wording with an error and exit 1', async () => {
		const code = await run(argv('classify', '--offered', ' ', '--found', 'A.', '--retired', 'A.'))

		expect(code).toBe(1)
		expect(stderr).toHaveBeenCalledWith(expect.stringContaining('empty-offered'))
	})

	it('is misuse to pass both or neither of an input', async () => {
		expect(await run(argv('classify', '--found', 'A.', '--retired', 'A.'))).toBe(2)
		expect(stderr).toHaveBeenCalledWith(expect.stringContaining('--offered'))
	})
})

describe('prose-update retire', () => {
	it('prints the history with the wording added', async () => {
		const code = await run(
			argv('retire', '--history', '# H\n', '--wording', 'W', '--date', '2026-02', '--reason', 'why'),
		)

		expect(code).toBe(0)
		expect(printed()).toBe('# H\n\n## Superseded 2026-02 — why\n\n```markdown\nW\n```\n')
	})
})
