/**
 * Every code a reference command or library function emits, and this table is its one home: one code,
 * one kind, one description (R104). Adding a code is not breaking; removing or renaming one is.
 *
 * A kind fixes the exit value of a command that ends on the code (R43): a name `status` and a
 * `notice` are answers (exit 0), a `refused` request is a state of the files (exit 1), a `usage`
 * error is a wrong invocation (exit 2), and a `warning` never changes the exit value.
 *
 * A failed `check` is an entry in its result, not a code here: its `check` is the check's name.
 */
export const referenceCodes = {
	'reference-missing': {
		kind: 'status',
		when: 'no tier holds the name, or the plugin a qualified name asks for is not installed (UC1.1)',
	},
	'reference-removed': { kind: 'status', when: 'a `missing` name a `remove` turned off (UC1.1, R49)' },
	'reference-ambiguous': {
		kind: 'status',
		when: 'contributions that cannot be put in one order, or a name two names list as an alias (UC1.2, R98)',
	},
	'reference-invalid': { kind: 'status', when: 'not a name (UC1.3, R1)' },
	'frontmatter-invalid': { kind: 'warning', when: 'malformed frontmatter (R105)' },
	'merge-unknown': { kind: 'warning', when: 'an unknown `merge` value (R7)' },
	'marker-unknown': { kind: 'warning', when: 'an unknown merge marker (R7)' },
	'marker-unmatched': { kind: 'warning', when: 'an explicit marker that matches nothing below (R7)' },
	'heading-repeated': { kind: 'warning', when: 'a document repeating a heading (R7)' },
	'remove-body-ignored': { kind: 'warning', when: 'a `remove` with a body (R49)' },
	'extends-invalid': { kind: 'warning', when: 'a malformed `extends` (R106)' },
	'extends-self': { kind: 'warning', when: 'a plugin listing itself (R54)' },
	'extends-step-missing': { kind: 'warning', when: 'a step that cannot be used (R55)' },
	'extends-all-missing': { kind: 'warning', when: 'every step cannot be used (R55)' },
	'extends-not-used': {
		kind: 'warning',
		when: 'a lower `extends` that builds a different stack (R53); picks written under a managed `extends` that builds it (R109)',
	},
	'section-not-held': { kind: 'warning', when: 'a `sections` entry the plugin does not hold (R52)' },
	'default-not-selected': {
		kind: 'warning',
		when: 'a plugin answering over the default with no `extends` naming either, and no own `extends` of the plugin naming `default` (R56)',
	},
	'plugin-not-selected': {
		kind: 'warning',
		when: 'a plugin holding the name that the `repo` or `user` `extends` building the stack neither places nor declines (R113)',
	},
	'default-folder-missing': { kind: 'warning', when: 'a `--default` folder that does not exist (R41)' },
	'default-in-tier': { kind: 'warning', when: 'a `<name>.default.md` in a tier folder (R51)' },
	'file-ignored': {
		kind: 'warning',
		when: "a second file for a name in one folder, one under an older name beside the new name's included (R67, R97)",
	},
	'format-mismatch': { kind: 'warning', when: 'a Markdown contribution above a non-Markdown one (R68)' },
	'metadata-ignored': {
		kind: 'warning',
		when: 'a misplaced metadata file, or a body, `merge`, or `implements` in one (R94)',
	},
	'project-section-key-ignored': {
		kind: 'warning',
		when: '`merge`, `extends`, `implements`, or `aliases` in a project section, or dropped from one `create --in --template` writes (R27, R110)',
	},
	'interface-not-composed': {
		kind: 'warning',
		when: '`extends`, `merge`, or a higher copy on an interface document (R14)',
	},
	'interface-check': { kind: 'warning', when: 'a loaded document failing its interface check (R37)' },
	'base-moved': {
		kind: 'warning',
		when: '`check` on a plugin or default file whose extended base has a newer version (R86)',
	},
	'reference-stale': {
		kind: 'warning',
		when: 'a generated document or project section with a changed or missing source (R101)',
	},
	'reference-renamed': {
		kind: 'warning',
		when: "a name or file under an older name, an interface's older id, or a name a plugin's rename table renames (R96, R97, R120)",
	},
	'rename-invalid': {
		kind: 'warning',
		when: "a plugin's rename table, or an entry of it, that is not a pair of bare reference names (R120)",
	},
	'reference-legacy-format': {
		kind: 'warning',
		when: 'a contribution in a form version 1 wrote and 2.0 retired, which `reference migrate` rewrites (R119)',
	},
	'alias-not-used': { kind: 'warning', when: 'an alias a name holds as its own (R98)' },
	'alias-invalid': { kind: 'warning', when: 'an invalid or misplaced alias (R96)' },
	'project-section-not-markdown': {
		kind: 'warning',
		when: 'a Markdown project section for a name whose main document is not Markdown, or a non-Markdown file in a project folder (R99)',
	},
	'reference-hidden': {
		kind: 'warning',
		when: 'a file hidden by a `replace` or `remove` above it: one `create` or `customize` wrote (R26), or one `check` finds (R112)',
	},
	'repo-hides-user': { kind: 'warning', when: "a `user` file this repository's `repo` contribution hides (R26, R112)" },
	'root-missing': { kind: 'refused', when: 'a `--root` that does not exist (R12)' },
	'file-unreadable': { kind: 'refused', when: 'a `--request` or `--body` file that cannot be read (R81, R82)' },
	'folder-invalid': { kind: 'refused', when: 'a `--plugin` or `--default` folder that does not qualify (R24)' },
	'file-exists': {
		kind: 'refused',
		when: '`create` on a file with a body, or where the target folder holds a file answering the name in another form (R60)',
	},
	'extends-replace': {
		kind: 'refused',
		when: 'a `--plugin` or `--default` file extending a plugin with `replace` (R103)',
	},
	'interface-invalid': { kind: 'refused', when: '`--implements` with an unknown interface (R28, R111)' },
	'interface-unknown': {
		kind: 'refused',
		when: '`implementations` of an unknown interface (R35), or of a family matching none; `customize` of a family matching none (R135)',
	},
	'template-title': { kind: 'refused', when: 'a title template (R32)' },
	'template-invalid': {
		kind: 'refused',
		when: 'an unreadable template, or one whose frontmatter is not a mapping (R32)',
	},
	'extends-file-invalid': {
		kind: 'refused',
		when: 'an `--extends-file` that is unreadable or not a YAML `extends` list (R79)',
	},
	'step-invalid': { kind: 'refused', when: 'a step neither `default` nor a plugin holding the name (R79)' },
	'no-selection': { kind: 'notice', when: '`--extends none` with no `extends` there: a no-op (R80)' },
	'body-not-generated': { kind: 'refused', when: '`--request` on a body that records no request (R82)' },
	'pick-required': { kind: 'refused', when: '`--request` without `--extends` on an `ambiguous` name (R82)' },
	'name-outside-interface': {
		kind: 'refused',
		when: "`customize --implements` on a name outside the interface's namespace (R111)",
	},
	'implements-required': {
		kind: 'refused',
		when: "`--request` without `--implements` on a `missing` name under a found interface's namespace (R111)",
	},
	'in-not-markdown': {
		kind: 'refused',
		when: '`create --in` or `customize --in` for a name whose main document is not Markdown, which has no project sections (R82)',
	},
	'in-folder-missing': {
		kind: 'refused',
		when: '`--in` on `create`, `customize`, or `delete` naming a folder that does not exist (J8)',
	},
	'in-folder-ignored': {
		kind: 'refused',
		when: '`--in` on `create`, `customize`, or `delete` naming a folder git ignores (J8)',
	},
	'no-file': { kind: 'notice', when: '`delete` with no file there: a no-op (R30)' },
	'name-missing': { kind: 'usage', when: 'a command that needs a name, given none (UC1.7)' },
	'name-invalid': {
		kind: 'usage',
		when: 'a write given a string that is not a name, such as `../x` (J1, R1); `*` anywhere but the last segment of a family (R136)',
	},
	'reference-qualified': { kind: 'usage', when: 'a qualified name given to a write (R25)' },
	'query-missing': { kind: 'usage', when: '`search` with an empty query (UC3.2)' },
	'change-missing': { kind: 'usage', when: '`customize` with neither `--extends` nor `--request` (R82)' },
	'options-conflict': {
		kind: 'usage',
		when: 'flags that exclude each other, such as two of `--scope`, `--in`, `--plugin`, `--default` on `create` and `delete`, `--scope` with `--in` on `customize`, or `--merge` or `--extends` with `--in` (R24, R27, R82)',
	},
	'options-missing': {
		kind: 'usage',
		when: 'a flag given without the one it needs: `--request` without `--body`, or the reverse (R82)',
	},
	'option-invalid': {
		kind: 'usage',
		when: 'a flag given a value it does not accept, such as an unknown `--merge` operation (R27)',
	},
	'in-not-below-root': { kind: 'usage', when: '`--in` naming the root or a folder outside it (R24)' },
	'remove-with-template': { kind: 'usage', when: '`--merge remove` with `--template` (R27)' },
	'template-with-implements': { kind: 'usage', when: '`--template` with `--implements` (R28)' },
} as const satisfies Record<string, { kind: ReferenceCodeKind; when: string }>

