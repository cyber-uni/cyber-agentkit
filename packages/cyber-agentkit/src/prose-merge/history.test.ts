import { describe, expect, it } from 'vitest'
import { parseHistory, retire } from './history.js'

const sample = `# Superseded wordings: Delegation

Nothing here is ever offered.

## Superseded 2026-09-27 — replaced by the sizing wording

\`\`\`markdown
## Delegation

Newer.
\`\`\`

## Superseded 2026-09 — replaced by two paragraphs

\`\`\`markdown
## Delegation

Older.
\`\`\`
`

describe('parseHistory', () => {
	it('returns each retired wording with date and reason, newest first', () => {
		expect(parseHistory(sample)).toEqual({
			entries: [
				{ wording: '## Delegation\n\nNewer.', date: '2026-09-27', reason: 'replaced by the sizing wording' },
				{ wording: '## Delegation\n\nOlder.', date: '2026-09', reason: 'replaced by two paragraphs' },
			],
			invalid: [],
		})
	})

	it('returns nothing from a history that holds none yet', () => {
		expect(parseHistory('# Superseded\n\nNone yet.\n')).toEqual({ entries: [], invalid: [] })
	})

	it('reports an entry without a fence with its position and returns the rest', () => {
		const text = '## Superseded 2026-02 — bad\n\nno fence here\n\n## Superseded 2026-01 — ok\n\n```markdown\nx\n```\n'
		const parsed = parseHistory(text)
		expect(parsed.entries).toEqual([{ wording: 'x', date: '2026-01', reason: 'ok' }])
		expect(parsed.invalid).toEqual([{ position: 0, line: 1, heading: '## Superseded 2026-02 — bad' }])
	})

	it('reports an entry whose fence never closes', () => {
		const parsed = parseHistory('## Superseded 2026-02 — bad\n\n```markdown\nx\n')
		expect(parsed.entries).toEqual([])
		expect(parsed.invalid).toHaveLength(1)
	})

	it('does not read a Superseded heading inside a fence', () => {
		const text = '## Superseded 1 — a\n\n````markdown\n## Superseded 2 — inner\n```\n````\n'
		expect(parseHistory(text).entries).toEqual([{ wording: '## Superseded 2 — inner\n```', date: '1', reason: 'a' }])
	})
})

describe('retire', () => {
	it('adds the wording at the top of the entries and leaves every other byte alone', () => {
		const out = retire(sample, '## Delegation\n\nNewest.', '2026-10-01', 'replaced again')
		const head = sample.slice(0, sample.indexOf('## Superseded 2026-09-27'))
		const rest = sample.slice(head.length)
		expect(out).toBe(
			`${head}## Superseded 2026-10-01 — replaced again\n\n\`\`\`markdown\n## Delegation\n\nNewest.\n\`\`\`\n\n${rest}`,
		)
	})

	it('adds the first entry at the end of a history that holds none', () => {
		const out = retire('# Superseded\n\nNone yet.\n', 'w', '2026-10', 'r')
		expect(out).toBe('# Superseded\n\nNone yet.\n\n## Superseded 2026-10 — r\n\n```markdown\nw\n```\n')
	})

	it('changes nothing when the wording equals the newest retired one', () => {
		expect(retire(sample, '## Delegation\n\nNewer.', 'd', 'r')).toBe(sample)
	})

	it('round-trips exactly, including a wording with a fence and a trailing newline', () => {
		for (const wording of [
			'plain',
			'with ```fence``` inline\n```js\ncode\n```\n',
			'ends with newline\n',
			'  indented',
		]) {
			expect(parseHistory(retire(sample, wording, '2027', 'why — dash')).entries[0]).toEqual({
				wording,
				date: '2027',
				reason: 'why — dash',
			})
		}
	})
})
