/**
 * A fault that never stops a name from resolving. The `code` is stable; the `message` is for a
 * person and is not a contract.
 */
export type ReferenceWarning = { code: ReferenceWarningCode; message: string }

export type ReferenceWarningCode =
	| 'frontmatter-invalid'
	| 'merge-unknown'
	| 'marker-unknown'
	| 'marker-unmatched'
	| 'heading-repeated'
	| 'remove-body-ignored'
	| 'extends-invalid'
	| 'extends-self'
	| 'extends-step-missing'
	| 'extends-all-missing'
	| 'extends-not-used'
	| 'default-not-selected'
	| 'default-folder-missing'
	| 'default-in-tier'
	| 'file-ignored'
	| 'format-mismatch'
	| 'selection-invalid'
	| 'interface-not-composed'
	| 'interface-check'

export type WarnFn = (code: ReferenceWarningCode, message: string) => void

/** The code of a name that is not `found`. */
export type ReferenceCode = 'reference-missing' | 'reference-ambiguous' | 'reference-invalid'
