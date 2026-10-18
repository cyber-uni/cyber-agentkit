import type { HarnessId } from '../harness/harness-id.js'

export interface PluginSkill {
	/** The plugin's `name`. */
	readonly plugin: string
	/** The skill's frontmatter `name`, which every harness uses as the skill segment. */
	readonly skill: string
}

export interface SkillInvocation {
	/** What a user types to invoke the skill: a slash command, or for Codex a `$` mention. */
	readonly text: string
	/** Whether the text names the plugin, so same-named skills from two plugins stay distinct. */
	readonly namespaced: boolean
	/** The claim ID in `.research/harness-detection/evidence.md` that backs this form. */
	readonly research: string
}

/**
 * How a user invokes a plugin's skill in a harness.
 *
 * Claude Code and Copilot in VS Code namespace by plugin; elsewhere two plugins' skills with the
 * same name collide (Copilot CLI keeps the first one it finds).
 *
 * Kilo Code returns `/<skill>` in both the CLI and the VS Code extension; when a custom command or
 * MCP prompt has the same name, the skill is typed `/<skill>:skill` instead (E-KILO-S3).
 *
 * Returns `undefined` for OpenCode, Gemini CLI, Qwen Code, and Crush, which document no typed form:
 * the model loads a skill through a tool call when its description matches the task (E-OC-S2,
 * E-GEM-S2, E-QWEN-S1, E-CRUSH-S1). Crush can also list a skill in its command
 * palette, which is picked, not typed (E-CRUSH-S2). OpenHands triggers skills from the model too;
 * only a plugin's commands take a `/<plugin>:<command>` form (E-OH-S2, E-OH-S3).
 *
 * Also returns `undefined` for the Auggie CLI: a plugin skill's internal name is `<plugin>:<skill>`,
 * but what the user types for it is not confirmed (E-AUG-S3).
 */
export function skillInvocation(harness: HarnessId, { plugin, skill }: PluginSkill): SkillInvocation | undefined {
	switch (harness) {
		case 'claude-code':
			return { text: `/${plugin}:${skill}`, namespaced: true, research: 'E-CC-S1' }
		case 'cursor':
			return { text: `/${skill}`, namespaced: false, research: 'E-CUR-S1' }
		case 'codex':
			return { text: `$${skill}`, namespaced: false, research: 'E-CODEX-S1' }
		case 'copilot-cli':
			return { text: `/${skill}`, namespaced: false, research: 'E-COPILOT-S6' }
		case 'vscode-copilot':
			return { text: `/${plugin}:${skill}`, namespaced: true, research: 'E-VSC-S1' }
		case 'cline':
			return { text: `/${skill}`, namespaced: false, research: 'E-CLINE-S2' }
		case 'kilo':
			return { text: `/${skill}`, namespaced: false, research: 'E-KILO-S3' }
		case 'opencode':
		case 'gemini-cli':
		case 'qwen-code':
		case 'crush':
		case 'openhands':
		case 'augment':
			return undefined
	}
}
