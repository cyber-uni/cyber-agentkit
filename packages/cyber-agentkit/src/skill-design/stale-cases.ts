import type { EvalSet, ExpectedFile } from './expected-result.js'
import type { InputHashes, Reported } from './test-result.js'

/**
 * Which cases are stale (K12) and why, scope by scope (R177): a case is stale when it has no entry in the expected
 * result, or when its own definition, or an input of its scope, differs from what its entry was recorded against.
 */

/** Why one scope's cases were selected. Each list is left out when empty. */
export type ScopeSelection = {
	scope: string
	/** The scope's stale cases, in eval set order. */
	cases: string[]
	/** The cases with no entry. */
	noEntry?: string[]
	/** The cases whose own definition changed: its entry, files folder, setup script, or a rubric it tests (R180). */
	caseChanged?: string[]
	/** The scope's inputs that changed since its stale entries were recorded, each by name (R178). */
	inputsChanged?: string[]
	/** The cases whose entry records no inputs to compare, such as one written before inputs were hashed. */
	unrecorded?: string[]
}

/** The stale cases of a skill, per scope, and how many cases are current. */
export type Selection = {
	/** Every stale case, in eval set order. */
	stale: string[]
	/** The scopes with a stale case, in the order their first case comes. */
	scopes: ScopeSelection[]
	/** How many cases are current, so they do not run. */
	current: number
	/**
	 * What changed since the expected result was written that is no input (R179), such as the built scripts: listed, and
	 * no case is selected for it.
	 */
	notSelecting?: string[]
}

/** The names of the inputs that differ between two lists, each changed one as is, an added or removed one marked. */
export function changedInputs(before: Record<string, string>, after: Record<string, string>): string[] {
	const names = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
	return names.flatMap((name) => {
		if (!(name in before)) return [`${name} (added)`]
		if (!(name in after)) return [`${name} (removed)`]
		return before[name] === after[name] ? [] : [name]
	})
}

/** What changed that selects no case (R179): the built scripts, the harness, and the Verification implementation. */
export function notSelecting(before: Reported | undefined, now: Reported | undefined): string[] {
	if (!before || !now) return []
	const out: string[] = []
	if (before.scripts !== now.scripts) out.push('built scripts changed')
	if (before.harness && now.harness && before.harness !== now.harness)
		out.push(`harness changed: ${before.harness} → ${now.harness}`)
	if (before.verification && now.verification && before.verification !== now.verification)
		out.push(`Verification implementation changed: ${before.verification} → ${now.verification}`)
	return out
}

const add = (list: string[] | undefined, value: string) => (list?.includes(value) ? list : [...(list ?? []), value])

/** The stale cases of an eval set against its expected result, from the inputs as they are now (K12, R177). */
export function selectStale(evalSet: EvalSet, inputs: InputHashes, file: ExpectedFile | undefined): Selection {
	const scopes = new Map<string, ScopeSelection>()
	const stale: string[] = []
	let current = 0
	for (const item of evalSet.cases) {
		const scope = inputs.scopeOf?.[item.id] ?? item.scope
		const entry = file?.entries[item.id]
		const reasons: ('noEntry' | 'caseChanged' | 'unrecorded')[] = []
		let changed: string[] = []
		if (!entry || entry.status === 'not-run' || entry.status === 'not-tested') reasons.push('noEntry')
		else if (!entry.hashes) reasons.push('unrecorded')
		else {
			if (entry.hashes.case !== inputs.cases[item.id]) reasons.push('caseChanged')
			if (entry.scope !== scope) changed = [`the case moved from scope ${entry.scope}`]
			else if (entry.hashes.scope !== inputs.scopes[scope]) {
				const before = file?.inputs?.[entry.hashes.scope]
				const after = inputs.inputs?.[scope]
				if (before && after) changed = changedInputs(before, after)
				// The scope hash differs, so some input did; with no list recorded, which one is unknown.
				if (!changed.length) reasons.push('unrecorded')
			}
		}
		if (!reasons.length && !changed.length) {
			current++
			continue
		}
		stale.push(item.id)
		let selection = scopes.get(scope) ?? { scope, cases: [] }
		selection = { ...selection, cases: [...selection.cases, item.id] }
		for (const reason of reasons) selection[reason] = add(selection[reason], item.id)
		for (const name of changed) selection.inputsChanged = add(selection.inputsChanged, name)
		scopes.set(scope, selection)
	}
	const reported = notSelecting(file?.reported, inputs.reported)
	return { stale, scopes: [...scopes.values()], current, ...(reported.length ? { notSelecting: reported } : {}) }
}

/** One line per scope selected, for a text report: the scope, its cases, and why (R177). */
export function selectionLines(selection: Selection): string[] {
	const lines = selection.scopes.map((item) => {
		const why = [
			...(item.inputsChanged?.length ? [`changed: ${item.inputsChanged.join(', ')}`] : []),
			...(item.caseChanged?.length ? [`case changed: ${item.caseChanged.join(', ')}`] : []),
			...(item.noEntry?.length ? [`no entry: ${item.noEntry.join(', ')}`] : []),
			...(item.unrecorded?.length ? [`inputs not recorded: ${item.unrecorded.join(', ')}`] : []),
		]
		return `stale: scope ${item.scope}, ${item.cases.length} case${item.cases.length === 1 ? '' : 's'} (${why.join('; ')})`
	})
	if (selection.current) lines.push(`current: ${selection.current} case${selection.current === 1 ? '' : 's'} not run`)
	for (const item of selection.notSelecting ?? []) lines.push(`not selecting: ${item}; no case is stale for it`)
	return lines
}
