import { writeFileSync } from 'node:fs'
import { isMap, isScalar, type Pair, type parseDocument, type YAMLMap } from 'yaml'
import { inPlace, lineStart, nextLine, readEvals } from './eval-case.js'
import { type EvalsFile, evalsProblems, knownFailureMarks } from './verification-checks.js'

/**
 * `skill fails`: marks a trigger case, or one criterion of an outcome case, as known to fail, with the reason, as
 * `it.fails` marks a test (#329). The mark is the case's `fails` in `evals/evals.yaml`, so it is reviewed and versioned
 * beside the case. Each edit changes only the text of the mark, so every comment and the layout of the rest stay.
 */

/** A mark of a known failure: a trigger case's (`trigger-<n>`) has no criterion. */
export type KnownFailureMark = { case: string; criterion?: string; reason: string }

/** Why `skill fails` changed nothing. */
export type MarkProblemCode = 'evals-invalid' | 'unknown-case' | 'bad-criterion' | 'no-reason' | 'not-marked'
export type MarkProblem = { code: MarkProblemCode; problem: string }

type Doc = ReturnType<typeof parseDocument>
type Target = { case: string; criterion?: string | undefined }

/** The value without its marks, so a file whose only problem is a mark can still have the mark replaced or cleared. */
function withoutMarks(value: unknown): unknown {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return value
	const strip = (list: unknown) =>
		Array.isArray(list)
			? list.map((item) => {
					if (!item || typeof item !== 'object' || Array.isArray(item)) return item
					const { fails: _fails, ...rest } = item as Record<string, unknown>
					return rest
				})
			: list
	const record = value as Record<string, unknown>
	return {
		...record,
		...('trigger' in record ? { trigger: strip(record['trigger']) } : {}),
		...('outcome' in record ? { outcome: strip(record['outcome']) } : {}),
	}
}

const read = (skillFolder: string) => readEvals(skillFolder, (value) => evalsProblems(withoutMarks(value)))

/** Every mark in the skill's `evals/evals.yaml`, trigger cases first, in file order. */
export function listKnownFailures(skillFolder: string): { evals: string; marks: KnownFailureMark[] } | MarkProblem {
	const evals = read(skillFolder)
	if ('problem' in evals) return evals.problem
	const value = (evals.doc.toJS() ?? {}) as EvalsFile
	const marks = knownFailureMarks(value).filter((mark) => typeof mark.reason === 'string')
	return { evals: evals.file, marks }
}

/** The entry a target names: `trigger-<n>` a trigger case, anything else an outcome case's `id`. */
function locate(
	doc: Doc,
	target: Target,
): { kind: 'trigger' | 'outcome'; index: number; node: YAMLMap; value: Record<string, unknown> } | MarkProblem {
	const value = (doc.toJS() ?? {}) as EvalsFile
	const trigger = /^trigger-(\d+)$/.exec(target.case)
	if (trigger) {
		const index = Number(trigger[1]) - 1
		const node = (doc.get('trigger', true) as { items?: unknown[] } | undefined)?.items?.[index]
		if (!value.trigger?.[index] || !isMap(node))
			return {
				code: 'unknown-case',
				problem: `evals/evals.yaml has no trigger case ${target.case}; it has ${value.trigger?.length ?? 0}`,
			}
		if (target.criterion !== undefined)
			return {
				code: 'bad-criterion',
				problem: `${target.case} is a trigger case, which tests no criterion; mark it without one`,
			}
		return { kind: 'trigger', index, node, value: value.trigger[index] as Record<string, unknown> }
	}
	const index = (value.outcome ?? []).findIndex((item) => item.id === target.case)
	const node = (doc.get('outcome', true) as { items?: unknown[] } | undefined)?.items?.[index]
	if (index < 0 || !isMap(node)) {
		const ids = [
			...(value.trigger ?? []).map((_, at) => `trigger-${at + 1}`),
			...(value.outcome ?? []).map((item) => item.id),
		]
		return {
			code: 'unknown-case',
			problem: `evals/evals.yaml has no case ${target.case}; its cases are ${ids.join(', ') || 'none'}`,
		}
	}
	return { kind: 'outcome', index, node, value: value.outcome?.[index] as Record<string, unknown> }
}

const pairOf = (map: YAMLMap, key: string) =>
	(map.items as Pair[]).find((pair) => (isScalar(pair.key) ? pair.key.value : pair.key) === key)
