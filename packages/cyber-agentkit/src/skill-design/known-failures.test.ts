import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cli } from 'clibuilder'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { evalReport, reportMarkdown } from './eval-report.js'
import { clearKnownFailure, listKnownFailures, markKnownFailure } from './known-failures.js'
import { createSkillCommand } from './skill.command.js'
import { byId, goodSkill, goodSkillMd, makeSkill } from './skill-design.fixtures.js'
import type { PromptfooRun } from './skill-test.js'
import { planTest } from './test-plan.js'
import { readPromptfooOutput, type TestResult } from './test-result.js'
import { checkVerification, evalsProblems, failsProblems } from './verification-checks.js'

const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
beforeEach(() => {
	const home = mkdtempSync(join(tmpdir(), 'skill-fails-home-'))
	vi.stubEnv('HOME', home)
	vi.stubEnv('USERPROFILE', home)
})
afterEach(() => {
	stdout.mockClear()
	stderr.mockClear()
	vi.unstubAllEnvs()
})
const printed = () => stdout.mock.calls.map(([chunk]) => String(chunk)).join('')
const errors = () => stderr.mock.calls.map(([chunk]) => String(chunk)).join('')
const evalsOf = (folder: string) => readFileSync(join(folder, 'evals', 'evals.yaml'), 'utf8')

const triggers = `# trigger cases
trigger:
  - { prompt: write release notes, expect: fire }
  - { prompt: draft the changelog for 2.0, expect: fire }   # the one the description misses
  - { prompt: what shipped this release, expect: fire }
  - { prompt: summarize this pull request, expect: skip }
  - { prompt: review my diff, expect: skip }
  - { prompt: write a commit message, expect: skip }
`
const rubrics = `rubrics:
  C1:
    - contains: "## Release notes"
  C2:
    - not-regex: "Merge (pull request|branch)"
`
/** A skill whose case two-prs tests C1 and C2, written in block style, with comments. */
const skillWith = (outcome = '') =>
	goodSkill({
		'evals/evals.yaml': `${triggers}outcome:
  - id: two-prs
    prompt: write the notes   # the whole request
    files: files/two-prs
    criteria: [C1, C2]
${outcome}  - { id: one-pr, prompt: write the notes for one PR, files: files/two-prs, criteria: [C1] }
${rubrics}`,
	})

describe('the fails mark in evals.yaml (#329)', () => {
	it('needs a reason: a bare `fails: true` or an empty one is refused', () => {
		expect(evalsProblems({ trigger: [{ prompt: 'x', expect: 'fire', fails: true }] })).toEqual([
			'trigger case 1: `fails` needs the reason it is known to fail, such as a sentence or a link, not true',
		])
		expect(evalsProblems({ trigger: [{ prompt: 'x', expect: 'fire', fails: '  ' }] })).toHaveLength(1)
		expect(evalsProblems({ outcome: [{ id: 'a', prompt: 'x', fails: true }] })[0]).toContain(
			'`fails` is not a mapping of the criteria known to fail',
		)
		expect(evalsProblems({ outcome: [{ id: 'a', prompt: 'x', criteria: ['C3'], fails: { C3: '' } }] })[0]).toContain(
			'`fails` C3 needs the reason',
		)
	})

	it("refuses a criterion the case does not list, and checks a case with no criteria against the skill's", () => {
		expect(evalsProblems({ outcome: [{ id: 'a', prompt: 'x', criteria: ['C2'], fails: { C3: 'why' } }] })).toEqual([
			'outcome case a: `fails` marks C3, which is not one of the criteria the case tests',
		])
		const all = { outcome: [{ id: 'a', prompt: 'x', fails: { C3: 'why' } }] }
		expect(evalsProblems(all)).toEqual([])
		expect(failsProblems(all, ['C1', 'C2'])).toHaveLength(1)
		expect(failsProblems(all, ['C1', 'C3'])).toEqual([])
	})

	it('check: VER-16 warns with every mark, and VER-1 fails on a mark with no reason or an unknown criterion', () => {
		const marked = skillWith('    fails:\n      C2: "keeps merge commits (#341)"\n')
		writeFileSync(
			join(marked.folder, 'evals', 'evals.yaml'),
			evalsOf(marked.folder).replace(
				'expect: fire }   # the one',
				'expect: fire, fails: "description misses changelog (#340)" }   # the one',
			),
		)
		const outcomes = byId(checkVerification(marked))
		expect(outcomes['VER-1']).toEqual({ id: 'VER-1', status: 'pass' })
		expect(outcomes['VER-16']).toEqual({
			id: 'VER-16',
			status: 'fail',
			message:
				'2 marks of a known failure: trigger-2 (description misses changelog (#340)); two-prs C2 (keeps merge commits (#341))',
			file: 'evals/evals.yaml',
		})
		expect(byId(checkVerification(goodSkill()))['VER-16']).toEqual({ id: 'VER-16', status: 'pass' })
		const unknown = makeSkill({
			'SKILL.md': goodSkillMd,
			'evals/evals.yaml': `${triggers}outcome:\n  - { id: two-prs, prompt: x, fails: { C9: why } }\n${rubrics}`,
		})
		expect(byId(checkVerification(unknown))['VER-1']).toMatchObject({
			status: 'fail',
			message: 'outcome case two-prs: `fails` marks C9, which is not one of the criteria the case tests',
		})
		expect(planTest(unknown)).toMatchObject({ code: 'evals-invalid' })
	})

	it('the default Verification aspect declares VER-16 as a warning', async () => {
		const { folder } = skillWith('    fails: { C2: "keeps merge commits" }\n')
		await skill(['check', folder, '--format', 'json'])
		const report = JSON.parse(printed()) as { aspects: { aspect: string; checks: { id: string }[] }[] }
		const checks = report.aspects.find((aspect) => aspect.aspect === 'verification')?.checks ?? []
		expect(byId(checks)).toMatchObject({ 'VER-16': { status: 'fail', severity: 'warning' } })
	})
})

