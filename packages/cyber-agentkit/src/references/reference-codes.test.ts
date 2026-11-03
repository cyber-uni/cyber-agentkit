import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isCliError } from 'clibuilder/axi'
import { describe, expect, it } from 'vitest'
import { type ReferenceCode, referenceCodeExit, referenceCodes } from './reference-codes.js'
import { asCliError } from './reference-command-support.js'
import { ReferenceFailure } from './reference-error.js'

const sources = readdirSync(import.meta.dirname)
	.filter((file) => file.endsWith('.ts') && !file.includes('.test.') && !file.includes('.fixtures.'))
	.map((file) => ({ file, text: readFileSync(join(import.meta.dirname, file), 'utf8') }))

/**
 * A code literal where the source emits one: a `code:` field or comparison, the first argument of a
 * `ReferenceFailure`, or of a warn function (`warn(`, `warnAt(...)(`, `apply.warn(`).
 */
const emitted =
	/(?:\bcode\s*(?::|===|!==)\s*|\bReferenceFailure\(\s*|\bwarn\w*(?:\([^()]*\))?\(\s*)'([a-z0-9]+(?:-[a-z0-9]+)*)'/g

describe('the code table (R104, R39)', () => {
	it('holds every code the reference source emits', () => {
		const found = sources.flatMap(({ file, text }) =>
			[...text.matchAll(emitted)].map((match) => ({ file, code: match[1] })),
		)
		// the scan reaches a code on its own line, in each emitter's form
		expect(found.map(({ code }) => code)).toEqual(
			expect.arrayContaining(['folder-invalid', 'interface-unknown', 'merge-unknown', 'reference-removed', 'no-file']),
		)
		expect(found.filter(({ code }) => !Object.hasOwn(referenceCodes, code ?? ''))).toEqual([])
	})

	it('names each code in kebab-case, once, with a kind and a description', () => {
		for (const [code, { kind, when }] of Object.entries(referenceCodes)) {
			expect(code).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
			expect(['status', 'warning', 'refused', 'notice', 'usage']).toContain(kind)
			expect(when).not.toBe('')
		}
	})

	it('holds the codes for features not built yet, so later work adds none of its own', () => {
		expect(Object.keys(referenceCodes)).toEqual(
			expect.arrayContaining([
				'reference-removed',
				'reference-stale',
				'reference-hidden',
				'name-invalid',
				'in-folder-missing',
				'in-folder-ignored',
				'change-missing',
				'extends-replace',
			]),
		)
	})

	it('gives each kind its exit value: status and notice 0, refused 1, usage 2, a warning none (R43)', () => {
		expect(referenceCodeExit('reference-missing')).toBe(0)
		expect(referenceCodeExit('no-file')).toBe(0)
		expect(referenceCodeExit('root-missing')).toBe(1)
		expect(referenceCodeExit('name-missing')).toBe(2)
		expect(referenceCodeExit('name-invalid')).toBe(2)
		expect(referenceCodeExit('in-folder-missing')).toBe(1)
		expect(referenceCodeExit('frontmatter-invalid')).toBeUndefined()
	})

	it.each(
		(Object.keys(referenceCodes) as ReferenceCode[]).filter((code) => {
			const exit = referenceCodeExit(code)
			return exit === 1 || exit === 2
		}),
	)('exits a command that ends on %s with the table value, its code kept', (code) => {
		let thrown: unknown
		try {
			asCliError(new ReferenceFailure(code, 'refused', { details: { path: 'x' }, help: 'do this' }), 'fallback')
		} catch (error) {
			thrown = error
		}
		expect(isCliError(thrown)).toBe(true)
		expect(thrown).toMatchObject({
			code,
			exitCode: referenceCodeExit(code),
			message: 'refused',
			details: { path: 'x' },
			help: ['do this'],
		})
	})
})
