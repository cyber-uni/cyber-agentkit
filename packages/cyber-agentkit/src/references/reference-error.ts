import { type ReferenceCode, referenceCodes } from './reference-codes.js'

export type ReferenceErrorOptions = {
	/** Fields an agent can act on, such as the path refused. Each value a scalar or a list of scalars. */
	details?: Record<string, string | number | boolean | null | readonly (string | number | boolean | null)[]> | undefined
	/** What to do about it, such as the command that fixes it. */
	help?: string | readonly string[] | undefined
}

/**
 * A request a reference function cannot complete, or one called wrongly, thrown by a library
 * function and by a write (R48). The `code` is stable and in `referenceCodes`; `usage` marks a wrong
 * invocation, which a command exits 2 on, rather than a refusal, which it exits 1 on. A name that is
 * not `found` is a status in its record, never this error.
 *
 * The package exports it as `ReferenceError` (C9); inside the source it keeps this name, so no module
 * shadows the global `ReferenceError`.
 */
export class ReferenceFailure extends Error {
	override readonly name = 'ReferenceError'
	readonly code: ReferenceCode
	readonly usage: boolean
	readonly details: NonNullable<ReferenceErrorOptions['details']>
	readonly help: string[]
	constructor(code: ReferenceCode, message: string, { details = {}, help }: ReferenceErrorOptions = {}) {
		super(message)
		this.code = code
		this.usage = referenceCodes[code].kind === 'usage'
		this.details = details
		this.help = help === undefined ? [] : typeof help === 'string' ? [help] : [...help]
	}
}
