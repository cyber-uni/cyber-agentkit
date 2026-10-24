import { describe, expect, it } from 'vitest'
import { classify, ProseUpdateError } from './classify.js'

const V1 = 'Alpha is first. Beta is second.'
const V2 = 'Alpha is first. Beta is second. Gamma is third.'
const REWRITE = 'Alpha is first. Beta is better. Delta is new.'

const outcomes = (result: ReturnType<typeof classify>) => result.parts.map((part) => part.outcome)

describe('classify, one section', () => {
	it('is up-to-date when the found text holds the offered wording, owner additions included', () => {
		const found = 'Alpha is first. Mine. Beta is second. Gamma is third.'
		const result = classify({ found, offered: V2, history: [V1] })
		expect(result.outcome).toBe('up-to-date')
		expect(result.text).toBe(found)
	})

	it('is not up to date while a sentence found only in a retired wording remains', () => {
		const result = classify({
			found: 'Alpha is first. Old line.',
			offered: 'Alpha is first. New line.',
			history: ['Alpha is first. Old line.'],
		})
		expect(result.outcome).toBe('update')
		expect(result.text).toBe('Alpha is first. New line.')
	})

	it('updates an untouched older wording to the offered one, reporting the base facts', () => {
		const result = classify({ found: V1, offered: V2, history: [V1] })
		expect(result).toMatchObject({ outcome: 'update', text: V2, base: { index: 0 } })
		expect(result.parts[0]).toMatchObject({ shared: 2, baseSentences: 2, revision: 'append' })
	})

	it('keeps the owner sentences through an append revision', () => {
		const result = classify({ found: `${V1} Mine.`, offered: V2, history: [V1] })
		expect(result.text).toBe('Alpha is first. Beta is second. Gamma is third. Mine.')
	})

	it('keeps owner sentences through a rewrite that touches other sentences', () => {
		const three = 'Alpha is first. Beta is second. Gamma is third.'
		const result = classify({
			found: `${three} Mine.`,
			offered: 'Alpha is first. Beta is better. Gamma is third.',
			history: [three],
		})
		expect(result.outcome).toBe('update')
		expect(result.parts[0]?.revision).toBe('rewrite')
		expect(result.text).toBe('Alpha is first. Beta is better. Gamma is third. Mine.')
	})

	it('reports a conflict with the colliding sentences, returning the found sentences there', () => {
		const result = classify({ found: 'Alpha is first. Beta is mine.', offered: REWRITE, history: [V1] })
		expect(result.outcome).toBe('conflict')
		expect(result.parts[0]?.collisions).toHaveLength(1)
		expect(result.text).toContain('Beta is mine.')
	})

	it('is owners when the found text shares nothing with the base or the offered wording', () => {
		const result = classify({ found: 'Entirely mine.', offered: V2, history: [V1, 'Other wording.'] })
		expect(result.outcome).toBe('owners')
		expect(result.text).toBe('Entirely mine.')
	})

	it('is owners for a found part that shares nothing, when a base exists elsewhere', () => {
		const found = `${V1}\n\n# Mine\nOwner part.`
		const result = classify({ found, offered: V2, history: [V1] })
		expect(result.parts.find((p) => p.key === 'Mine')).toMatchObject({ outcome: 'owners' })
	})

	it('is undetermined with no-history, empty-section and tied-base', () => {
		expect(classify({ found: V1, offered: V2, history: [] })).toMatchObject({
			outcome: 'undetermined',
			reason: 'no-history',
			text: V1,
		})
		expect(classify({ found: '  ', offered: V2, history: [V1] })).toMatchObject({
			outcome: 'undetermined',
			reason: 'empty-section',
		})
		const tied = classify({
			found: 'Alpha is first. Beta is second.',
			offered: V2,
			history: ['Alpha is first. X.', 'Beta is second. Y.'],
		})
		expect(tied).toMatchObject({ outcome: 'undetermined', reason: 'tied-base' })
		expect(tied.parts[0]?.tied).toEqual([0, 1])
	})

	it('is undetermined with no-base when no wording matches but the found text shares with the offered one', () => {
		const result = classify({ found: 'Alpha is first. Mine.', offered: V2, history: ['Unrelated.'] })
		expect(result).toMatchObject({ outcome: 'undetermined', reason: 'no-base' })
	})

	it('refuses an empty offered wording', () => {
		expect(() => classify({ found: V1, offered: ' \n', history: [V1] })).toThrow(ProseUpdateError)
	})

	it('picks the base with the most shared sentences, and takes dates from a history text', () => {
		const history =
			'## Superseded 2026-02 — b\n\n```markdown\nAlpha is first. Beta is second.\n```\n\n## Superseded 2026-01 — a\n\n```markdown\nAlpha is first.\n```\n'
		const result = classify({ found: V1, offered: V2, history })
		expect(result.base).toEqual({ index: 0, date: '2026-02' })
	})

	it('gives the same result on every call', () => {
		const input = { found: `${V1} Mine.`, offered: REWRITE, history: [V1] }
		expect(classify(input)).toEqual(classify(input))
	})
})

describe('classify, several sections', () => {
	const base = '# One\nAlpha is first.\n\n# Two\nBeta is second.\n'

	it('merges part by part and ranks the document outcome', () => {
		const found = '# One\nAlpha is first.\n\n# Two\nBeta is second. Mine.\n'
		const offered = '# One\nAlpha is first. Added one.\n\n# Two\nBeta is second.\n'
		const result = classify({ found, offered, history: [base] })
		expect(outcomes(result)).toEqual(['update', 'up-to-date'])
		expect(result.outcome).toBe('update')
		expect(result.text).toBe('# One\nAlpha is first. Added one.\n\n# Two\nBeta is second. Mine.\n')
	})

	it('adds a part only the offered wording holds after the nearest preceding part', () => {
		const offered = '# One\nAlpha is first.\n\n# New\nFresh.\n\n# Two\nBeta is second.\n'
		const result = classify({ found: base, offered, history: [base] })
		expect(result.text).toBe('# One\nAlpha is first.\n\n# New\nFresh.\n\n# Two\nBeta is second.\n')
		expect(result.parts.find((p) => p.key === 'New')?.outcome).toBe('update')
	})

	it('removes a part the offered wording dropped when the found part equals the base part', () => {
		const result = classify({ found: base, offered: '# One\nAlpha is first.\n', history: [base] })
		expect(result.text).toBe('# One\nAlpha is first.\n')
	})

	it('conflicts on a dropped part the owner edited', () => {
		const found = '# One\nAlpha is first.\n\n# Two\nBeta is second. Mine.\n'
		const result = classify({ found, offered: '# One\nAlpha is first.\n', history: [base] })
		expect(result.parts.find((p) => p.key === 'Two')?.outcome).toBe('conflict')
		expect(result.text).toBe(found)
	})

	it('keeps a part the owner deleted absent', () => {
		const result = classify({ found: '# One\nAlpha is first.\n', offered: base, history: [base] })
		expect(result.parts.find((p) => p.key === 'Two')?.outcome).toBe('up-to-date')
		expect(result.outcome).toBe('up-to-date')
	})

	it('treats a renamed heading as a removed part and an added part', () => {
		const result = classify({
			found: base,
			offered: '# One\nAlpha is first.\n\n# Deux\nBeta is second.\n',
			history: [base],
		})
		expect(result.parts.map((p) => [p.key, p.outcome])).toEqual([
			['One', 'up-to-date'],
			['Deux', 'update'],
			['Two', 'update'],
		])
	})
})