describe('markKnownFailure and clearKnownFailure (#329)', () => {
	it('adds a block `fails` to a block case, keeping every comment and the layout', () => {
		const { folder } = skillWith()
		const before = evalsOf(folder)
		expect(markKnownFailure(folder, { case: 'two-prs', criterion: 'C2' }, 'keeps merge commits (#341)', [])).toEqual({
			evals: join(folder, 'evals', 'evals.yaml'),
			mark: { case: 'two-prs', criterion: 'C2', reason: 'keeps merge commits (#341)' },
		})
		expect(evalsOf(folder)).toBe(
			before.replace(
				'    criteria: [C1, C2]\n',
				'    criteria: [C1, C2]\n    fails:\n      C2: "keeps merge commits (#341)"\n',
			),
		)
		expect(markKnownFailure(folder, { case: 'two-prs', criterion: 'C1' }, 'no heading', [])).toMatchObject({
			mark: { criterion: 'C1' },
		})
		expect(parse(evalsOf(folder)).outcome[0].fails).toEqual({ C2: 'keeps merge commits (#341)', C1: 'no heading' })
		clearKnownFailure(folder, { case: 'two-prs', criterion: 'C2' })
		expect(parse(evalsOf(folder)).outcome[0].fails).toEqual({ C1: 'no heading' })
		// The last mark of a case takes its `fails` with it, leaving the file as it was.
		expect(clearKnownFailure(folder, { case: 'two-prs', criterion: 'C1' })).toMatchObject({
			cleared: [{ case: 'two-prs', criterion: 'C1', reason: 'no heading' }],
		})
		expect(evalsOf(folder)).toBe(before)
	})

	it('marks a trigger case as trigger-<n> in its flow mapping, replaces its reason, and clears it', () => {
		const { folder } = skillWith()
		const before = evalsOf(folder)
		markKnownFailure(folder, { case: 'trigger-2' }, "description misses 'changelog'", [])
		expect(evalsOf(folder)).toBe(
			before.replace(
				'expect: fire }   # the one',
				`expect: fire, fails: "description misses 'changelog'" }   # the one`,
			),
		)
		expect(markKnownFailure(folder, { case: 'trigger-2' }, 'see #340', [])).toMatchObject({
			replaced: "description misses 'changelog'",
		})
		expect(parse(evalsOf(folder)).trigger[1].fails).toBe('see #340')
		expect(clearKnownFailure(folder, { case: 'trigger-2' })).toMatchObject({
			cleared: [{ case: 'trigger-2', reason: 'see #340' }],
		})
		expect(evalsOf(folder)).toBe(before)
	})

	it('marks a trigger case by its own `id`, and the mark stays on it when the cases are reordered (R175)', () => {
		const folder = goodSkill({
			'evals/evals.yaml': `trigger:
  - { id: notes, prompt: write release notes, expect: fire }
  - { id: changelog, prompt: draft the changelog, expect: fire }
`,
		}).folder
		markKnownFailure(folder, { case: 'changelog' }, 'misses changelog', [])
		expect(parse(evalsOf(folder)).trigger[1]).toMatchObject({ id: 'changelog', fails: 'misses changelog' })
		expect(markKnownFailure(folder, { case: 'trigger-2' }, 'x', [])).toMatchObject({ code: 'unknown-case' })
		const [first, second] = evalsOf(folder).split('\n').slice(1, 3)
		writeFileSync(join(folder, 'evals', 'evals.yaml'), `trigger:\n${second}\n${first}\n`)
		expect(listKnownFailures(folder)).toMatchObject({ marks: [{ case: 'changelog', reason: 'misses changelog' }] })
		expect(clearKnownFailure(folder, { case: 'changelog' })).toMatchObject({
			cleared: [{ case: 'changelog', reason: 'misses changelog' }],
		})
	})

	it('edits a flow case in place, and clears every mark of a case when no criterion is named', () => {
		const { folder } = skillWith()
		const before = evalsOf(folder)
		markKnownFailure(folder, { case: 'one-pr' }, 'x', [])
		markKnownFailure(folder, { case: 'one-pr', criterion: 'C1' }, 'no heading', [])
		expect(evalsOf(folder)).toBe(before.replace('criteria: [C1] }', 'criteria: [C1], fails: { C1: "no heading" } }'))
		expect(listKnownFailures(folder)).toMatchObject({
			marks: [{ case: 'one-pr', criterion: 'C1', reason: 'no heading' }],
		})
		clearKnownFailure(folder, { case: 'one-pr' })
		expect(evalsOf(folder)).toBe(before)
	})

	it('refuses what is not a mark, changing nothing', () => {
		const { folder } = skillWith()
		const before = evalsOf(folder)
		expect(markKnownFailure(folder, { case: 'two-prs', criterion: 'C1' }, '  ', [])).toMatchObject({
			code: 'no-reason',
		})
		expect(markKnownFailure(folder, { case: 'two-prs', criterion: 'C3' }, 'x', [])).toMatchObject({
			code: 'bad-criterion',
			problem: 'two-prs does not test C3; it tests C1, C2',
		})
		expect(markKnownFailure(folder, { case: 'two-prs' }, 'x', [])).toMatchObject({ code: 'bad-criterion' })
		expect(markKnownFailure(folder, { case: 'trigger-2', criterion: 'C1' }, 'x', [])).toMatchObject({
			code: 'bad-criterion',
		})
		expect(markKnownFailure(folder, { case: 'trigger-9' }, 'x', [])).toMatchObject({ code: 'unknown-case' })
		expect(markKnownFailure(folder, { case: 'nope', criterion: 'C1' }, 'x', [])).toMatchObject({ code: 'unknown-case' })
		expect(clearKnownFailure(folder, { case: 'two-prs', criterion: 'C1' })).toMatchObject({ code: 'not-marked' })
		expect(clearKnownFailure(folder, { case: 'trigger-1' })).toMatchObject({ code: 'not-marked' })
		expect(evalsOf(folder)).toBe(before)
	})

	it("checks a case with no criteria against the skill's criteria", () => {
		const { folder } = goodSkill()
		expect(markKnownFailure(folder, { case: 'two-prs', criterion: 'C3' }, 'x', ['C1', 'C2'])).toMatchObject({
			code: 'bad-criterion',
		})
		expect(markKnownFailure(folder, { case: 'two-prs', criterion: 'C2' }, 'x', ['C1', 'C2'])).toMatchObject({
			mark: { criterion: 'C2' },
		})
		expect(parse(evalsOf(folder)).outcome[0].fails).toEqual({ C2: 'x' })
	})
})

