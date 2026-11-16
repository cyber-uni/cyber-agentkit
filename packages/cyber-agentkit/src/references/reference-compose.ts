import type { WarnFn } from './reference-codes.js'
import type { Contribution } from './reference-contribution.js'
import { mergeDataText, mergesByKey } from './reference-data-merge.js'
import {
	applyContribution,
	type Composed,
	composedSections,
	emptyComposed,
	hasBody,
	type MergeOperation,
	type PickedSection,
	pickSections,
} from './reference-document.js'
import type { OperationSource } from './resolve-reference.js'

export type OrderedContribution = {
	contribution: Contribution
	operation: MergeOperation
	from: OperationSource
	/** A step's `sections`: only these top-level sections of the contribution apply (R52). */
	sections?: readonly PickedSection[] | undefined
	/** A stack entry that merges data over the one below it even when its file writes no `extends`. */
	layered?: boolean | undefined
}

/**
 * A contribution cut to the sections its step lists (R52): its other sections are not used, and a
 * listed one it does not hold is skipped with a `section-not-held` warning. A data file has no
 * sections, so it is used whole.
 */
function picked(item: OrderedContribution, warnAt: (where: string) => WarnFn): Contribution {
	const { contribution, sections } = item
	if (!sections || contribution.whole) return contribution
	const cut = pickSections(contribution.body, sections)
	for (const heading of cut.missing) {
		warnAt(contribution.label)(
			'section-not-held',
			`the step's sections list "${heading}", which it does not hold; that entry is skipped`,
		)
	}
	return { ...contribution, body: cut.body, hasBody: hasBody(cut.body) }
}

/**
 * A data contribution that writes `extends` laid over the data file below it, key by key; `undefined` when it
 * answers whole instead (another format, or a file that does not parse, which warns).
 */
function mergedWhole(
	below: Contribution,
	over: Contribution,
	warnAt: (where: string) => WarnFn,
): Contribution | undefined {
	if (!mergesByKey(over.format) || below.format !== over.format) return undefined
	const result = mergeDataText(below.body, over.body, over.format)
	if ('problem' in result) {
		const at = result.problem === 'over' ? over : below
		warnAt(at.label)('data-merge-invalid', `${result.why}; ${over.label} answers whole instead of merging`)
		return undefined
	}
	return { ...over, body: result.content }
}

/** Applies the contributions bottom first, each with its operation, recording what each did to the trace. */
export function composeOrder(order: readonly OrderedContribution[], warnAt: (where: string) => WarnFn) {
	let composed: Composed = emptyComposed()
	let applied: Contribution[] = []
	let removedBy: Contribution | undefined
	const used: Contribution[] = []
	let whole: Contribution | undefined
	for (const item of order) {
		const { operation, from } = item
		const contribution = picked(item, warnAt)
		const { entry } = contribution
		if (contribution.whole && contribution.hasBody) {
			const merged =
				whole && (contribution.steps !== undefined || item.layered)
					? mergedWhole(whole, contribution, warnAt)
					: undefined
			if (merged) {
				entry.operation = 'patch'
				entry.operationFrom = 'default'
				entry.outcome = 'used'
				applied = [...applied, contribution]
				whole = merged
				used.push(contribution)
				continue
			}
			if (
				(contribution.steps !== undefined || item.layered) &&
				!mergesByKey(contribution.format) &&
				(whole || applied.length)
			) {
				warnAt(contribution.label)(
					'data-not-merged',
					`it answers whole: only YAML and JSON merge key by key, and this is ${contribution.format}`,
				)
			}
			entry.operation = 'replace'
			entry.operationFrom = 'default'
			for (const below of applied) below.entry.outcome = `shadowed by ${contribution.label} (replace)`
			applied = [contribution]
			composed = { ...emptyComposed(), removed: composed.removed }
			whole = contribution
			removedBy = undefined
			entry.outcome = 'used'
			used.push(contribution)
			continue
		}
		if (whole && operation !== 'remove' && contribution.hasBody) {
			entry.operation = operation
			entry.operationFrom = from
			entry.outcome = `not used (format differs from ${whole.format})`
			warnAt(contribution.label)(
				'format-mismatch',
				`it is ignored: ${whole.label} is ${whole.format}, which a Markdown contribution cannot compose with`,
			)
			continue
		}
		if (operation === 'remove') whole = undefined
		entry.operation = operation
		entry.operationFrom = from
		const warnHere = warnAt(contribution.label)
		if (operation === 'remove') {
			if (contribution.hasBody)
				warnHere('remove-body-ignored', 'a merge: remove contribution has a body; it is ignored')
			for (const below of applied) below.entry.outcome = `shadowed by ${contribution.label} (remove)`
			for (const row of composedSections(composed)) {
				if (row.path !== '(before the first heading)') composed.removed.push({ path: row.path, by: contribution.label })
			}
			const removed = composed.removed
			applied = []
			composed = { ...emptyComposed(), removed }
			removedBy = contribution
			entry.outcome = 'used'
			used.push(contribution)
			continue
		}
		if (!contribution.hasBody) {
			entry.outcome = entry.extendsOutcome ?? 'used'
			if (!entry.extendsOutcome) used.push(contribution)
			continue
		}
		if (operation === 'replace') {
			for (const below of applied) below.entry.outcome = `shadowed by ${contribution.label} (replace)`
			applied = []
		}
		composed = applyContribution(composed, contribution.body, operation, contribution.label, warnHere)
		applied.push(contribution)
		removedBy = undefined
		entry.outcome = 'used'
		used.push(contribution)
	}

	return { composed, applied, removedBy, used, whole }
}

/** Keys that say how a contribution applies or how it was generated, not what it holds: `metadata` leaves them out (UC8). */
export const recordKeys = ['merge', 'extends', 'sources', 'request'] as const

/** Lower first, so a higher contribution wins a key both set; the keys `recordKeys` names stay out, and the trace carries each as written. */
export function composedMetadata(contributions: readonly Contribution[]): Record<string, unknown> {
	const metadata: Record<string, unknown> = Object.assign({}, ...contributions.map(({ metadata }) => metadata))
	for (const key of recordKeys) delete metadata[key]
	return metadata
}

export function withNewline(content: string): string {
	return content.endsWith('\n') ? content : `${content}\n`
}

export function trimLeadingBlank(content: string): string {
	return content.replace(/^(?:[ \t]*\r?\n)+/, '')
}
