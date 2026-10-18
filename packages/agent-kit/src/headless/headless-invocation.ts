import type { HarnessId } from '../harness/harness-id.js'

/** How to run a harness on one prompt with no user present. */
export type HeadlessInvocation = HeadlessMode | HeadlessUnavailable

export interface HeadlessMode {
	readonly harness: HarnessId
	readonly supported: true
	/** The command to run. */
	readonly executable: string
	/** The arguments that put the harness in one-shot mode, such as `['-p']` or `['exec']`. */
	readonly oneShot: readonly string[]
	/**
	 * The flag whose value is the prompt. When absent, the prompt is the last positional argument.
	 */
	readonly promptFlag?: string
	/** The flag that selects the model. */
	readonly modelFlag: string
	readonly permission: HeadlessPermission
	/** The output formats it can print. The first is the default. */
	readonly outputFormats: readonly HeadlessOutputFormat[]
	/** Where a run's transcript is kept, or `undefined` when the vendor does not say. */
	readonly transcript?: HeadlessTranscript
	/** The exit codes the vendor documents. A code the list does not name means failure. */
	readonly exitCodes: readonly HeadlessExitCode[]
	/** The claim IDs in `.research/harness-detection/evidence.md` that back these facts. */
	readonly research: readonly string[]
}

export interface HeadlessUnavailable {
	readonly harness: HarnessId
	/** `false` when the harness has no headless mode; `'unknown'` when its facts are not verified. */
	readonly supported: false | 'unknown'
	readonly reason: string
	readonly research: readonly string[]
}

export interface HeadlessPermission {
	/** The flag that takes a permission or approval mode, when there is one. */
	readonly flag?: string
	/** The values `flag` accepts. */
	readonly values: readonly string[]
	/** The arguments that let a run edit files and run commands without asking anyone. */
	readonly unattended: readonly string[]
}

export interface HeadlessOutputFormat {
	/** The harness's own name for the format. */
	readonly name: string
	/** The arguments that select it; empty for the default. */
	readonly args: readonly string[]
	/** Where token usage and cost appear, or `undefined` when the vendor does not document it. */
	readonly usage?: HeadlessUsage
}

export interface HeadlessUsage {
	/** The `type` of the event or message that carries usage; absent when the output is one object. */
	readonly event?: string
	/** The field that holds token counts, as a dotted path. */
	readonly tokens: string
	/** The field that holds the cost in US dollars, when the harness reports one. */
	readonly costUsd?: string
	/** `last`: the final event holds the run's total. `sum`: add the field across every such event. */
	readonly accumulate: 'last' | 'sum'
}

export interface HeadlessTranscript {
	/** The path, with `~` for the home directory and `<placeholders>` for the varying parts. */
	readonly path: string
	/** The environment variable that moves the base directory the path starts from. */
	readonly baseDirEnv?: string
	/** The arguments that keep a run from writing a transcript at all. */
	readonly disable?: readonly string[]
}

export interface HeadlessExitCode {
	readonly code: number
	readonly meaning: string
}

const claudeUsage: HeadlessUsage = {
	event: 'result',
	tokens: 'usage',
	costUsd: 'total_cost_usd',
	accumulate: 'last',
}

const qwenUsage: HeadlessUsage = { event: 'result', tokens: 'usage', accumulate: 'last' }

const unverified =
	'has a documented one-shot mode, but its flags were not read directly from a vendor page, so they are not encoded'

/**
 * How to run a harness non-interactively on one prompt: the command, how to choose the model and
 * permission mode, the output formats and where usage appears in them, the transcript location,
 * and the exit codes.
 *
 * Returns `supported: false` for Copilot in VS Code, which documents no headless mode (E-VSC-H1).
 * Returns `supported: 'unknown'` for OpenCode, Kilo Code, Cline, Crush, OpenHands, and the Auggie
 * CLI: each has a one-shot mode, but the research read it only through a summarizing fetch or from
 * source (E-OC-H1, E-KILO-H1, E-CLINE-H1, E-CRUSH-H1, E-OH-H1, E-AUG-H1).
 */