/** promptfoo output in which each run of a case passes a criterion when `pass(case, id, run)` says so. */
function output(
	plan: Extract<ReturnType<typeof planTest>, { plan: unknown }>['plan'],
	pass: (id: string, criterion: string, run: number) => boolean,
	fired: (id: string) => boolean = () => true,
) {
	const results = plan.cases.flatMap((item) =>
		['with-skill', 'baseline'].flatMap((label) =>
			[0, 1, 2].map((repeatIndex) => {
				const ids = Object.keys(item.rubrics)
				return {
					provider: { label },
					testCase: { description: item.id },
					repeatIndex,
					response: { output: 'x', metadata: { fired: item.expect === 'fire' ? fired(item.id) : false } },
					gradingResult: {
						componentResults: ids.map((metric) => ({
							pass: pass(item.id, metric, repeatIndex),
							assertion: { metric },
						})),
					},
				}
			}),
		),
	)
	return { results: { results } }
}
const meta = { skill: 'release-notes', at: 'now', verification: 'x', baseline: 'without the skill', baselineRan: true }

describe('a known failure in a test result (#329)', () => {
	const planned = () => {
		const skillFiles = skillWith('    fails:\n      C2: "keeps merge commits"\n')
		writeFileSync(
			join(skillFiles.folder, 'evals', 'evals.yaml'),
			evalsOf(skillFiles.folder).replace(
				'expect: fire }   # the one',
				'expect: fire, fails: "misses changelog" }   # the one',
			),
		)
		const plan = planTest(skillFiles)
		if ('problem' in plan) throw new Error(plan.problem)
		return plan.plan
	}

	it('is a known failure below the threshold, apart from passes and failures', () => {
		const plan = planned()
		const result = readPromptfooOutput(
			output(plan, (id, criterion) => !(id === 'two-prs' && criterion === 'C2')),
			plan,
			meta,
		)
		expect(result.trigger[1]).toMatchObject({ case: 'trigger-2', status: 'pass' })
		const failing = readPromptfooOutput(
			output(
				plan,
				(id, criterion) => !(id === 'two-prs' && criterion === 'C2'),
				(id) => id !== 'trigger-2',
			),
			plan,
			meta,
		)
		expect(failing.trigger[1]).toMatchObject({ status: 'known-failure', fired: 0, ran: 3 })
		expect(failing.criteria.find((item) => item.id === 'C2')).toMatchObject({ status: 'known-failure' })
		expect(failing.criteria.find((item) => item.id === 'C2')).not.toHaveProperty('failures')
		expect(failing.cases.find((item) => item.case === 'two-prs')).toMatchObject({ status: 'known-failure' })
		expect(failing.knownFailures).toEqual([
			{ case: 'trigger-2', reason: 'misses changelog', status: 'known-failure', passed: 0, ran: 3 },
			{ case: 'two-prs', criterion: 'C2', reason: 'keeps merge commits', status: 'known-failure', passed: 0, ran: 3 },
		])
	})

	it('is `fixed` at or above the threshold, with the same threshold a pass has', () => {
		const plan = planned()
		const result = readPromptfooOutput(
			output(plan, (_id, _criterion, run) => run < 2),
			plan,
			meta,
		)
		expect(result.knownFailures).toEqual([
			{ case: 'trigger-2', reason: 'misses changelog', status: 'fixed', passed: 3, ran: 3 },
			{ case: 'two-prs', criterion: 'C2', reason: 'keeps merge commits', status: 'fixed', passed: 2, ran: 3 },
		])
		expect(result.criteria.find((item) => item.id === 'C2')).toMatchObject({ status: 'pass' })
	})

	it('leaves the criteria the mark does not name to be judged as usual', () => {
		const plan = planned()
		const result = readPromptfooOutput(
			output(plan, () => false),
			plan,
			meta,
		)
		expect(result.criteria.find((item) => item.id === 'C1')).toMatchObject({ status: 'fail' })
		expect(result.cases.find((item) => item.case === 'two-prs')).toMatchObject({ status: 'fail' })
	})
})

