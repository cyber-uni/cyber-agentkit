import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { HarnessId } from '../harness/harness-id.js'
import { harnessIds } from '../harness/harness-id.js'
import { findRoot, repoReferencesDir, userReferencesDir } from '../references/reference-layers.js'
import { resolveReference } from '../references/resolve-reference.js'

/** The reference that holds a tier's declared harnesses: `.agents/references/harnesses.yaml` at the root or under home. */
export const declaredHarnessesReference = 'harnesses'

/** The tiers a declaration is read from, highest first. */
export type DeclarationTier = 'repo' | 'user'

/** A harness the user or the project says is in use, whether or not detection can see it. */
export interface DeclaredHarness {
	readonly harness: HarnessId
	/** The files that declare it, the repo's first. */
	readonly evidence: readonly string[]
}

/** An entry a declaration file holds that is not a harness ID, or a file that cannot be read as a declaration. */
export interface RejectedDeclaration {
	readonly file: string
	/** The entry as written; absent when the whole file is unreadable. */
	readonly harness?: string
	readonly message: string
}

export interface DeclaredHarnessesOptions {
	/** The repository root, whose `.agents/references/` is the repo tier. Defaults to the nearest folder at or above `cwd` holding `.git`. */
	readonly root?: string | undefined
	readonly cwd?: string | undefined
	/** The home directory, whose `.agents/references/` is the user tier. Defaults to `os.homedir()`. */
	readonly home?: string | undefined
}

export interface DeclaredHarnessesResult {
	/** Each declared harness once, in `harnessIds` order. */
	readonly harnesses: readonly DeclaredHarness[]
	/** Entries rejected, each with the valid IDs in its message. */
	readonly rejected: readonly RejectedDeclaration[]
}

/** One tier's declaration: the file that holds it, the IDs it lists, and what it rejects. */
export interface TierDeclaration {
	readonly tier: DeclarationTier
	/** The `references/` folder read. */
	readonly dir: string
	/** The file that answered, when one did. */
	readonly file?: string | undefined
	readonly harnesses: readonly HarnessId[]
	readonly rejected: readonly RejectedDeclaration[]
}

export function isHarnessId(value: string): value is HarnessId {
	return (harnessIds as readonly string[]).includes(value)
}

/** The message for an ID that is not one of `harnessIds`, naming every valid one. */
export function unknownHarnessMessage(value: string): string {
	return `"${value}" is not a harness ID; use one of ${harnessIds.join(', ')}.`
}

export function tierDir(tier: DeclarationTier, { root, cwd, home }: DeclaredHarnessesOptions): string {
	return tier === 'user'
		? userReferencesDir(home ?? homedir())
		: repoReferencesDir(root === undefined ? findRoot(cwd ?? process.cwd()) : resolve(cwd ?? process.cwd(), root))
}

/**
 * Reads one tier's `harnesses` reference through the resolver, with that tier as its only layer, so the file forms
 * and sidecars are the ones every reference uses. The file is YAML or JSON with a `declared` list of harness IDs.
 */
export function tierDeclaration(tier: DeclarationTier, options: DeclaredHarnessesOptions = {}): TierDeclaration {
	const dir = tierDir(tier, options)
	const resolved = resolveReference(declaredHarnessesReference, [{ tier, dir }])
	const layer = resolved.trace.layers.find((entry) => entry.tier === tier)
	const file = resolved.status === 'found' && layer?.file ? layer.path : undefined
	if (resolved.status !== 'found' || resolved.content === undefined || file === undefined)
		return { tier, dir, harnesses: [], rejected: [] }
	const reject = (message: string): TierDeclaration => ({
		tier,
		dir,
		file,
		harnesses: [],
		rejected: [{ file, message }],
	})
	if (resolved.format !== 'yaml' && resolved.format !== 'json')
		return reject(`${file} is not YAML or JSON, so it declares no harness.`)
	let value: unknown
	try {
		value = parseYaml(resolved.content)
	} catch (error) {
		return reject(`${file} does not parse: ${(error as Error).message.split('\n')[0]}`)
	}
	if (value === null || value === undefined) return { tier, dir, file, harnesses: [], rejected: [] }
	const declared = (value as { declared?: unknown }).declared
	if (typeof value !== 'object' || Array.isArray(value) || (declared !== undefined && !Array.isArray(declared)))
		return reject(`${file} must be a mapping with a \`declared\` list of harness IDs.`)
	const harnesses: HarnessId[] = []
	const rejected: RejectedDeclaration[] = []
	for (const entry of (declared ?? []) as unknown[]) {
		const id = String(entry)
		if (isHarnessId(id)) {
			if (!harnesses.includes(id)) harnesses.push(id)
		} else rejected.push({ file, harness: id, message: unknownHarnessMessage(id) })
	}
	return { tier, dir, file, harnesses, rejected }
}

/**
 * The harnesses declared in the repo and user tiers, combined: a harness either tier lists is declared. A data
 * reference answers whole from its highest tier, so each tier is read on its own and the lists are joined.
 */
export function declaredHarnesses(options: DeclaredHarnessesOptions = {}): DeclaredHarnessesResult {
	const tiers = (['repo', 'user'] as const).map((tier) => tierDeclaration(tier, options))
	const harnesses = harnessIds.flatMap((harness): DeclaredHarness[] => {
		const evidence = tiers.flatMap(({ file, harnesses }) => (file && harnesses.includes(harness) ? [file] : []))
		return evidence.length ? [{ harness, evidence }] : []
	})
	return { harnesses, rejected: tiers.flatMap(({ rejected }) => rejected) }
}
