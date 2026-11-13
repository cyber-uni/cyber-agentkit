import { join } from 'node:path'
import { type AspectToCheck, mergeChecks, type SkillCheckReport } from './check-skill.js'
import type { ScriptRun } from './run-check-script.js'
import type { LoadedAspect } from './skill-aspects.js'
import { readSkill } from './skill-files.js'
import {
	type GitHubGet,
	type InstallsSignal,
	type JsonGet,
	readInstalls,
	readSignals,
	type SupplyChainSignals,
} from './vet-signals.js'
import { type FetchSource, findSkillFolders, inTemporaryFolder, type VetSource } from './vet-source.js'
import { isTrusted, type TrustedPublisher } from './vet-trust.js'

/** One skill found in the source, with its Security report. */
export type VettedSkill = {
	/** The skill's folder, relative to the repository root. */
	path: string
	/** The skill's license from its `license` front matter, when it declares one. */
	license?: string
	report: SkillCheckReport
	/** Unset when the source is not on GitHub. */
	installs?: InstallsSignal
}

export type SkillVetReport = {
	source: { url: string; repository?: string; ref?: string; path?: string; commit?: string }
	/**
	 * `blocked` when a Security check failed at `critical` in any skill, or at `warning` when the publisher is not
	 * trusted; `not-blocked` otherwise. The `read` checks are left for the agent, and one it fails blocks the install
	 * by the same rule.
	 */
	verdict: 'blocked' | 'not-blocked'
	/** Set when `blocked`: `critical` when a critical check failed, else `untrusted-warning`. */
	blockedBy?: 'critical' | 'untrusted-warning'
	trust: {
		/** The publisher trust is decided for: the GitHub owner, unset for a source not on GitHub. */
		publisher?: string
		/** Whether the publisher is on the trust list; one with no known name is not. */
		trusted: boolean
		/** Every trusted publisher, with where each name came from. */
		list: TrustedPublisher[]
	}
	skills: VettedSkill[]
	/** Unset when the source is not on GitHub. */
	signals?: SupplyChainSignals
}

export type VetOptions = {
	source: VetSource
	security: LoadedAspect
	fetch: FetchSource
	runScript: (script: string, folder: string) => ScriptRun
	github: GitHubGet
	skillsSh: JsonGet
	trusted: readonly TrustedPublisher[]
	now: Date
}

function securityOnly(skillName: string, security: LoadedAspect, run: () => ScriptRun | undefined): SkillCheckReport {
	const entry: AspectToCheck = {
		aspect: security.aspect,
		implementation: security.implementation,
		checks: security.checks,
		reported: undefined,
	}
	if (security.problem) {
		entry.problem = security.problem
		entry.broken = true
	} else {
		const ran = run()
		if (ran && 'outcomes' in ran) entry.reported = ran.outcomes
		else if (ran) {
			entry.problem = ran.problem
			entry.broken = ran.broken
		} else {
			entry.problem = 'it has no check script'
			entry.broken = true
		}
	}
	return mergeChecks(skillName, [entry])
}

function verdictOf(skills: readonly VettedSkill[], trusted: boolean): Pick<SkillVetReport, 'verdict' | 'blockedBy'> {
	if (skills.some(({ report }) => report.critical > 0)) return { verdict: 'blocked', blockedBy: 'critical' }
	if (!trusted && skills.some(({ report }) => report.failed > report.critical))
		return { verdict: 'blocked', blockedBy: 'untrusted-warning' }
	return { verdict: 'not-blocked' }
}

/**
 * Checks the source out to a temporary folder outside the working copy, runs the Security aspect on every skill
 * in it, reads the supply-chain signals, and removes the folder. Reads the files as data and runs none of them.
 */
export async function vetSkill(options: VetOptions): Promise<SkillVetReport | { code: string; problem: string }> {
	const { source } = options
	type Checked = { skills: VettedSkill[]; commit: string | undefined } | { code: string; problem: string }
	const checked = await inTemporaryFolder(async (folder): Promise<Checked> => {
		const fetched = options.fetch(source, folder)
		if ('problem' in fetched) return { code: 'fetch-failed', problem: fetched.problem }
		const where = source.path ?? '.'
		const folders = findSkillFolders(folder, where)
		if (folders.length === 0) return { code: 'no-skill', problem: `no SKILL.md at or under ${where} in ${source.url}` }
		const skills = folders.map((path): VettedSkill => {
			const skill = readSkill(join(folder, path))
			const front = skill?.frontmatter
			const name = typeof front?.['name'] === 'string' ? (front['name'] as string) : (skill?.folderName ?? path)
			const report = securityOnly(name, options.security, () =>
				skill && options.security.checkScript
					? options.runScript(options.security.checkScript, skill.folder)
					: undefined,
			)
			const license = typeof front?.['license'] === 'string' ? (front['license'] as string) : undefined
			return { path, ...(license ? { license } : {}), report }
		})
		return { skills, commit: fetched.commit }
	})
	if ('problem' in checked) return checked
	const { github } = source
	const signals = github
		? await readSignals(github, {
				path: source.path,
				trusted: options.trusted.map(({ name }) => name),
				get: options.github,
				now: options.now,
			})
		: undefined
	const skills = github
		? await Promise.all(
				checked.skills.map(async (skill) => ({
					...skill,
					// skills.sh keys a count by repository and skill name, so two skills with one name cannot be told apart.
					installs:
						checked.skills.filter(({ report }) => report.skill === skill.report.skill).length > 1
							? { available: false as const, reason: 'another skill in the repository has the same name' }
							: await readInstalls(github, skill.report.skill, options.skillsSh),
				})),
			)
		: checked.skills
	// The owner GitHub answers with wins over the URL's, which an old name of a moved repository still reaches.
	const publisher = signals?.publisher.available ? signals.publisher.login : github?.owner
	const trusted = isTrusted(options.trusted, publisher)
	return {
		source: {
			url: source.url,
			...(source.github ? { repository: `${source.github.owner}/${source.github.repo}` } : {}),
			...(source.ref ? { ref: source.ref } : {}),
			...(source.path ? { path: source.path } : {}),
			...(checked.commit ? { commit: checked.commit } : {}),
		},
		...verdictOf(skills, trusted),
		trust: { ...(publisher ? { publisher } : {}), trusted, list: [...options.trusted] },
		skills,
		...(signals ? { signals } : {}),
	}
}