export function headlessInvocation(harness: HarnessId): HeadlessInvocation {
	switch (harness) {
		case 'claude-code':
			return {
				harness,
				supported: true,
				executable: 'claude',
				oneShot: ['-p'],
				modelFlag: '--model',
				permission: {
					flag: '--permission-mode',
					values: ['acceptEdits', 'auto', 'bypassPermissions', 'manual', 'dontAsk', 'plan'],
					unattended: ['--permission-mode', 'bypassPermissions'],
				},
				outputFormats: [
					{ name: 'text', args: [] },
					{ name: 'json', args: ['--output-format', 'json'], usage: claudeUsage },
					// Claude Code rejects `stream-json` in print mode without `--verbose` (E-CC-H4).
					{ name: 'stream-json', args: ['--output-format', 'stream-json', '--verbose'], usage: claudeUsage },
				],
				transcript: {
					path: '~/.claude/projects/<project>/<session-id>.jsonl',
					baseDirEnv: 'CLAUDE_CONFIG_DIR',
					disable: ['--no-session-persistence'],
				},
				// A capped run is told apart by the result message's `subtype`, not by its exit code (E-CC-H6).
				exitCodes: [
					{ code: 0, meaning: 'success' },
					{ code: 143, meaning: 'terminated by SIGTERM' },
				],
				research: ['E-CC-H1', 'E-CC-H2', 'E-CC-H3', 'E-CC-H4', 'E-CC-H5', 'E-CC-H6'],
			}
		case 'codex':
			return {
				harness,
				supported: true,
				executable: 'codex',
				oneShot: ['exec'],
				modelFlag: '--model',
				permission: {
					flag: '--sandbox',
					values: ['read-only', 'workspace-write', 'danger-full-access'],
					unattended: ['--dangerously-bypass-approvals-and-sandbox'],
				},
				outputFormats: [
					{ name: 'text', args: [] },
					{
						name: 'jsonl',
						args: ['--json'],
						usage: { event: 'turn.completed', tokens: 'usage', accumulate: 'sum' },
					},
				],
				transcript: {
					path: '~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-<timestamp>-<thread-id>.jsonl',
					baseDirEnv: 'CODEX_HOME',
					disable: ['--ephemeral'],
				},
				exitCodes: [
					{ code: 0, meaning: 'success' },
					{ code: 1, meaning: 'the run reported a fatal error, or the prompt or options were invalid' },
				],
				research: ['E-CODEX-H1', 'E-CODEX-H2', 'E-CODEX-H3', 'E-CODEX-H4', 'E-CODEX-H5'],
			}
		case 'copilot-cli':
			return {
				harness,
				supported: true,
				executable: 'copilot',
				oneShot: [],
				promptFlag: '-p',
				modelFlag: '--model',
				permission: { values: [], unattended: ['--allow-all'] },
				outputFormats: [
					{ name: 'text', args: [] },
					{ name: 'json', args: ['--output-format', 'json'] },
				],
				transcript: { path: '~/.copilot/session-state/<session-id>/events.jsonl', baseDirEnv: 'COPILOT_HOME' },
				exitCodes: [],
				research: ['E-COPILOT-H1', 'E-COPILOT-H2', 'E-COPILOT-H3'],
			}
		case 'cursor':
			return {
				harness,
				supported: true,
				executable: 'cursor-agent',
				oneShot: ['-p'],
				modelFlag: '--model',
				// Without `--force`, the headless page says file changes are only proposed (E-CUR-H1).
				permission: { values: [], unattended: ['--force'] },
				outputFormats: [
					{ name: 'text', args: [] },
					{ name: 'json', args: ['--output-format', 'json'] },
					{ name: 'stream-json', args: ['--output-format', 'stream-json'] },
				],
				exitCodes: [
					{ code: 0, meaning: 'success' },
					{ code: 1, meaning: 'failure' },
				],
				research: ['E-CUR-H1', 'E-CUR-H2', 'E-CUR-H3'],
			}
		case 'gemini-cli':
			return {
				harness,
				supported: true,
				executable: 'gemini',
				oneShot: [],
				promptFlag: '-p',
				modelFlag: '--model',
				permission: {
					flag: '--approval-mode',
					values: ['default', 'auto_edit', 'yolo', 'plan'],
					unattended: ['--approval-mode', 'yolo'],
				},
				outputFormats: [
					{ name: 'text', args: [] },
					{ name: 'json', args: ['--output-format', 'json'], usage: { tokens: 'stats', accumulate: 'last' } },
					{
						name: 'stream-json',
						args: ['--output-format', 'stream-json'],
						usage: { event: 'result', tokens: 'stats', accumulate: 'last' },
					},
				],
				transcript: { path: '~/.gemini/tmp/<project_hash>/chats/' },
				exitCodes: [
					{ code: 0, meaning: 'success' },
					{ code: 1, meaning: 'general error or API failure' },
					{ code: 42, meaning: 'input error: an invalid prompt or arguments' },
					{ code: 53, meaning: 'turn limit exceeded' },
				],
				research: ['E-GEM-H1', 'E-GEM-H2', 'E-GEM-H3'],
			}
		case 'qwen-code':
			return {
				harness,
				supported: true,
				executable: 'qwen',
				oneShot: [],
				promptFlag: '-p',
				modelFlag: '--model',
				permission: {
					flag: '--approval-mode',
					values: ['plan', 'default', 'auto-edit', 'auto', 'yolo'],
					unattended: ['--approval-mode', 'yolo'],
				},
				outputFormats: [
					{ name: 'text', args: [] },
					{ name: 'json', args: ['--output-format', 'json'], usage: qwenUsage },
					{ name: 'stream-json', args: ['--output-format', 'stream-json'], usage: qwenUsage },
				],
				transcript: { path: '~/.qwen/projects/<sanitized-cwd>/chats/' },
				exitCodes: [
					{ code: 53, meaning: 'turn limit exceeded' },
					{ code: 55, meaning: 'tool-call or wall-time budget exceeded' },
					{ code: 130, meaning: 'interrupted by SIGINT' },
				],
				research: ['E-QWEN-H1', 'E-QWEN-H2'],
			}
		case 'vscode-copilot':
			return {
				harness,
				supported: false,
				reason: 'agent mode runs inside the editor; the docs point terminal use to the Copilot CLI',
				research: ['E-VSC-H1'],
			}
		case 'opencode':
			return { harness, supported: 'unknown', reason: `\`opencode run\` ${unverified}`, research: ['E-OC-H1'] }
		case 'kilo':
			return { harness, supported: 'unknown', reason: `\`kilo run\` ${unverified}`, research: ['E-KILO-H1'] }
		case 'cline':
			return { harness, supported: 'unknown', reason: `the Cline CLI ${unverified}`, research: ['E-CLINE-H1'] }
		case 'crush':
			return { harness, supported: 'unknown', reason: `\`crush run\` ${unverified}`, research: ['E-CRUSH-H1'] }
		case 'openhands':
			return {
				harness,
				supported: 'unknown',
				reason: `\`openhands --headless\` ${unverified}`,
				research: ['E-OH-H1'],
			}
		case 'augment':
			return { harness, supported: 'unknown', reason: `\`auggie --print\` ${unverified}`, research: ['E-AUG-H1'] }
	}
}

