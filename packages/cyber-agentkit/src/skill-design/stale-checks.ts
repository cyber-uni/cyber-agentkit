import { readEvalSet } from './expected-result.js'
import { type InputOptions, inputHashes } from './input-hashes.js'
import type { CheckOutcome } from './skill-check-types.js'
import { criteriaItems, type SkillFiles } from './skill-files.js'
import { readExpectedFile } from './skill-test.js'
import { selectionLines, selectStale } from './stale-cases.js'

/**
 * VER-18 and VER-19 (R186): what `skill test` would run with no case named, read from the files alone. A stale case
 * (K12) is named with its scope and the input that changed, or that it has no entry; an entry carried forward without
 * a run (R183) is named as carried, so it never reads as a pass from a run.
 */
export function checkStaleCases(skill: SkillFiles, options: InputOptions = {}): CheckOutcome[] {
	const file = 'evals/expected.json'
	const items = criteriaItems(skill)
	const criteria = items ? items.ids.filter((id): id is string => id !== undefined) : []
	const inputs = inputHashes(skill, criteria, options)
	const evalSet = readEvalSet(skill.folder, criteria)
	if (!inputs || !evalSet)
		return ['VER-18', 'VER-19'].map((id) => ({ id, status: 'not-checked', message: 'the evals cannot be read' }))
	const expected = readExpectedFile(skill.folder, evalSet)
	const selection = selectStale(evalSet, inputs, expected)
	const stale: CheckOutcome = selection.stale.length
		? {
				id: 'VER-18',
				status: 'fail',
				message: `${selection.stale.length === 1 ? '1 case is' : `${selection.stale.length} cases are`} stale, and \`skill test\` runs ${selection.stale.length === 1 ? 'it' : 'them'}: ${selectionLines(
					selection,
				)
					.filter((line) => line.startsWith('stale: '))
					.map((line) => line.slice('stale: '.length))
					.join('; ')}`,
				file,
			}
		: { id: 'VER-18', status: 'pass' }
	const inSet = new Set(evalSet.cases.map((item) => item.id))
	const carried = Object.entries(expected?.entries ?? {}).flatMap(([id, entry]) =>
		entry.carried && inSet.has(id) ? [`${id} (${entry.carried.reason}, ${entry.carried.at.slice(0, 10)})`] : [],
	)
	return [
		stale,
		carried.length
			? {
					id: 'VER-19',
					status: 'fail',
					message: `${carried.length === 1 ? '1 expected entry was' : `${carried.length} expected entries were`} carried forward, not run: ${carried.join('; ')}`,
					file,
				}
			: { id: 'VER-19', status: 'pass' },
	]
}
