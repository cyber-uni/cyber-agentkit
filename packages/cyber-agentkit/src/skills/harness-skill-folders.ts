import { readFileSync } from 'node:fs'
import { join, resolve, win32 } from 'node:path'
import type { HarnessId } from '../harness/harness-id.js'
import type { Platform } from '../harness/platform.js'
import { isRecord } from '../plugins/json-file.js'
import { pluginManifestPaths } from '../plugins/plugin-manifest.js'
import { skillsDirectories } from './skills-directories.js'

/**
 * The harnesses whose skill folders are verified: project, user, machine-wide admin, and plugin
 * skills (`.research/skill-resolution`, `.research/machine-wide-content`). Any other harness reads
 * folders this library does not know, so its skills' defaults are not listed.
 */
export const skillFoldersVerified: readonly HarnessId[] = [
	'claude-code',
	'cursor',
	'codex',
	'copilot-cli',
	'opencode',
	'gemini-cli',
]

type Env = Readonly<Record<string, string | undefined>>

export type SkillFolderOptions = {
	/** The project folders, nearest first, up to the repository root. */
	chain: readonly string[]
	home: string
	platform: Platform
	env?: Env | undefined
}

/**
 * The machine-wide admin skill folders: Claude Code's enterprise `<managed dir>/.claude/skills`
 * (E-MW-CC-2), Codex's ADMIN scope `/etc/codex/skills` (E-MW-CODEX-1; its Windows folder is
 * inferred, so it is left out), and OpenCode's `skill` and `skills` under its system folder
 * (E-MW-OC-1, E-MW-OC-2).
 */
export function adminSkillFolders(harness: HarnessId, platform: Platform, env: Env = {}): string[] {
	const programData = env['ProgramData'] || 'C:\\ProgramData'
	switch (harness) {
		case 'claude-code':
			if (platform === 'darwin') return ['/Library/Application Support/ClaudeCode/.claude/skills']
			if (platform === 'win32') return [win32.join('C:\\Program Files\\ClaudeCode', '.claude', 'skills')]
			return ['/etc/claude-code/.claude/skills']
		case 'codex':
			return platform === 'win32' ? [] : ['/etc/codex/skills']
		case 'opencode': {
			const system =
				platform === 'darwin'
					? '/Library/Application Support/opencode'
					: platform === 'win32'
						? win32.join(programData, 'opencode')
						: '/etc/opencode'
			const path = platform === 'win32' ? win32 : { join }
			return [path.join(system, 'skill'), path.join(system, 'skills')]
		}
		default:
			return []
	}
}

/**
 * The project, user, and admin folders a harness reads skills from, each holding skill folders one
 * level down; `undefined` when the harness's skill folders are not verified.
 */
export function harnessSkillFolders(harness: HarnessId, { chain, home, platform, env = {} }: SkillFolderOptions) {
	if (!skillFoldersVerified.includes(harness)) return undefined
	const directories = skillsDirectories(harness)
	if (!directories) return undefined
	const project = chain.flatMap((dir) => directories.project.map((folder) => join(dir, folder)))
	const relocated = directories.relocatedBy && env[directories.relocatedBy.variable]
	const user =
		relocated && resolve(relocated) !== join(home, '.copilot')
			? [join(relocated, (directories.relocatedBy as { skills: string }).skills)]
			: directories.user.map((folder) => join(home, folder))
	return [...project, ...user, ...adminSkillFolders(harness, platform, env)]
}

function manifestSkills(root: string): string[] | undefined {
	for (const path of pluginManifestPaths) {
		let manifest: unknown
		try {
			manifest = JSON.parse(readFileSync(join(root, path), 'utf8'))
		} catch {
			continue
		}
		if (!isRecord(manifest)) return undefined
		const value = manifest['skills']
		if (typeof value === 'string') return [value]
		if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value as string[]
		return undefined
	}
	return undefined
}

/**
 * The folders a plugin's skills sit in: `skills/` under its root, and what a manifest `skills` field
 * lists, which adds to `skills/` in Claude Code (E-SR-CC-1) and replaces it in Cursor, Codex, and
 * Copilot CLI (E-SR-CUR-2, E-SR-CODEX-2, E-SR-COPILOT-2). Gemini CLI has no such field (E-SR-GEM-1),
 * and OpenCode plugins ship no skills (E-SR-OC-3). A root holding `SKILL.md` is itself a skill
 * (E-SR-CC-1, E-SR-CUR-1); the caller checks the root.
 */
export function pluginSkillFolders(harness: HarnessId, root: string): string[] {
	if (harness === 'opencode') return []
	const field = harness === 'gemini-cli' ? undefined : manifestSkills(root)
	const skills = join(root, 'skills')
	if (!field) return [skills]
	const listed = field.map((path) => join(root, path))
	return harness === 'claude-code' ? [skills, ...listed] : listed
}
