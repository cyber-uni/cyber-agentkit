import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * A pass the author attested from the skill's real use instead of from a run (#323): a criterion (`id`) or a case (`case`)
 * that passed where `evidence` shows it. It carries no `passed` or `ran` counts, since no run made it, and
 * `skillFingerprint` is the skill's SKILL.md and references when it was recorded, so a later change marks it stale.
 */
export type Attestation = ({ id: string; case?: never } | { case: string; id?: never }) & {
	status: 'pass'
	source: 'attested'
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

/** An attested pass as `test`, `check` and `report` show it: `stale` when the skill changed since it was recorded. */
export type AttestationView = Attestation & { stale?: true }

/** What the attested pass is about, as a report names it: `C3`, or `case mixed-round`. */
export function attestedTarget(entry: Pick<Attestation, 'id' | 'case'>): string {
	return entry.case !== undefined ? `case ${entry.case}` : (entry.id as string)
}

/**
 * The fingerprint an attested pass is recorded against: SKILL.md and every file under `references/`, by path and content.
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

function isAttestation(value: unknown): value is Attestation {
	const entry = value as Partial<Attestation> | undefined
	return (
		!!entry &&
		entry.source === 'attested' &&
		entry.status === 'pass' &&
		typeof entry.evidence === 'string' &&
		typeof entry.at === 'string' &&
		(typeof entry.id === 'string' || typeof entry.case === 'string')
	)
}

/** The attested passes in an expected result's `attested`, leaving out any entry that is not one. */
export function attestationsIn(expected: unknown): Attestation[] {
	const attested = (expected as { attested?: unknown } | undefined)?.attested
	return Array.isArray(attested) ? attested.filter(isAttestation) : []
}

/** The attested passes in a skill's `evals/expected.json`, none when it is missing or unreadable. */
export function readAttestations(skillFolder: string): Attestation[] {
	try {
		return attestationsIn(JSON.parse(readFileSync(join(skillFolder, 'evals', 'expected.json'), 'utf8')))
	} catch {
		return []
	}
}

/** The attested passes marked `stale` where the skill's fingerprint no longer matches the one each was recorded on. */
export function viewAttestations(entries: Attestation[], fingerprint: string): AttestationView[] {
	return entries.map((entry) => (entry.skillFingerprint === fingerprint ? entry : { ...entry, stale: true }))
}

/**
 * Writes an attested pass into a skill's `evals/expected.json`, replacing an earlier one for the same criterion or case.
 * The run result in the file, if there is one, stays as it is; with no file, it writes one that holds only `attested`.
 * Throws when the file is there but is not JSON.
 */
export function recordAttestation(skillFolder: string, skill: string, entry: Attestation): string {
	const path = join(skillFolder, 'evals', 'expected.json')
	let expected: Record<string, unknown> = { version: 1, skill }
	if (existsSync(path)) {
		try {
			expected = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
		} catch (error) {
			throw new Error(`${path} is not valid JSON: ${(error as Error).message}`)
		}
	}
	const same = (other: Attestation) =>
		entry.case !== undefined ? other.case === entry.case : other.case === undefined && other.id === entry.id
	const attested = [...attestationsIn(expected).filter((other) => !same(other)), entry]
	mkdirSync(join(skillFolder, 'evals'), { recursive: true })
	writeFileSync(path, `${JSON.stringify({ ...expected, attested }, null, '\t')}\n`)
	return path
}