function gitRepo() {
	const root = mkdtempSync(join(tmpdir(), 'skill-fails-repo-'))
	mkdirSync(join(root, '.git'))
	return root
}

/** A fake promptfoo whose runs fire as their prompt says, and pass every check but those `fails(case, id)` names. */
function fakeRun(fails: (id: string, criterion: string) => boolean = () => false): PromptfooRun {
	return async (folder, config) => {
		const parsed = parse(readFileSync(join(folder, config), 'utf8')) as {
			tests: { description: string; vars: { rubrics: string } }[]
		}
		const results = parsed.tests.flatMap((test) =>
			['with-skill', 'baseline'].flatMap((label) =>
				[0, 1, 2].map((repeatIndex) => {
					const ids = Object.keys(JSON.parse(test.vars.rubrics))
					const pass = (id: string) => !fails(test.description, id)
					return {
						provider: { label },
						testCase: { description: test.description },
						repeatIndex,
						response: {
							output: 'x',
							metadata: {
								fired: !/review|commit|summarize/.test(JSON.stringify(test)),
								checks: Object.fromEntries(ids.map((id) => [id, { pass: pass(id) }])),
							},
						},
						gradingResult: { componentResults: ids.map((metric) => ({ pass: pass(metric), assertion: { metric } })) },
					}
				}),
			),
		)
		return { output: { results: { results } } }
	}
}

