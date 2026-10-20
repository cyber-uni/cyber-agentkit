import type { HarnessId } from '../harness/harness-id.js'
import type { ProcessInfo } from './process-source.js'

/** A harness the process probe recognises: the detected harnesses plus two seen only as processes. */
export type SessionHarnessId = HarnessId | 'goose' | 'antigravity-cli'

/**
 * How a harness's processes look in `/proc`. A session is recognised by its executable and argv,
 * never its environment: a nested session inherits every tool marker of the shell that ran it
 * (E-PROC-CC3), and the session's own environment holds none (E-PROC-ENV1).
 */
export interface SessionSignature {
	harness: SessionHarnessId
	/** Evidence IDs in `.research/worktree-management/evidence.md`. */
	research: readonly string[]
	/** The process is this harness's session process (or one half of a wrapper + native pair). */
	isSession(info: ProcessInfo): boolean
	/**
	 * Same executable, not a session. `session` helpers belong to one session and die with it;
	 * `shared` helpers serve every session of the harness and outlive them.
	 */
	helper?: ((info: ProcessInfo) => 'session' | 'shared' | undefined) | undefined
	/** Environment variables the harness stamps on its tool processes, naming the launching session. */
	link?: { pid?: string | undefined; id?: string | undefined } | undefined
}

const base = (path: string | undefined) => path?.slice(path.lastIndexOf('/') + 1)
const exeIs = (info: ProcessInfo, name: string) => base(info.exe) === name
const exeMatches = (info: ProcessInfo, pattern: RegExp) => info.exe !== undefined && pattern.test(info.exe)
const isNode = (info: ProcessInfo) => exeIs(info, 'node') || base(info.argv[0]) === 'node'
const argMatches = (info: ProcessInfo, pattern: RegExp) => info.argv.some((arg) => pattern.test(arg))

export const sessionSignatures: readonly SessionSignature[] = [
	{
		harness: 'claude-code',
		research: ['E-PROC-CC1', 'E-PROC-CC2', 'E-PROC-CC3'],
		isSession: (info) => exeMatches(info, /\/claude\/versions\/[^/]+$/),
		link: { pid: 'CLAUDE_PID', id: 'CLAUDE_CODE_SESSION_ID' },
	},
	{
		harness: 'codex',
		research: ['E-PROC-CX1', 'E-PROC-CX2'],
		isSession: (info) => exeIs(info, 'codex') && !isCodexHelper(info),
		helper: (info) => (isCodexHelper(info) ? 'session' : undefined),
		link: { id: 'CODEX_SESSION_ID' },
	},
	{
		harness: 'copilot-cli',
		research: ['E-PROC-COP1', 'E-PROC-COP2'],
		isSession: (info) => exeIs(info, 'copilot'),
		link: { id: 'COPILOT_AGENT_SESSION_ID' },
	},
	{
		harness: 'cursor',
		research: ['E-PROC-CUR1', 'E-PROC-CUR3', 'E-PROC-CUR4'],
		// A worker whose environment is unreadable counts as a session: busy is the safer mistake.
		isSession: (info) => isCursorAgent(info) && info.env?.AGENT_CLI_SOCKET_PATH === undefined,
		helper: (info) => (isCursorAgent(info) && info.env?.AGENT_CLI_SOCKET_PATH !== undefined ? 'session' : undefined),
		link: { id: 'CURSOR_CONVERSATION_ID' },
	},
	{
		harness: 'opencode',
		research: ['E-PROC-OC1'],
		isSession: (info) => exeIs(info, 'opencode'),
		link: { pid: 'OPENCODE_PID' },
	},
	{
		harness: 'kilo',
		research: ['E-PROC-KILO1'],
		isSession: (info) =>
			exeMatches(info, /\/cli-linux-x64\/bin\/kilo$/) ||
			(isNode(info) && argMatches(info, /\/@kilocode\/cli\/bin\/kilo$/)),
		link: { pid: 'KILO_PID', id: 'KILO_RUN_ID' },
	},
	{
		harness: 'qwen-code',
		research: ['E-PROC-QWEN1'],
		isSession: (info) => isNode(info) && argMatches(info, /\/qwen-code\/cli-entry\.js$/),
		link: { id: 'QWEN_CODE_SESSION_ID' },
	},
	{
		harness: 'crush',
		research: ['E-PROC-CRUSH1'],
		isSession: (info) =>
			exeMatches(info, /\/crush\/bin\/crush$/) || (isNode(info) && argMatches(info, /\/@charmland\/crush(\/|$)/)),
	},
	{
		harness: 'gemini-cli',
		research: ['E-PROC-GEM1'],
		// Wrapper and relaunched child both run `gemini.js`; tool-process markers are unobserved.
		isSession: (info) => isNode(info) && argMatches(info, /\/gemini-cli\/bundle\/gemini\.js$/),
	},
	{
		harness: 'goose',
		research: ['E-PROC-GOOSE1'],
		isSession: (info) => exeIs(info, 'goose') && (info.argv[1] === 'run' || info.argv[1] === 'session'),
		link: { id: 'AGENT_SESSION_ID' },
	},
	{
		harness: 'openhands',
		research: ['E-PROC-OH1'],
		isSession: (info) => /^python[\d.]*$/.test(base(info.exe) ?? '') && argMatches(info, /\/openhands$/),
		helper: (info) =>
			exeIs(info, 'tmux') && (info.argv.includes('-Lopenhands') || /-L openhands( |$)/.test(info.argv.join(' ')))
				? 'shared'
				: undefined,
	},
	{
		harness: 'cline',
		research: ['E-PROC-CLINE1'],
		isSession: (info) => isClineProcess(info) && !info.argv.includes('--cline-hub-daemon'),
		helper: (info) => (isClineProcess(info) && info.argv.includes('--cline-hub-daemon') ? 'shared' : undefined),
	},
	{
		harness: 'augment',
		research: ['E-PROC-AUG1'],
		isSession: (info) => isNode(info) && argMatches(info, /\/@augmentcode\/auggie\/augment\.mjs$/),
	},
	{
		harness: 'antigravity-cli',
		// The `remote-control` daemon's process shape is unobserved, so it is not excluded: a daemon
		// running as `agy` counts as a session, which errs toward busy.
		research: ['E-PROC-AGY1'],
		isSession: (info) => exeIs(info, 'agy'),
		link: { id: 'ANTIGRAVITY_CONVERSATION_ID' },
	},
]

function isCodexHelper(info: ProcessInfo) {
	return base(info.exe) === 'codex-code-mode-host' || info.argv.some((arg) => base(arg) === 'codex-code-mode-host')
}

function isCursorAgent(info: ProcessInfo) {
	return isNode(info) && argMatches(info, /(^|\/)cursor-agent$/)
}

function isClineProcess(info: ProcessInfo) {
	return exeMatches(info, /\/cli-linux-x64\/bin\/cline$/) || (isNode(info) && argMatches(info, /\/cline\/bin\/cline$/))
}
