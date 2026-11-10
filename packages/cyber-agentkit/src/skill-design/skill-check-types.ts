/** How an aspect's check is decided: by a script from the files, by an agent reading the skill, or only by running it. */
export type CheckHow = 'script' | 'read' | 'run'

/** One check an aspect implementation lists under `## Criteria`. */
export type AspectCheck = { id: string; how: CheckHow; statement: string }

export type CheckStatus = 'pass' | 'fail' | 'not-checked'

/** What a check script reports for one check, and what `skill check` reports for every check. */
export type CheckOutcome = {
	id: string
	status: CheckStatus
	/** Why it failed or was not checked. */
	message?: string
	/** The file, relative to the skill folder, that breaks it. */
	file?: string
	/** For a check left undecided: the `/skill` command that decides it. */
	needs?: 'check' | 'test'
}