async function skill(args: string[], run: PromptfooRun = fakeRun()) {
	const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'json' }).command(
		createSkillCommand({
			runPromptfoo: run,
			listPlugins: async (folders) => ({ plugins: folders.map((installPath) => ({ installPath, enabled: true })) }),
			installedPlugins: async () => [],
			plugin: { name: 'cyber-agentkit', root: fileURLToPath(new URL('../..', import.meta.url)) },
		}),
	)
	return app
		.parse<number | undefined>(['node', 'cyber-agentkit', 'skill', ...args])
		.then((code) => (typeof code === 'number' ? code : 0))
}

describe('skill fails (#329)', () => {
	it('lists, adds, replaces, and clears a mark', async () => {
		const { folder } = skillWith()
		expect(await skill(['fails', folder, '--format', 'text'])).toBe(0)
		expect(printed()).toContain('no case of release-notes is marked known to fail')
		expect(await skill(['fails', folder, 'two-prs', 'C2', '--reason', 'keeps merge commits (#341)'])).toBe(0)
		expect(await skill(['fails', folder, 'trigger-2', '--reason', 'misses changelog', '--format', 'text'])).toBe(0)
		expect(printed()).toContain('marked trigger-2 known to fail (misses changelog)')
		stdout.mockClear()
		expect(await skill(['fails', folder, '--format', 'text'])).toBe(0)
		expect(printed()).toContain('2 marks of a known failure')
		expect(printed()).toContain('trigger-2 — misses changelog\ntwo-prs C2 — keeps merge commits (#341)\n')
		expect(await skill(['fails', folder, 'two-prs', 'C2', '--reason', 'see #342', '--format', 'text'])).toBe(0)
		expect(printed()).toContain('replacing its reason (keeps merge commits (#341))')
		expect(await skill(['fails', folder, 'two-prs', 'C2', '--clear'])).toBe(0)
		expect(parse(evalsOf(folder)).outcome[0]).not.toHaveProperty('fails')
	})

	it('refuses a mark with no reason, exit 2, writing nothing', async () => {
		const { folder } = skillWith()
		const before = evalsOf(folder)
		expect(await skill(['fails', folder, 'two-prs', 'C2'])).toBe(2)
		expect(errors()).toContain('error: no-reason:')
		expect(await skill(['fails', folder, 'two-prs', 'C2', '--reason', ''])).toBe(2)
		expect(await skill(['fails', folder, 'two-prs', 'C9', '--reason', 'x'])).toBe(2)
		expect(errors()).toContain('error: bad-criterion:')
		expect(evalsOf(folder)).toBe(before)
	})
})

/** The case IDs a skill's expected result has entries for; none when it has no file. */
const readExpectedEntries = (folder: string): string[] =>
	existsSync(join(folder, 'evals', 'expected.json'))
		? Object.keys(JSON.parse(readFileSync(join(folder, 'evals', 'expected.json'), 'utf8')).entries ?? {})
		: []

