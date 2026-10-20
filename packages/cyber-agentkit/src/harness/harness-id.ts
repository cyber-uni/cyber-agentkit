/**
 * The AI agent harnesses this package knows about.
 *
 * `vscode-copilot` is GitHub Copilot's agent mode in VS Code, a different harness from
 * `copilot-cli`. `augment` is the Auggie CLI, which is detected in hook commands only.
 */
export type HarnessId =
	| 'claude-code'
	| 'cursor'
	| 'codex'
	| 'copilot-cli'
	| 'opencode'
	| 'kilo'
	| 'gemini-cli'
	| 'qwen-code'
	| 'vscode-copilot'
	| 'cline'
	| 'crush'
	| 'openhands'
	| 'augment'

export const harnessIds: readonly HarnessId[] = [
	'claude-code',
	'cursor',
	'codex',
	'copilot-cli',
	'opencode',
	'kilo',
	'gemini-cli',
	'qwen-code',
	'vscode-copilot',
	'cline',
	'crush',
	'openhands',
	'augment',
]
