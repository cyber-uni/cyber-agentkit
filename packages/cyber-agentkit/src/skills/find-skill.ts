import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { HarnessId } from '../harness/harness-id.js'
import type { Platform } from '../harness/platform.js'
import { harnessSkillFolders } from './harness-skill-folders.js'
import { type FoundSkill, skillsIn } from './skill-folder.js'

export type FindSkillOptions = {
	/** The skill's folder, else its name. */
	skill: string
	cwd: string
	/** The repository root, whose `skills/` and harness skill folders are searched. */
	root: string
	/** The harnesses detected, whose skill folders are searched. */
	harnesses: readonly HarnessId[]
	/** More skill folders to search, such as installed skills already found. */
	also?: readonly string[] | undefined
	home: string
	platform?: Platform | undefined
	env?: Readonly<Record<string, string | undefined>> | undefined
}

export type FindSkillResult =
	| { found: FoundSkill }
	| { code: 'skill-not-found'; message: string }
	| { code: 'skill-ambiguous'; message: string; folders: string[] }

/** The skill given as a folder, else by name among the folders the detected harnesses read and the repository's own. */
export function findSkill({
	skill: input,
	cwd,
	root,
	harnesses,
	also = [],
	home,
	platform = process.platform as Platform,
	env = process.env,
}: FindSkillOptions): FindSkillResult {
	const folder = resolve(cwd, input)
	const own = skillsIn([folder])
	if (own.length === 1 && existsSync(join(folder, 'SKILL.md'))) return { found: own[0] as FoundSkill }
	const folders = harnesses.flatMap(
		(harness) => harnessSkillFolders(harness, { chain: [root], home, platform, env }) ?? [],
	)
	const known = skillsIn([...folders, join(root, 'skills'), join(root, '.agents', 'skills'), ...also])
	const same = known.filter(({ name }) => name === input)
	if (same.length === 1) return { found: same[0] as FoundSkill }
	if (same.length) {
		return {
			code: 'skill-ambiguous',
			message: `${same.length} skills are named "${input}"; give the folder of one.`,
			folders: same.map((skill) => skill.folder),
		}
	}
	return { code: 'skill-not-found', message: `No skill "${input}" was found; give its name or its folder.` }
}