describe('a known failure in skill test (#329)', () => {
	it('exits 0 on a known failure, reports it apart, and never saves it as the first expected result', async () => {
		const { folder } = skillWith('    fails:\n      C2: "keeps merge commits (#341)"\n')
		const root = gitRepo()
		const code = await skill(
			['test', folder, '--root', root, '--format', 'text'],
			fakeRun((id, criterion) => id === 'two-prs' && criterion === 'C2'),
		)
		expect(code).toBe(0)
		const text = printed()
		expect(text).toContain('C2: known failure 0 of 3, baseline 0 of 3')
		expect(text).toContain('known failure: two-prs C2 0 of 3 — keeps merge commits (#341)')
		expect(text).toContain(
			'no expected entry for two-prs: it is known to fail; run `skill accept` on the skill to accept it anyway',
		)
		expect(readExpectedEntries(folder)).not.toContain('two-prs')
	})

	it('exits 1 on a mark the run passed, with the command that clears it', async () => {
		const { folder } = skillWith('    fails:\n      C2: "keeps merge commits (#341)"\n')
		const root = gitRepo()
		expect(await skill(['test', folder, '--root', root, '--format', 'text'])).toBe(1)
		const text = printed()
		expect(text).toContain(
			`fixed? remove the mark: two-prs C2 passed 3 of 3, marked known to fail (keeps merge commits (#341)); clear it with \`cyber-agentkit skill fails ${folder} two-prs C2 --clear\``,
		)
		expect(text).toContain('no expected entry for two-prs: its known-failure mark is out of date; clear it first')
		expect(readExpectedEntries(folder)).not.toContain('two-prs')
	})

	it('still fails on a failure the mark does not name', async () => {
		const { folder } = skillWith('    fails:\n      C2: "keeps merge commits"\n')
		const root = gitRepo()
		expect(
			await skill(
				['test', folder, '--root', root, '--format', 'text'],
				fakeRun((_id, criterion) => criterion === 'C1'),
			),
		).toBe(1)
		expect(printed()).toContain('C1: fail')
	})
})

describe('a known failure in skill report (#329)', () => {
	const run = {
		version: 1,
		skill: 'release-notes',
		at: '2026-11-14T09:00:00Z',
		verification: 'x',
		runs: 3,
		threshold: 2,
		baseline: 'without the skill',
		trigger: [
			{ case: 'trigger-2', prompt: 'draft the changelog', expect: 'fire', fired: 0, ran: 3, status: 'known-failure' },
		],
		criteria: [
			{ id: 'C1', status: 'pass', passed: 3, ran: 3, baseline: { passed: 0, ran: 3 } },
			{ id: 'C2', status: 'known-failure', passed: 0, ran: 3, baseline: { passed: 0, ran: 3 } },
		],
		cases: [
			{ case: 'trigger-2', status: 'known-failure', passed: 0, ran: 3 },
			{ case: 'two-prs', status: 'known-failure', passed: 0, ran: 3 },
		],
		knownFailures: [
			{ case: 'trigger-2', reason: 'misses changelog', status: 'known-failure', passed: 0, ran: 3 },
			{ case: 'two-prs', criterion: 'C2', reason: 'keeps merge commits', status: 'known-failure', passed: 0, ran: 3 },
		],
		notRun: [],
	} as unknown as TestResult

	it('shows `known failure (<reason>)`, never a pass rate, and lists the marks', () => {
		const report = evalReport('release-notes', run)
		expect(report.trigger?.[0]?.result).toBe('known failure (misses changelog)')
		expect(report.criteria?.find((c) => c.id === 'C2')?.result).toBe('known failure (keeps merge commits)')
		expect(report.cases?.[0]?.result).toBe('known failure (keeps merge commits)')
		// The gap over the baseline leaves the known failure out.
		expect(report.gap).toEqual({ with: { passed: 3, ran: 3 }, without: { passed: 0, ran: 3 } })
		const markdown = reportMarkdown(report)
		expect(markdown).toContain('| draft the changelog | fire | — | known failure (misses changelog) |')
		expect(markdown).toContain('| **C2** | — | — | known failure (keeps merge commits) |')
		expect(markdown).toContain('### Known failures')
		expect(markdown).toContain('| `two-prs` | **C2** | keeps merge commits | known failure |')
	})
})