export interface HeadlessCommandOptions {
	readonly prompt: string
	readonly model?: string
	/** A value for the permission flag, or `'unattended'` for a run nobody watches. */
	readonly permission?: string
	/** The name of one of the harness's output formats. */
	readonly outputFormat?: string
}

export interface HeadlessCommand {
	readonly executable: string
	readonly args: readonly string[]
}

/**
 * The command line for one headless run, built from `headlessInvocation()`. It does not run it.
 *
 * Returns `undefined` when the harness's headless mode is not supported or not verified. Throws
 * when `outputFormat` names a format the harness lacks, or `permission` names a mode the harness
 * has no flag for.
 */
export function headlessCommand(harness: HarnessId, options: HeadlessCommandOptions): HeadlessCommand | undefined {
	const mode = headlessInvocation(harness)
	if (mode.supported !== true) return undefined

	const args = [...mode.oneShot]
	if (options.model !== undefined) args.push(mode.modelFlag, options.model)
	if (options.permission === 'unattended') args.push(...mode.permission.unattended)
	else if (options.permission !== undefined) {
		const { flag, values } = mode.permission
		if (flag === undefined || !values.includes(options.permission))
			throw new Error(`${harness} has no permission mode "${options.permission}"`)
		args.push(flag, options.permission)
	}
	if (options.outputFormat !== undefined) {
		const format = mode.outputFormats.find((f) => f.name === options.outputFormat)
		if (format === undefined) throw new Error(`${harness} has no output format "${options.outputFormat}"`)
		args.push(...format.args)
	}
	if (mode.promptFlag === undefined) args.push(options.prompt)
	else args.push(mode.promptFlag, options.prompt)
	return { executable: mode.executable, args }
}
