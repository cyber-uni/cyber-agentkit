import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cli } from 'clibuilder'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { doneWhenCriteria, evalReport, reportMarkdown } from './eval-report.js'
import { createSkillCommand } from './skill.command.js'
import { goodSkill } from './skill-design.fixtures.js'
import type { TestResult } from './test-result.js'

const result = {
	version: 1,
	skill: 'release-notes',
	at: '2026-11-14T09:00:00Z',
	verification: 'x',
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
} as TestResult

const md = (r: TestResult | undefined, labels: Record<string, string> = {}, history: TestResult[] = []) =>
	reportMarkdown(evalReport('release-notes', r, { labels, history }))

describe('reportMarkdown', () => {
	it('gives a skill with no saved result a one-line note and no table', () => {
		const text = md(undefined)
		expect(text).toMatch(/^## Evals\n\nThis skill has no saved eval result yet\./)
		expect(text).not.toMatch(/\|/)
		expect(text.trim().split('\n')).toHaveLength(3)
	})

	it('gives the date, runs, threshold, and baseline in the summary line', () => {
		expect(md(result)).toMatch(
			/Tested 2026-11-14: 3 runs per case, passes at 2 of 3, against the same prompts without the skill\./,
		)
	})

	it('puts the gap over the baseline before the tables', () => {
		const text = md(result)
		expect(text).toMatch(/with the skill, 6 of 6 criterion checks pass; without it, 3 of 6\./)
		expect(text.indexOf('What the skill adds')).toBeLessThan(text.indexOf('### Trigger cases'))
	})

	it('shows each trigger case with its prompt, what was expected, and how often it fired', () => {
		const text = md(result)
		expect(text).toContain('| write release notes | fire | 3 of 3 | pass |')
		expect(text).toContain('| review a \\| diff | stay out | 1 of 3 | pass |')
	})

	it('shows criteria with and without the skill, largest gap first, labeled from Done when', () => {
		const text = md(result, { C2: 'The notes group by label.' })
		expect(text).toContain('| **C2.** The notes group by label. | 3 of 3 | 0 of 3 | pass |')
		expect(text.indexOf('**C2.**')).toBeLessThan(text.indexOf('**C1**'))
		expect(text).toContain('| **C3** | — | — | not-tested: no outcome case that runs tests it |')
	})

	it('leaves the trigger cases out of the outcome cases, and names runs that did not run', () => {
		const text = md(result)
		expect(text).toContain('| `two-prs` | pass |')
		expect(text).not.toContain('| `trigger-1` |')
		expect(text).toContain('Failed to run, and not counted as a pass: `trigger-2 (with-skill, run 1)` (time limit).')
	})

	it('lists a planned skip apart from a run that failed (#327)', () => {
		const text = md({
			...result,
			notRun: [...result.notRun, { case: 'post-it', reason: 'outside effect', kind: 'skipped' }],
		})
		expect(text).toContain('Skipped before running, and not counted as a pass: `post-it` (outside effect).')
		expect(text).not.toContain('`post-it` (outside effect); ')
	})

	it('shows the cost in dollars with the run count, and not the duration', () => {
		expect(md({ ...result, totalRuns: 18 })).toContain('The run cost $1.23 for 18 runs, with the skill and without.')
		expect(md(result)).toContain('The run cost $1.23, with the skill and without.')
		expect(md(result)).not.toMatch(/60000|minute/)
		const { cost: _cost, ...noCost } = result
		expect(md(noCost as TestResult)).not.toMatch(/cost \$/)
	})

	it('says when the baseline could not run, with no gap line', () => {
		const text = md({
			...result,
			baseline: 'Not logged in',
			criteria: [{ id: 'C1', status: 'pass', passed: 3, ran: 3 }],
		})
		expect(text).toContain('with no baseline to compare (Not logged in).')
		expect(text).not.toContain('What the skill adds')
		expect(text).toContain('| **C1** | 3 of 3 | — | pass |')
	})

	it('links skill test where it is told to, and to the docs site by default', () => {
		const report = evalReport('release-notes', result)
		expect(reportMarkdown(report)).toContain(
			'](https://cyber-uni.github.io/cyber-agentkit/packages/cyber-agentkit/skills/skill/)',
		)
		expect(reportMarkdown(report, { testLink: '/docs/skill/' })).toContain('](/docs/skill/)')
	})

	it('shows runs the sandbox broke as sandbox failures, not as skill failures', () => {
		const text = md({
			...result,
			cases: [
				{ case: 'trigger-1', status: 'pass', passed: 2, ran: 2, sandboxFailed: 1 },
				{ case: 'trigger-2', status: 'pass' },
				{ case: 'two-prs', status: 'not-run', sandboxFailed: 3 },
			],
			sandboxFailures: [
				{ case: 'two-prs', arm: 'skill', run: 1, fault: 'bwrap-loopback', text: 'bwrap: loopback' },
				{ case: 'trigger-1', arm: 'baseline', run: 2, fault: 'bwrap-loopback', text: 'bwrap: loopback' },
			],
		})
		expect(text).toContain('| write release notes | fire | 3 of 3 | pass, 1 sandbox failure |')
		expect(text).toContain('| `two-prs` | sandbox failure |')
		expect(text).toContain(
			'Sandbox failure, not counted as a pass or a fail: 2 runs the test sandbox broke rather than the skill: `two-prs` (with the skill, run 1: bwrap-loopback); `trigger-1` (without, run 2: bwrap-loopback).',
		)
		expect(text).not.toMatch(/\| fail \|/)
	})

	it('shows the trend over the kept accepted results, and the cases whose rate moved', () => {
		const older = {
			...result,
			at: '2026-11-01T00:00:00Z',
			cost: 2,
			totalRuns: 30,
			criteria: [{ id: 'C1', status: 'pass', passed: 2, ran: 3, baseline: { passed: 1, ran: 3 } }],
			cases: [{ case: 'two-prs', status: 'pass', passed: 2, ran: 3 }],
		} as TestResult
		const latest = { ...result, cases: [{ case: 'two-prs', status: 'pass', passed: 3, ran: 3 }] } as TestResult
		const text = md(latest, {}, [older, latest])
		expect(text).toContain('### Trend')
		expect(text).toContain('| 2026-11-01 | 2 of 3 | 1 of 3 | $2.00 for 30 runs |')
		expect(text).toContain('| 2026-11-14 | 6 of 6 | 3 of 6 | $1.23 |')
		expect(text).toContain('Cases whose pass rate moved: `two-prs` (2 of 3, then 3 of 3).')
	})

	it('shows no trend with a single accepted result', () => {
		expect(md(result, {}, [result])).not.toContain('### Trend')
	})
})

describe('guard cases in the report (R160)', () => {
	const guarded = {
		...result,
		criteria: [
			{ id: 'C1', status: 'pass', passed: 3, ran: 3, baseline: { passed: 3, ran: 3 }, guard: true },
			{ id: 'C2', status: 'pass', passed: 3, ran: 3, baseline: { passed: 0, ran: 3 } },
		],
		cases: [
			{ case: 'two-prs', status: 'pass', passed: 3, ran: 3 },
			{ case: 'keeps-history', status: 'pass', passed: 3, ran: 3, guard: true, baseline: { passed: 3, ran: 3 } },
			{ case: 'keeps-tags', status: 'fail', passed: 1, ran: 3, guard: true, baseline: { passed: 3, ran: 3 } },
		],
	} as TestResult

	it('shows a pass on both sides of a guard as expected, and a guard that fails with the skill as a fail', () => {
		const text = md(guarded)
		expect(text).toContain('| `keeps-history` | pass, and without the skill, as a guard should |')
		expect(text).toContain('| `keeps-tags` | fail (guard) |')
		expect(text).toContain('| **C1** | 3 of 3 | 3 of 3 | pass, and without the skill, as a guard should |')
		expect(text).toContain('| `two-prs` | pass |')
	})

	it('leaves guard criteria out of the gap, and says so', () => {
		const text = md(guarded)
		expect(text).toMatch(/with the skill, 3 of 3 criterion checks pass; without it, 0 of 3\./)
		expect(text).toContain('The line above leaves out the criteria only guard cases test: C1.')
		expect(evalReport('release-notes', guarded).criteria?.find((c) => c.id === 'C1')?.guard).toBe(true)
	})

	it('says nothing of guards when no case is one', () => {
		expect(md(result)).not.toMatch(/guard/)
	})
})

describe('the model in the report (R161)', () => {
	it('names the model the cases ran on, and each case on its own', () => {
		const modelled = {
			...result,
			model: 'sonnet',
			cases: [
				{ case: 'two-prs', status: 'pass', passed: 3, ran: 3, model: 'opus' },
				{ case: 'one-pr', status: 'pass', passed: 3, ran: 3 },
			],
		} as TestResult
		expect(md(modelled)).toContain('The cases ran on `sonnet`, except `two-prs` on `opus`.')
		expect(evalReport('release-notes', modelled)).toMatchObject({
			model: 'sonnet',
			caseModels: [{ case: 'two-prs', model: 'opus' }],
		})
		expect(md({ ...result, model: 'default' } as TestResult)).toContain("The cases ran on the harness's default model.")
	})

	it('says nothing of a model a result did not record', () => {
		expect(md(result)).not.toContain('ran on')
	})
})

describe('doneWhenCriteria', () => {
	it('reads each criterion and its continuation lines', () => {
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
		expect(doneWhenCriteria(body)).toEqual({ C1: 'First line goes on.', C2: 'Second.' })
	})
})

describe('skill report', () => {
	const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
	const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
	afterEach(() => {
		stdout.mockClear()
		stderr.mockClear()
	})
	const printed = () => stdout.mock.calls.map(([chunk]) => String(chunk)).join('')
	const report = (folder: string, ...extra: string[]) =>
		cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'text' })
			.command(createSkillCommand())
			.parse<number | undefined>(['node', 'cyber-agentkit', 'skill', 'report', folder, ...extra])
			.then((code) => (typeof code === 'number' ? code : 0))

	it('prints Markdown, labeling criteria from the skill’s Done when', async () => {
		const skill = goodSkill({ 'evals/expected.json': JSON.stringify(result) })
		expect(await report(skill.folder)).toBe(0)
		expect(printed()).toMatch(/^## Evals\n\nTested 2026-11-14/)
		expect(printed()).toContain('| **C1.** The notes start with a `## Release notes` heading. |')
		stdout.mockClear()
		await report(skill.folder, '--test-link', '/docs/skill/')
		expect(printed()).toContain('](/docs/skill/)')
	})

	it('prints JSON with --format json, and the trend from evals/accepted', async () => {
		const skill = goodSkill({ 'evals/expected.json': JSON.stringify(result) })
		mkdirSync(join(skill.folder, 'evals', 'accepted'))
		writeFileSync(
			join(skill.folder, 'evals', 'accepted', '2026-11-01T00-00-00Z.json'),
			JSON.stringify({ ...result, at: '2026-11-01T00:00:00Z' }),
		)
		expect(await report(skill.folder, '--format', 'json')).toBe(0)
		const json = JSON.parse(printed())
		expect(json).toMatchObject({ skill: 'release-notes', hasResult: true, gap: { with: { passed: 6, ran: 6 } } })
		expect(json.trend.map((point: { at: string }) => point.at)).toEqual(['2026-11-01T00:00:00Z', result.at])
	})

	it('says plainly when the skill has no accepted result', async () => {
		const skill = goodSkill()
		expect(await report(skill.folder)).toBe(0)
		expect(printed()).toContain('This skill has no saved eval result yet.')
		stdout.mockClear()
		await report(skill.folder, '--format', 'json')
		expect(JSON.parse(printed())).toEqual({ skill: 'release-notes', hasResult: false })
	})

	it('fails on a folder with no SKILL.md, and on an expected.json that is not a result', async () => {
		const skill = goodSkill({ 'evals/expected.json': '{not json' })
		expect(await report(join(skill.folder, 'evals'))).toBe(1)
		expect(await report(skill.folder)).toBe(1)
		expect(stderr.mock.calls.map(([c]) => String(c)).join('')).toMatch(/result-unreadable/)
	})
})