export type ReferenceCodeKind = 'status' | 'warning' | 'refused' | 'notice' | 'usage'

export type ReferenceCode = keyof typeof referenceCodes

type CodesOf<K extends ReferenceCodeKind> = {
	[C in ReferenceCode]: (typeof referenceCodes)[C]['kind'] extends K ? C : never
}[ReferenceCode]

/** The code of a name that is not `found`. */
export type ReferenceStatusCode = CodesOf<'status'>
export type ReferenceWarningCode = CodesOf<'warning'>
/** The code of a no-op's answer, carried in the result. */
export type ReferenceNoticeCode = CodesOf<'notice'>
/** The code of a request that cannot complete (exit 1) or was called wrongly (exit 2). */
export type ReferenceErrorCode = CodesOf<'refused' | 'usage'>

const exitByKind = { status: 0, notice: 0, refused: 1, usage: 2, warning: undefined } as const

/** The exit value of a command that ends on `code`; `undefined` for a warning, which leaves it alone. */
export function referenceCodeExit(code: ReferenceCode): 0 | 1 | 2 | undefined {
	return exitByKind[referenceCodes[code].kind]
}

/**
 * A fault that never stops a name from resolving. The `code` is stable; the `message` is for a
 * person and is not a contract.
 */
export type ReferenceWarning = { code: ReferenceWarningCode; message: string }

export type WarnFn = (code: ReferenceWarningCode, message: string) => void
