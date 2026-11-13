import { readdirSync, statSync } from 'node:fs'
import { isAbsolute, join, parse, relative, resolve } from 'node:path'
import { type FoundSkill, skillsIn } from '../skills/skill-folder.js'
import type { SkillCheckReport } from './check-skill.js'
import type { CheckStatus } from './skill-check-types.js'

/** The folders `skill check` scans when given no skill and no `--dir`, relative to the repository root. */
export const defaultSkillDirs: readonly string[] = ['skills', '.agents/skills']

/** Folders never descended into by a `**` segment. */
const skippedDirs = new Set(['node_modules', '.git'])

function isDirectory(path: string): boolean {
	try {
		return statSync(path).isDirectory()
	} catch {
		return false
	}
}

function subfolders(folder: string): string[] {
	try {
		return readdirSync(folder)
			.sort()
			.filter((entry) => isDirectory(join(folder, entry)))
	} catch {
		return []
	}
}

/** Every folder under `folder`, itself included, skipping `node_modules` and `.git`. */
function allFolders(folder: string): string[] {
	const found = [folder]
	for (const entry of subfolders(folder)) if (!skippedDirs.has(entry)) found.push(...allFolders(join(folder, entry)))
	return found
}

function segmentPattern(segment: string): RegExp {
	const source = segment
		.replace(/[.+^${}()|\\]/g, '\\$&')
		.replace(/\*/g, '[^/]*')
		.replace(/\?/g, '[^/]')
	return new RegExp(`^${source}$`)
}

/**
 * The folders a glob names under `root`: `*` and `?` match within one path segment, `**` matches any number of
 * segments, and `[...]` a character class. A pattern without one names a single folder. Only folders that exist are
 * returned.
 */
export function expandDir(root: string, pattern: string): string[] {
	const base = isAbsolute(pattern) ? parse(pattern).root : resolve(root)
	let folders = [base]
	const rest = isAbsolute(pattern) ? pattern.slice(base.length) : pattern
	const segments = rest.split(/[\\/]+/).filter((segment) => segment !== '' && segment !== '.')
	for (const segment of segments) {
		if (segment === '**') folders = folders.flatMap(allFolders)
		else if (/[*?[]/.test(segment)) {
			const match = segmentPattern(segment)
			folders = folders.flatMap((folder) =>
				subfolders(folder)
					.filter((entry) => match.test(entry) && (entry[0] !== '.' || segment[0] === '.'))
					.map((entry) => join(folder, entry)),
			)
		} else folders = folders.map((folder) => join(folder, segment)).filter(isDirectory)
	}
	return [...new Set(folders)]
}

/**
 * The skills under the given folder globs, relative to `root`: each folder that is a skill, else each skill one
 * level under it. A skill reached twice, such as through a symlink, is listed once.
 */
export function findSkills(root: string, dirs: readonly string[]): FoundSkill[] {
	return skillsIn(dirs.flatMap((dir) => expandDir(root, dir)))
}

/** One skill's report in a repository check, with where the skill lives. */
export type SkillInRepository = SkillCheckReport & { folder: string }

export type RepositoryCheckReport = {
	/** The folder globs that were scanned. */
	dirs: readonly string[]
	status: CheckStatus
	/** How many skills were checked, and how many of them failed a check. */
	skills: number
	skillsFailed: number
	passed: number
	failed: number
	/** How many of the failures are critical; the rest are warnings. */
	critical: number
	notChecked: number
	/** Checks that do not apply to the skill they were run on, such as a trigger check on a name-only skill. */
	skipped: number
	reports: SkillInRepository[]
}

/** Combines each skill's report into one, whose counts are the sums and whose status is the worst. */
export function combineReports(
	root: string,
	dirs: readonly string[],
	reports: { folder: string; report: SkillCheckReport }[],
): RepositoryCheckReport {
	const all = reports.map(({ folder, report }) => ({ ...report, folder: relative(root, folder) || '.' }))
	const sum = (key: 'passed' | 'failed' | 'critical' | 'notChecked' | 'skipped') =>
		all.reduce((total, report) => total + report[key], 0)
	const status: CheckStatus = all.some((report) => report.status === 'fail')
		? 'fail'
		: all.every((report) => report.status === 'pass' || report.status === 'skipped')
			? 'pass'
			: 'not-checked'
	return {
		dirs,
		status,
		skills: all.length,
		skillsFailed: all.filter((report) => report.status === 'fail').length,
		passed: sum('passed'),
		failed: sum('failed'),
		critical: sum('critical'),
		notChecked: sum('notChecked'),
		skipped: sum('skipped'),
		reports: all,
	}
}
