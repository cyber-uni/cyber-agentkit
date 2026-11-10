import type { AspectCheck, CheckOutcome, CheckStatus } from './skill-check-types.js'

/** One aspect as `skill check` runs it: its checks and, for a script check, where the outcome comes from. */
export type AspectToCheck = {
	aspect: string
	/** Who supplied it: `built in`, a plugin's name, or a tier. */
	implementation: string
	checks: AspectCheck[]
	/** The outcomes its check script, or the built-in code, reported; `undefined` when nothing ran. */
	reported: CheckOutcome[] | undefined
	/** Why nothing ran, or why the script broke. */
	problem?: string
	/** The script broke, rather than there being none: reported as a failure, so CI does not pass on it. */
	broken?: boolean
}

export type AspectReport = { aspect: string; implementation: string; status: CheckStatus; checks: CheckOutcome[] }

export type SkillCheckReport = {
	skill: string
	status: CheckStatus
	passed: number
	failed: number
	notChecked: number
	aspects: AspectReport[]
}

function outcomeFor(check: AspectCheck, aspect: AspectToCheck): CheckOutcome {
	if (check.how === 'read')
		return { id: check.id, status: 'not-checked', message: 'an agent decides it by reading the skill', needs: 'check' }
	if (check.how === 'run')
		return { id: check.id, status: 'not-checked', message: 'only running the skill decides it', needs: 'test' }
	const found = aspect.reported?.find((outcome) => outcome.id === check.id)
	if (found) return found
	const message = aspect.reported ? 'its check script did not decide it' : (aspect.problem ?? 'it has no check script')
	return { id: check.id, status: 'not-checked', message, needs: 'check' }
}

function statusOf(outcomes: CheckOutcome[]): CheckStatus {
	if (outcomes.some((outcome) => outcome.status === 'fail')) return 'fail'
	return outcomes.every((outcome) => outcome.status === 'pass') ? 'pass' : 'not-checked'
}

/**
 * Merges each aspect's checks with what ran: a script check takes the reported outcome, and every other
 * check is left not checked, naming the `/skill` command that decides it. Never reports a pass it did not see.
 */
export function mergeChecks(skill: string, aspects: AspectToCheck[]): SkillCheckReport {
	const reports = aspects.map((aspect): AspectReport => {
		const checks = aspect.checks.map((check) => outcomeFor(check, aspect))
		if (aspect.broken)
			checks.push({ id: 'SCRIPT', status: 'fail', message: aspect.problem ?? 'the check script broke' })
		return { aspect: aspect.aspect, implementation: aspect.implementation, status: statusOf(checks), checks }
	})
	const all = reports.flatMap((report) => report.checks)
	return {
		skill,
		status: statusOf(all),
		passed: all.filter((outcome) => outcome.status === 'pass').length,
		failed: all.filter((outcome) => outcome.status === 'fail').length,
		notChecked: all.filter((outcome) => outcome.status === 'not-checked').length,
		aspects: reports,
	}
}
