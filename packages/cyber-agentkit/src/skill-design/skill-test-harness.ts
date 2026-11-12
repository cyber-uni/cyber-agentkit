import type { HarnessId } from '../harness/harness-id.js'
import { type HeadlessIsolation, headlessInvocation } from '../headless/headless-invocation.js'

/** The harnesses `skill test` can drive: Claude Code through the Agent SDK. */
export const skillTestHarnesses = ['claude-code'] as const satisfies readonly HarnessId[]

/** A harness `skill test` drives, with where a run keeps its config, skills, plugins, and login. */
export type SkillTestHarness = {
	id: HarnessId
	isolation: HeadlessIsolation
	/** The command line before the prompt, for a harness driven through its CLI. */
	command?: { executable: string; args: string[] } | undefined
	/** What still reaches a run from the user's setup, to report as a warning. */
	leaks?: string | undefined
}

/**
 * The driver for one harness, from its headless definition (`headlessInvocation`): its isolation. Answers a problem
 * for a harness `skill test` has no driver for, or whose isolation is not verified.
 */
export function skillTestHarness(id: HarnessId): SkillTestHarness | { problem: string } {
	const mode = headlessInvocation(id)
	const known = skillTestHarnesses.join(', ')
	if (!(skillTestHarnesses as readonly HarnessId[]).includes(id) || mode.supported !== true || !mode.isolation)
		return { problem: `skill test cannot drive ${id}; it drives ${known}` }
	const isolation = mode.isolation
	const leaks = isolation.leaks
	return { id, isolation, leaks }
}
