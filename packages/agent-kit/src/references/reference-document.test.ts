import { describe, expect, it, vi } from 'vitest'
import {
	applyContribution,
	composedSections,
	emptyComposed,
	hasBody,
	headingPaths,
	type MergeOperation,
	parseDocument,
	parseSections,
	readMergeOperation,
	renderComposed,
	stripMergeMarkers,
} from './reference-document.js'

function compose(...documents: [string, Exclude<MergeOperation, 'remove'>][]) {
	const warn = vi.fn()
	let composed = emptyComposed()
	for (const [index, [body, operation]] of documents.entries()) {
		composed = applyContribution(composed, body, operation, `doc${index}`, warn)
	}
	return { output: renderComposed(composed), composed, warn }
}

describe('parseDocument', () => {
	it('reads frontmatter that parses to nothing as no metadata', () => {
		const warn = vi.fn()

		expect(parseDocument('---\n\n---\nbody\n', warn)).toEqual({ metadata: {}, body: 'body\n' })
		expect(warn).not.toHaveBeenCalled()
	})

	it.each([
		['a list', '---\n- a\n- b\n---\nbody\n'],
		['invalid YAML', '---\nfoo: [unclosed\n---\nbody\n'],
	])('drops frontmatter that is %s, with a warning', (_, raw) => {
		const warn = vi.fn()

		expect(parseDocument(raw, warn)).toEqual({ metadata: {}, body: 'body\n' })
		expect(warn).toHaveBeenCalledWith('frontmatter-invalid', 'frontmatter is not a YAML mapping; it is ignored')
	})

	it('reads a document with no frontmatter as all body', () => {
		expect(parseDocument('## A\n', vi.fn())).toEqual({ metadata: {}, body: '## A\n' })
	})
})

describe('readMergeOperation', () => {
	it('reads none when merge is not written, and an unknown value as patch with a warning', () => {
		const warn = vi.fn()

		expect(readMergeOperation({}, warn)).toBeUndefined()
		expect(readMergeOperation({ merge: 'combine' }, warn)).toBe('combine')
		expect(readMergeOperation({ merge: 'merge-sections' }, warn)).toBe('patch')
		expect(warn).toHaveBeenCalledWith('merge-unknown', 'unknown merge "merge-sections"; read as patch')
	})
})

describe('hasBody and stripMergeMarkers', () => {
	it('reads a body of blank lines and markers as no body', () => {
		expect(hasBody('\n<!-- merge: remove -->\n\n')).toBe(false)
		expect(hasBody('text\n')).toBe(true)
	})

	it('keeps a marker inside a code fence', () => {
		expect(stripMergeMarkers('```\n<!-- merge: patch -->\n```\n<!-- merge: patch -->\n')).toBe(
			'```\n<!-- merge: patch -->\n```\n',
		)
	})
})

describe('parseSections', () => {
	it('reads depth from the document’s own top heading level', () => {
		const tree = parseSections('## A\n\n### B\n', vi.fn())

		expect(tree.top).toBe(2)
		expect(tree.children[0]).toMatchObject({ title: 'A', depth: 0 })
		expect(tree.children[0]?.children[0]).toMatchObject({ title: 'B', depth: 1 })
	})

	it('treats a heading with no title text as an empty title', () => {
		expect(parseSections('##\n\nbody\n', vi.fn()).children[0]?.title).toBe('')
	})

	it('reads a patch marker, and an unknown one as patch with a warning', () => {
		const warn = vi.fn()

		const tree = parseSections('## A\n<!-- merge: patch -->\n\n## B\n<!-- merge: bogus -->\n', warn)

		expect(tree.children.map(({ marker }) => marker)).toEqual(['patch', 'patch'])
		expect(warn).toHaveBeenCalledWith('marker-unknown', 'unknown merge "bogus" on "B"; read as patch')
	})

	it('tracks a tilde fence the same as a backtick fence', () => {
		const tree = parseSections('~~~\n## not a heading\n~~~\n\n## Real\n\nbody\n', vi.fn())

		expect(tree.children.map(({ title }) => title)).toEqual(['Real'])
	})
})

