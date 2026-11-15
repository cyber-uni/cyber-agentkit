import assert from 'node:assert/strict'
import { test } from 'node:test'
import { doneWhenCriteria, renderEvals } from './eval-results.mjs'

const result = {
	version: 1,
	skill: 'release-notes',
	at: '2026-11-14T09:00:00Z',
	runs: 3,
	threshold: 2,
	baseline: 'without the skill',
	trigger: [
		{ case: 'trigger-1', prompt: 'write release notes', expect: 'fire', fired: 3, ran: 3, status: 'pass' },
		{ case: 'trigger-2', prompt: 'review a | diff', expect: 'skip', fired: 1, ran: 3, status: 'pass' },
	],
	criteria: [
		{ id: 'C1', status: 'pass', passed: 3, ran: 3, baseline: { passed: 3, ran: 3 } },
		{ id: 'C2', status: 'pass', passed: 3, ran: 3, baseline: { passed: 0, ran: 3 } },
		{ id: 'C3', status: 'not-tested', reason: 'no outcome case that runs tests it' },
	],
	cases: [
		{ case: 'trigger-1', status: 'pass' },
		{ case: 'trigger-2', status: 'pass' },
		{ case: 'two-prs', status: 'pass' },
	],
	notRun: [{ case: 'trigger-2 (with-skill, run 1)', reason: 'time limit' }],
	cost: 1.23,
	durationMs: 60000,
}

test('a skill with no saved result gets a one-line note and no table', () => {
	const md = renderEvals(undefined)
	assert.match(md, /^## Evals\n\nThis skill has no saved eval result yet\./)
	assert.doesNotMatch(md, /\|/)
	assert.equal(md.trim().split('\n').length, 3)
})

test('the summary line gives the date, runs, threshold, and baseline', () => {
	assert.match(
		renderEvals(result),
		/Tested 2026-11-14: 3 runs per case, passes at 2 of 3, against the same prompts without the skill\./,
	)
})

test('the gap over the baseline comes before the tables', () => {
	const md = renderEvals(result)
	assert.match(md, /with the skill, 6 of 6 criterion checks pass; without it, 3 of 6\./)
	assert.ok(md.indexOf('What the skill adds') < md.indexOf('### Trigger cases'))
})

test('trigger cases show the prompt, what was expected, and how often it fired', () => {
	const md = renderEvals(result)
	assert.match(md, /\| write release notes \| fire \| 3 of 3 \| pass \|/)
	assert.match(md, /\| review a \\\| diff \| stay out \| 1 of 3 \| pass \|/)
})

test('criteria rows show with and without the skill, largest gap first, labeled from Done when', () => {
	const md = renderEvals(result, { criteria: { C2: 'The notes group by label.' } })
	assert.match(md, /\| \*\*C2\.\*\* The notes group by label\. \| 3 of 3 \| 0 of 3 \| pass \|/)
	assert.ok(md.indexOf('**C2.**') < md.indexOf('**C1**'))
	assert.match(md, /\| \*\*C3\*\* \| — \| — \| not-tested: no outcome case that runs tests it \|/)
})

test('outcome cases leave out the trigger cases, and runs that did not run are named', () => {
	const md = renderEvals(result)
	assert.match(md, /\| `two-prs` \| pass \|/)
	assert.doesNotMatch(md, /\| `trigger-1` \|/)
	assert.match(md, /Not run, and not counted as a pass: `trigger-2 \(with-skill, run 1\)` \(time limit\)\./)
})

test('the cost is shown in dollars with the run count, and duration is not', () => {
	assert.match(
		renderEvals({ ...result, totalRuns: 18 }),
		/The run cost \$1\.23 for 18 runs, with the skill and without\./,
	)
	assert.match(renderEvals(result), /The run cost \$1\.23, with the skill and without\./)
	assert.doesNotMatch(renderEvals(result), /60000|minute/)
})

test('a result with no cost recorded shows no cost line', () => {
	const { cost, ...noCost } = result
	assert.doesNotMatch(renderEvals(noCost), /cost \$/)
})

test('a baseline that could not run is said, with no gap line', () => {
	const md = renderEvals({
		...result,
		baseline: 'Not logged in',
		criteria: [{ id: 'C1', status: 'pass', passed: 3, ran: 3 }],
	})
	assert.match(md, /with no baseline to compare \(Not logged in\)\./)
	assert.doesNotMatch(md, /What the skill adds/)
	assert.match(md, /\| \*\*C1\*\* \| 3 of 3 \| — \| pass \|/)
})

test('links to the skill page carry the site base', () => {
	for (const md of [renderEvals(undefined), renderEvals(result)])
		assert.match(md, /\]\(\/cyber-agentkit\/packages\/cyber-agentkit\/skills\/skill\/\)/)
})

test('doneWhenCriteria reads each criterion and its continuation lines', () => {
	const body = [
		'## Steps',
		'- **C9.** not this one',
		'## Done when',
		'',
		'Check each.',
		'',
		'- **C1.** First line',
		'  goes on.',
		'- **C2.** Second.',
		'## Next',
		'- **C3.** after',
	].join('\n')
	assert.deepEqual(doneWhenCriteria(body), { C1: 'First line goes on.', C2: 'Second.' })
})
