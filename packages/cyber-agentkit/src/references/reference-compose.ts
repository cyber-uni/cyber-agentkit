import type { WarnFn } from './reference-codes.js'
import type { Contribution } from './reference-contribution.js'
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