const endOf = (pair: Pair) =>
	(pair.value as { range?: [number, number, number] } | null)?.range?.[1] ??
	(pair.key as { range?: [number, number, number] }).range?.[1]
const startOf = (pair: Pair) => (pair.key as { range?: [number, number, number] } | null)?.range?.[0]
/** The column a block map's keys start at, when every key opens its line or follows a `- `. */
function keyColumn(source: string, map: YAMLMap): number | undefined {
	const first = map.items[0] as Pair | undefined
	const start = first && startOf(first)
	if (start === undefined) return undefined
	return /^ *(- +)*$/.test(source.slice(lineStart(source, start), start)) ? start - lineStart(source, start) : undefined
}

/** The text with `key: <text>` set in `map`: its value replaced when it has one, else a new pair after the last. */
function setText(source: string, map: YAMLMap, key: string, text: string, block?: string[]): string | undefined {
	const pair = pairOf(map, key)
	const range = (pair?.value as { range?: [number, number, number] } | null)?.range
	if (pair && range && isScalar(pair.value)) return source.slice(0, range[0]) + text + source.slice(range[1])
	if (pair) return undefined
	const last = map.items[map.items.length - 1] as Pair | undefined
	const end = last && endOf(last)
	if (map.flow) {
		const close = (map.range?.[1] ?? 0) - 1
		if (source[close] !== '}') return undefined
		if (end === undefined) return `${source.slice(0, close)}${key}: ${text}${source.slice(close)}`
		return `${source.slice(0, end)}, ${key}: ${text}${source.slice(end)}`
	}
	const column = keyColumn(source, map)
	if (column === undefined || end === undefined) return undefined
	const at = nextLine(source, end)
	const before = source.slice(0, at)
	const lines = (block ?? [`${key}: ${text}`]).map((line) => `${' '.repeat(column)}${line}\n`).join('')
	return `${before}${before.endsWith('\n') ? '' : '\n'}${lines}${source.slice(at)}`
}

/** The text with the pair `key` cut out of `map`. */
function removedText(source: string, map: YAMLMap, key: string): string | undefined {
	const pairs = map.items as Pair[]
	const pair = pairOf(map, key)
	if (!pair) return undefined
	const index = pairs.indexOf(pair)
	const start = startOf(pair)
	const end = endOf(pair)
	if (start === undefined || end === undefined) return undefined
	if (map.flow) {
		const before = pairs[index - 1]
		const after = pairs[index + 1]
		const from = before ? endOf(before) : start
		const to = before ? end : after ? startOf(after) : end
		if (from === undefined || to === undefined) return undefined
		return source.slice(0, from) + source.slice(to)
	}
	const head = lineStart(source, start)
	if (!/^ *$/.test(source.slice(head, start))) return undefined
	return source.slice(0, head) + source.slice(nextLine(source, end))
}

/** Writes the edited text, or the whole document when the edit could not be placed in the text. */
function write(file: string, doc: Doc, expected: unknown, edited: string | undefined, fallback: () => void): void {
	const text =
		inPlace(expected, edited) ??
		(() => {
			fallback()
			return doc.toString()
		})()
	writeFileSync(file, text)
}

const criterionId = /^[A-Za-z][A-Za-z0-9._-]*$/

/**
 * Marks a case or criterion as known to fail with `reason`, or replaces the reason of its mark. A trigger case takes no
 * criterion; an outcome case takes one of the criteria it tests: its `criteria`, else every one of `skillCriteria`.
 */
