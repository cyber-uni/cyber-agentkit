import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * A pass the author recorded from the skill's use instead of from a run (#323): a criterion (`id`) or a case (`case`)
 * that passed where `evidence` shows it. It carries no `passed` or `ran` counts, since no run made it, and
 * `skillFingerprint` is the skill's SKILL.md and references when it was recorded, so a later change marks it stale.
 */
export type LivePass = ({ id: string; case?: never } | { case: string; id?: never }) & {
	status: 'pass'
	source: 'live'
	/** Where the pass can be seen, such as a merge request's thread or pipeline. */
	evidence: string
	/** What happened there, in the author's words. */
	note?: string
	/** Who recorded it. */
	by?: string
	/** When it was recorded. */
	at: string
	skillFingerprint: string
}

/** A live pass as `test`, `check` and `report` show it: `stale` when the skill changed since it was recorded. */
export type LiveView = LivePass & { stale?: true }

/** What the live pass is about, as a report names it: `C3`, or `case mixed-round`. */
export function liveTarget(entry: Pick<LivePass, 'id' | 'case'>): string {
	return entry.case !== undefined ? `case ${entry.case}` : (entry.id as string)
}

/**
 * The fingerprint a live pass is recorded against: SKILL.md and every file under `references/`, by path and content.
 * Evals and results are left out, so recording a pass or adding a case does not make one stale.
 */
export function skillFingerprint(skillFolder: string): string {
	const hash = createHash('sha256')
	const files = [join(skillFolder, 'SKILL.md'), ...walk(join(skillFolder, 'references'))].filter((path) =>
		existsSync(path),
	)
	for (const path of files) {
		hash.update(`\0${relative(skillFolder, path).split('\\').join('/')}\0`)
		hash.update(readFileSync(path))
	}
	return hash.digest('hex')
}

function walk(folder: string): string[] {
	if (!existsSync(folder)) return []
	return readdirSync(folder, { withFileTypes: true })
		.flatMap((entry) => {
			const path = join(folder, entry.name)
			if (entry.isDirectory()) return walk(path)
			return entry.isFile() ? [path] : []
		})
		.sort()
}

function isLivePass(value: unknown): value is LivePass {
	const entry = value as Partial<LivePass> | undefined
	return (
		!!entry &&
		entry.source === 'live' &&
		entry.status === 'pass' &&
		typeof entry.evidence === 'string' &&
		typeof entry.at === 'string' &&
		(typeof entry.id === 'string' || typeof entry.case === 'string')
	)
}

/** The live passes in an expected result's `live`, leaving out any entry that is not one. */
export function livePasses(expected: unknown): LivePass[] {
	const live = (expected as { live?: unknown } | undefined)?.live
	return Array.isArray(live) ? live.filter(isLivePass) : []
}

/** The live passes in a skill's `evals/expected.json`, none when it is missing or unreadable. */
export function readLivePasses(skillFolder: string): LivePass[] {
	try {
		return livePasses(JSON.parse(readFileSync(join(skillFolder, 'evals', 'expected.json'), 'utf8')))
	} catch {
		return []
	}
}

/** The live passes marked `stale` where the skill's fingerprint no longer matches the one each was recorded on. */
export function viewLivePasses(entries: LivePass[], fingerprint: string): LiveView[] {
	return entries.map((entry) => (entry.skillFingerprint === fingerprint ? entry : { ...entry, stale: true }))
}

/**
 * Writes a live pass into a skill's `evals/expected.json`, replacing an earlier one for the same criterion or case.
 * The run result in the file, if there is one, stays as it is; with no file, it writes one that holds only `live`.
 * Throws when the file is there but is not JSON.
 */
export function recordLivePass(skillFolder: string, skill: string, entry: LivePass): string {
	const path = join(skillFolder, 'evals', 'expected.json')
	let expected: Record<string, unknown> = { version: 1, skill }
	if (existsSync(path)) {
		try {
			expected = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
		} catch (error) {
			throw new Error(`${path} is not valid JSON: ${(error as Error).message}`)
		}
	}
	const same = (other: LivePass) =>
		entry.case !== undefined ? other.case === entry.case : other.case === undefined && other.id === entry.id
	const live = [...livePasses(expected).filter((other) => !same(other)), entry]
	mkdirSync(join(skillFolder, 'evals'), { recursive: true })
	writeFileSync(path, `${JSON.stringify({ ...expected, live }, null, '\t')}\n`)
	return path
}
