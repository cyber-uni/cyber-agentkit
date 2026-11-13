import type { AspectCheck, CheckOutcome, CheckStatus } from './skill-check-types.js'

/** Which failures make `skill check` exit non-zero: any failure, or only a critical one. */
export type FailOn = 'any' | 'critical'

export const failOnPolicies: readonly FailOn[] = ['any', 'critical']

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
	/** The checks that do not apply to this skill, each with why: reported as skipped, whatever decides them. */
	skipped?: Record<string, string>
}

export type AspectReport = { aspect: string; implementation: string; status: CheckStatus; checks: CheckOutcome[] }

export type SkillCheckReport = {
	skill: string
	status: CheckStatus
	passed: number
	failed: number
	/** How many of the failures are critical; the rest are warnings. */
	critical: number
	notChecked: number
	skipped: number
	aspects: AspectReport[]
}

function outcomeFor(check: AspectCheck, aspect: AspectToCheck): CheckOutcome {
	const { id, severity } = check
	const skipped = aspect.skipped?.[id]
	if (skipped !== undefined) return { id, status: 'skipped', severity, message: skipped }
	if (check.how === 'read')
		return { id, status: 'not-checked', severity, message: 'an agent decides it by reading the skill', needs: 'check' }
	if (check.how === 'run')
		return { id, status: 'not-checked', severity, message: 'only running the skill decides it', needs: 'test' }
	const found = aspect.reported?.find((outcome) => outcome.id === id)
	if (found) return { ...found, severity }
	const message = aspect.reported ? 'its check script did not decide it' : (aspect.problem ?? 'it has no check script')
	return { id, status: 'not-checked', severity, message, needs: 'check' }
}

function statusOf(outcomes: CheckOutcome[]): CheckStatus {
	if (outcomes.some((outcome) => outcome.status === 'fail')) return 'fail'
	return outcomes.every((outcome) => outcome.status === 'pass' || outcome.status === 'skipped') ? 'pass' : 'not-checked'
}

/**
 * Merges each aspect's checks with what ran: a script check takes the reported outcome, and every other
 * check is left not checked, naming the `/skill` command that decides it. A check that does not apply to the skill
 * is skipped. Never reports a pass it did not see.
 */
export function mergeChecks(skill: string, aspects: AspectToCheck[]): SkillCheckReport {
	const reports = aspects.map((aspect): AspectReport => {
		const checks = aspect.checks.map((check) => outcomeFor(check, aspect))
		if (aspect.broken)
			checks.push({
				id: 'SCRIPT',
				status: 'fail',
				severity: 'critical',
				message: aspect.problem ?? 'the check script broke',
			})
		return { aspect: aspect.aspect, implementation: aspect.implementation, status: statusOf(checks), checks }
	})
	const all = reports.flatMap((report) => report.checks)
	const failed = all.filter((outcome) => outcome.status === 'fail')
	return {
		skill,
		status: statusOf(all),
		passed: all.filter((outcome) => outcome.status === 'pass').length,
		failed: failed.length,
		critical: failed.filter((outcome) => outcome.severity === 'critical').length,
		notChecked: all.filter((outcome) => outcome.status === 'not-checked').length,
		skipped: all.filter((outcome) => outcome.status === 'skipped').length,
		aspects: reports,
	}
}

/** Whether the report breaks the policy, so `skill check` exits non-zero. */
export function failsPolicy(report: Pick<SkillCheckReport, 'critical' | 'failed'>, failOn: FailOn): boolean {
	return (failOn === 'critical' ? report.critical : report.failed) > 0
}
