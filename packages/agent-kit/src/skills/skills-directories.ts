import type { HarnessId } from '../harness/harness-id.js'

export interface SkillsDirectories {
	/** Directories relative to the project root, in the order the source lists them. */
	readonly project: readonly string[]
	/** Directories relative to the home directory, in the order the source lists them. */
	readonly user: readonly string[]
	/** The claim IDs in `.research/harness-detection/evidence.md` that back these directories. */
	readonly research: readonly string[]
}

/**
 * The directories a harness reads skills from, as its vendor documents them.
 *
 * Lists project and user directories read by default. Admin, bundled, and plugin skills are left
 * out. Cline's `.agents/skills` rests on its source, which its docs do not yet name (E-CLINE-S3).
 *
 * Returns `undefined` where the directories are not confirmed: Qwen Code, whose source names the
 * `.agents` root but not the directory under it (E-QWEN-S1); and Crush and OpenHands, where no
 * directory is recorded.
 */
export function skillsDirectories(harness: HarnessId): SkillsDirectories | undefined {
	switch (harness) {
		case 'claude-code':
			return { project: ['.claude/skills'], user: ['.claude/skills'], research: ['E-CC-L1'] }
		case 'cursor':
			return {
				project: ['.agents/skills', '.cursor/skills', '.claude/skills', '.codex/skills'],
				user: ['.agents/skills', '.cursor/skills', '.claude/skills', '.codex/skills'],
				research: ['E-CUR-L1'],
			}
		case 'codex':
			return { project: ['.agents/skills'], user: ['.agents/skills'], research: ['E-CODEX-L1'] }
		case 'copilot-cli':
			return {
				project: ['.github/skills', '.agents/skills', '.claude/skills'],
				user: ['.copilot/skills', '.agents/skills'],
				research: ['E-COPILOT-S5'],
			}
		case 'vscode-copilot':
			return {
				project: ['.github/skills', '.claude/skills', '.agents/skills'],
				user: ['.copilot/skills', '.claude/skills', '.agents/skills'],
				research: ['E-VSC-P1'],
			}
		case 'opencode':
			return {
				project: ['.opencode/skills', '.claude/skills', '.agents/skills'],
				user: ['.config/opencode/skills', '.claude/skills', '.agents/skills'],
				research: ['E-OC-S1'],
			}
		case 'gemini-cli':
			return {
				project: ['.agents/skills', '.gemini/skills'],
				user: ['.agents/skills', '.gemini/skills'],
				research: ['E-GEM-L1'],
			}
		case 'cline':
			return {
				project: ['.cline/skills', '.clinerules/skills', '.claude/skills', '.agents/skills'],
				user: ['.cline/skills', '.agents/skills'],
				research: ['E-CLINE-S1', 'E-CLINE-S3'],
			}
		case 'augment':
			return {
				project: ['.augment/skills', '.claude/skills', '.agents/skills'],
				user: ['.augment/skills', '.claude/skills', '.agents/skills'],
				research: ['E-AUG-S4'],
			}
		case 'kilo':
			return {
				project: ['.kilo/skills', '.agents/skills', '.claude/skills'],
				user: ['.kilo/skills', '.agents/skills', '.claude/skills'],
				research: ['E-KILO-L2'],
			}
		case 'qwen-code':
		case 'crush':
		case 'openhands':
			return undefined
	}
}