describe('applyContribution', () => {
	it('renders a section with no text as its heading alone', () => {
		expect(compose(['## Empty\n', 'patch']).output).toBe('## Empty\n')
	})

	it('renders a section at the level of the document below, keeping skipped levels', () => {
		const { output } = compose(['## A\n\na\n', 'patch'], ['# A\n\n### Deep\n\ndeep\n', 'patch'])

		expect(output).toBe('## A\n\na\n\n#### Deep\n\ndeep\n')
	})

	it('replaces a matched subsection whole under patch, and keeps the ones it does not name', () => {
		const below = '## A\n\n### B\n\nold b\n\n#### C\n\nold c\n\n### D\n\nd\n'

		expect(compose([below, 'patch'], ['## A\n\n### B\n\nnew b\n', 'patch']).output).toBe(
			'## A\n\n### B\n\nnew b\n\n### D\n\nd\n',
		)
	})

	it('combines subsections recursively, lower text first', () => {
		const { output, composed } = compose(['## A\n\na\n\n### B\n\nb\n', 'patch'], ['## A\n\n### B\n\nmore\n', 'combine'])

		expect(output).toBe('> Where combined text conflicts, the later text wins.\n\n## A\n\na\n\n### B\n\nb\n\nmore\n')
		expect(composed.joined).toBe(true)
	})

	it('does not say text was joined when one side is empty', () => {
		expect(compose(['## A\n', 'patch'], ['## A\n\nmore\n', 'combine']).output).toBe('## A\n\nmore\n')
	})

	it('replaces the preamble under patch, and joins it under combine', () => {
		expect(compose(['intro\n\n## A\n', 'patch'], ['mine\n', 'patch']).output).toBe('mine\n\n## A\n')
		expect(compose(['intro\n', 'patch'], ['mine\n', 'combine']).output).toBe(
			'> Where combined text conflicts, the later text wins.\n\nintro\n\nmine\n',
		)
	})

	it('drops a section marked remove and records which contribution dropped it', () => {
		const { output, composed } = compose(
			['## A\n\na\n\n## B\n\nb\n', 'patch'],
			['## B\n<!-- merge: remove -->\n', 'patch'],
		)

		expect(output).toBe('## A\n\na\n')
		expect(composed.removed).toEqual([{ path: 'B', by: 'doc1' }])
	})

	it('warns on an explicit marker that matches nothing, and adds its text at the end, or nothing for remove', () => {
		const { output, warn } = compose(
			['## A\n\na\n', 'patch'],
			[
				'## New\n<!-- merge: combine -->\n\nnew\n\n### Gone\n<!-- merge: remove -->\n\n## Other\n<!-- merge: remove -->\n',
				'patch',
			],
		)

		expect(output).toBe('## A\n\na\n\n## New\n\nnew\n')
		expect(warn.mock.calls.map(([code, message]) => `${code}: ${message}`)).toEqual([
			'marker-unmatched: "<!-- merge: combine -->" on "New" matches no section below',
			'marker-unmatched: "<!-- merge: remove -->" on "New > Gone" matches no section below',
			'marker-unmatched: "<!-- merge: remove -->" on "Other" matches no section below',
		])
	})

	it('warns on a repeated heading, matches the first, and adds the second at the end', () => {
		const { output, warn } = compose(['## A\n\na\n', 'patch'], ['## A\n\none\n\n## A\n\ntwo\n', 'patch'])

		expect(output).toBe('## A\n\none\n\n## A\n\ntwo\n')
		expect(warn).toHaveBeenCalledWith(
			'heading-repeated',
			'heading path "A" appears more than once; the first is matched',
		)
	})

	it('replaces everything below with replace', () => {
		expect(compose(['## A\n\na\n', 'patch'], ['## B\n\nb\n', 'replace']).output).toBe('## B\n\nb\n')
	})

	it('gives each section the contributions that supplied its text', () => {
		const { composed } = compose(['intro\n\n## A\n\na\n', 'patch'], ['## A\n\nmore\n', 'combine'])

		expect(composedSections(composed)).toEqual([
			{ path: '(before the first heading)', sources: [{ contribution: 'doc0', operation: 'patch' }] },
			{
				path: 'A',
				sources: [
					{ contribution: 'doc0', operation: 'patch' },
					{ contribution: 'doc1', operation: 'combine' },
				],
			},
		])
	})

	it('renders nothing for an empty composition', () => {
		expect(renderComposed(emptyComposed())).toBe('')
	})
})

describe('headingPaths', () => {
	it('lists every heading path, top first', () => {
		expect(headingPaths('# A\n\n## B\n\n# C\n')).toEqual(['A', 'A > B', 'C'])
	})
})