export function markKnownFailure(
	skillFolder: string,
	target: Target,
	reason: string,
	skillCriteria: string[],
): { evals: string; mark: KnownFailureMark; replaced?: string } | MarkProblem {
	if (reason.trim() === '')
		return { code: 'no-reason', problem: 'a mark needs the reason the case is known to fail, a sentence or a link' }
	const evals = read(skillFolder)
	if ('problem' in evals) return evals.problem
	const { file, source, doc } = evals
	const found = locate(doc, target)
	if ('problem' in found) return found
	const text = JSON.stringify(reason)
	const value = (doc.toJS() ?? {}) as Record<string, unknown[]>
	if (found.kind === 'trigger') {
		const replaced = typeof found.value['fails'] === 'string' ? (found.value['fails'] as string) : undefined
		const expected = structuredClone(value)
		;(expected['trigger']?.[found.index] as Record<string, unknown>)['fails'] = reason
		write(file, doc, expected, setText(source, found.node, 'fails', text), () =>
			doc.setIn(['trigger', found.index, 'fails'], reason),
		)
		return { evals: file, mark: { case: target.case, reason }, ...(replaced !== undefined ? { replaced } : {}) }
	}
	const tested = Array.isArray(found.value['criteria']) ? (found.value['criteria'] as string[]) : skillCriteria
	if (target.criterion === undefined || !criterionId.test(target.criterion) || !tested.includes(target.criterion))
		return {
			code: 'bad-criterion',
			problem:
				target.criterion === undefined
					? `name the criterion of ${target.case} that is known to fail: one of ${tested.join(', ') || 'none'}`
					: `${target.case} does not test ${target.criterion}; it tests ${tested.join(', ') || 'none'}`,
		}
	const criterion = target.criterion
	const fails = found.value['fails']
	const marks = fails && typeof fails === 'object' && !Array.isArray(fails) ? (fails as Record<string, unknown>) : {}
	const replaced = typeof marks[criterion] === 'string' ? (marks[criterion] as string) : undefined
	const expected = structuredClone(value)
	const entry = expected['outcome']?.[found.index] as Record<string, unknown>
	entry['fails'] = { ...marks, [criterion]: reason }
	const failsNode = pairOf(found.node, 'fails')?.value
	const edited = isMap(failsNode)
		? setText(source, failsNode, criterion, text)
		: failsNode === undefined || failsNode === null
			? setText(source, found.node, 'fails', `{ ${criterion}: ${text} }`, ['fails:', `  ${criterion}: ${text}`])
			: undefined
	write(file, doc, expected, edited, () => doc.setIn(['outcome', found.index, 'fails'], entry['fails']))
	return {
		evals: file,
		mark: { case: target.case, criterion, reason },
		...(replaced !== undefined ? { replaced } : {}),
	}
}

/**
 * Clears a mark: a trigger case's, one criterion's of an outcome case, or, with no criterion, every mark of the outcome
 * case. Changes nothing when there is no such mark.
 */
export function clearKnownFailure(
	skillFolder: string,
	target: Target,
): { evals: string; cleared: KnownFailureMark[] } | MarkProblem {
	const evals = read(skillFolder)
	if ('problem' in evals) return evals.problem
	const { file, source, doc } = evals
	const found = locate(doc, target)
	if ('problem' in found) return found
	const value = (doc.toJS() ?? {}) as Record<string, unknown[]>
	const notMarked = (what: string): MarkProblem => ({
		code: 'not-marked',
		problem: `${what} is not marked known to fail`,
	})
	const list = found.kind === 'trigger' ? 'trigger' : 'outcome'
	const expected = structuredClone(value)
	const entry = expected[list]?.[found.index] as Record<string, unknown>
	if (found.kind === 'trigger' || target.criterion === undefined) {
		const fails = found.value['fails']
		if (fails === undefined) return notMarked(target.case)
		const cleared: KnownFailureMark[] =
			found.kind === 'trigger'
				? [{ case: target.case, reason: String(fails) }]
				: Object.entries((fails ?? {}) as Record<string, unknown>).map(([criterion, reason]) => ({
						case: target.case,
						criterion,
						reason: String(reason),
					}))
		delete entry['fails']
		write(file, doc, expected, removedText(source, found.node, 'fails'), () =>
			doc.deleteIn([list, found.index, 'fails']),
		)
		return { evals: file, cleared }
	}
	const criterion = target.criterion
	const failsNode = pairOf(found.node, 'fails')?.value
	const marks = (found.value['fails'] ?? {}) as Record<string, unknown>
	if (!isMap(failsNode) || !(criterion in marks)) return notMarked(`${target.case} ${criterion}`)
	const rest = Object.fromEntries(Object.entries(marks).filter(([id]) => id !== criterion))
	// The last mark of a case takes its `fails` with it.
	const last = !Object.keys(rest).length
	if (last) delete entry['fails']
	else entry['fails'] = rest
	const edited = last ? removedText(source, found.node, 'fails') : removedText(source, failsNode, criterion)
	write(file, doc, expected, edited, () =>
		last ? doc.deleteIn(['outcome', found.index, 'fails']) : doc.deleteIn(['outcome', found.index, 'fails', criterion]),
	)
	return { evals: file, cleared: [{ case: target.case, criterion, reason: String(marks[criterion]) }] }
}
