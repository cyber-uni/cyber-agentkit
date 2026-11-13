/** How an aspect's check is decided: by a script from the files, by an agent reading the skill, or only by running it. */
export type CheckHow = 'script' | 'read' | 'run'

/**
 * How much a failed check matters: a `critical` failure must be fixed before a commit, and a `warning` may wait.
 * A check that names none is critical, so a failure is never let through by default.
 */
export type CheckSeverity = 'critical' | 'warning'

export const checkSeverities: readonly CheckSeverity[] = ['critical', 'warning']

/** One check an aspect implementation lists under `## Criteria`. */
export type AspectCheck = { id: string; how: CheckHow; severity: CheckSeverity; statement: string }

export type CheckStatus = 'pass' | 'fail' | 'not-checked'

/** What a check script reports for one check, and what `skill check` reports for every check. */
export type CheckOutcome = {
	id: string
	status: CheckStatus
	/** From the check's declaration; a check script does not set it. */
	severity?: CheckSeverity
	/** Why it failed or was not checked. */
	message?: string
	/** The file, relative to the skill folder, that breaks it. */
	file?: string
	/** For a check left undecided: the `/skill` command that decides it. */
	needs?: 'check' | 'test'
}
