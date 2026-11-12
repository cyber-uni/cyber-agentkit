import type { HarnessId } from '../harness/harness-id.js'
import { type HeadlessIsolation, headlessCommand, headlessInvocation } from '../headless/headless-invocation.js'

/** The harnesses `skill test` can drive: Claude Code through the Agent SDK, the others through their own CLI. */
export const skillTestHarnesses = ['claude-code', 'codex'] as const satisfies readonly HarnessId[]

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
 * The driver for one harness, from its headless definition (`headlessInvocation`): its isolation, and for a CLI
 * driver the command line that runs it unattended inside the run folder, writing no transcript. Answers a problem
 * for a harness `skill test` has no driver for, or whose isolation is not verified.
 */
export function skillTestHarness(id: HarnessId, model?: string): SkillTestHarness | { problem: string } {
	const mode = headlessInvocation(id)
	const known = skillTestHarnesses.join(', ')
	if (!(skillTestHarnesses as readonly HarnessId[]).includes(id) || mode.supported !== true || !mode.isolation)
		return { problem: `skill test cannot drive ${id}; it drives ${known}` }
	const isolation = mode.isolation
	const leaks = isolation.leaks
	if (id === 'claude-code') return { id, isolation, leaks }
	// Codex writes only inside the run folder (`workspace-write`), and keeps the user's config out (E-CODEX-H6).
	const command = headlessCommand(id, {
		prompt: '',
		model,
		permission: 'workspace-write',
		outputFormat: 'jsonl',
	}) as { executable: string; args: readonly string[] }
	const args = command.args.slice(0, -1)
	args.push(...(mode.transcript?.disable ?? []))
	if (isolation.login.store === 'config-dir') args.push(...isolation.login.args)
	return { id, isolation, command: { executable: command.executable, args }, leaks }
}
