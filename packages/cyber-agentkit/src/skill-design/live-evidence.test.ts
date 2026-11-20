import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cli } from 'clibuilder'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { evalReport, readEvalReport, reportMarkdown } from './eval-report.js'
import { type LivePass, readLivePasses, recordLivePass, skillFingerprint, viewLivePasses } from './live-evidence.js'
import { createSkillCommand, liveLine } from './skill.command.js'
import { byId, goodSkill } from './skill-design.fixtures.js'
import { acceptResult, type PromptfooRun } from './skill-test.js'
import type { TestResult } from './test-result.js'
import { checkVerification } from './verification-checks.js'

const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
beforeEach(() => {
	const home = mkdtempSync(join(tmpdir(), 'skill-live-home-'))
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
const url = 'https://gitlab.example.com/group/app/-/merge_requests/58#note_16308023'
const expectedFile = (folder: string) => join(folder, 'evals', 'expected.json')
const readExpectedFile = (folder: string) => JSON.parse(readFileSync(expectedFile(folder), 'utf8'))

/** A skill whose C2 has no rubric: the kind a live pass is for. */
const noRubricForC2 = () =>
	goodSkill({
		'evals/evals.yaml': `trigger:
  - { prompt: write release notes, expect: fire }
  - { prompt: draft the changelog for 2.0, expect: fire }
  - { prompt: what shipped this release, expect: fire }
  - { prompt: summarize this pull request, expect: skip }
  - { prompt: review my diff, expect: skip }
  - { prompt: write a commit message, expect: skip }
outcome:
  - { id: two-prs, prompt: write the notes, files: files/two-prs, criteria: [C1] }
rubrics:
  C1:
    - contains: "## Release notes"
`,
	})

function gitRepo() {
	const root = mkdtempSync(join(tmpdir(), 'skill-live-repo-'))
	mkdirSync(join(root, '.git'))
	return root
}

/** A fake promptfoo whose runs fire and pass every check, or fail them all. */
function fakeRun(pass = true): PromptfooRun {
	return async (folder, config) => {
		const parsed = parse(readFileSync(join(folder, config), 'utf8')) as {
			tests: { description: string; vars: { rubrics: string } }[]
		}
		const results = parsed.tests.flatMap((test) =>
			['with-skill', 'baseline'].flatMap((label) =>
				[0, 1, 2].map((repeatIndex) => {
					const ids = Object.keys(JSON.parse(test.vars.rubrics))
					return {
						provider: { label },
						testCase: { description: test.description },
						repeatIndex,
						response: {
							output: 'x',
							metadata: {
								fired: !/review|commit|summarize/.test(JSON.stringify(test)),
								checks: Object.fromEntries(ids.map((id) => [id, { pass }])),
							},
						},
						gradingResult: { componentResults: ids.map((metric) => ({ pass, assertion: { metric } })) },
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

const live = (extra: Partial<LivePass> = {}): LivePass =>
	({
		id: 'C2',
		status: 'pass',
		source: 'live',
		evidence: url,
		at: '2026-11-20T02:10:00.000Z',
		skillFingerprint: 'x',
		...extra,
	}) as LivePass

describe('skill accept --live (#323)', () => {
	it('writes a live pass for a criterion with its evidence, note, author, time and fingerprint, and no run counts', async () => {
		const { folder } = noRubricForC2()
		const code = await skill([
			'accept',
			folder,
			'--criterion',
			'C2',
			'--live',
			url,
			'--note',
			'held the thread',
			'--by',
			'hwong',
			'--format',
			'text',
		])
		expect(code).toBe(0)
		expect(printed()).toContain(`recorded C2 as verified live (${url})`)
		const expected = readExpectedFile(folder)
		expect(expected.live).toEqual([
			{
				id: 'C2',
				status: 'pass',
				source: 'live',
				evidence: url,
				note: 'held the thread',
				by: 'hwong',
				at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
				skillFingerprint: skillFingerprint(folder),
			},
		])
		expect(expected.live[0]).not.toHaveProperty('passed')
		expect(expected.live[0]).not.toHaveProperty('ran')
		// A file with no run in it is not a run result: no `at`, so `test` still saves its first passing run.
		expect(expected).not.toHaveProperty('at')
	})

	it('records a case, and a second pass for the same target replaces the first', async () => {
		const { folder } = noRubricForC2()
		expect(await skill(['accept', folder, '--case', 'two-prs', '--live', url])).toBe(0)
		expect(await skill(['accept', folder, '--case', 'two-prs', '--live', `${url}2`])).toBe(0)
		expect(await skill(['accept', folder, '--criterion', 'C2', '--live', url])).toBe(0)
		expect(readLivePasses(folder).map((entry) => [entry.case ?? entry.id, entry.evidence])).toEqual([
			['two-prs', `${url}2`],
			['C2', url],
		])
	})

	it('keeps the run result already in expected.json, and an accepted run keeps the live passes', async () => {
		const { folder } = noRubricForC2()
		const root = gitRepo()
		expect(await skill(['test', folder, '--root', root, '--accept'])).toBe(0) // C2 is not tested, so only --accept saves it (#322)
		const run = readExpectedFile(folder)
		expect(await skill(['accept', folder, '--criterion', 'C2', '--live', url])).toBe(0)
		expect(readExpectedFile(folder)).toEqual({ ...run, live: [expect.objectContaining({ id: 'C2' })] })
		expect(await skill(['test', folder, '--root', root, '--accept'])).toBe(0)
		const after = readExpectedFile(folder)
		expect(after.at).not.toBe(run.at)
		expect(after.live).toEqual([expect.objectContaining({ id: 'C2', evidence: url })])
	})

	it('saves the first passing run as expected when the only criterion it does not test is verified live', async () => {
		const { folder } = noRubricForC2()
		const root = gitRepo()
		expect(await skill(['accept', folder, '--criterion', 'C2', '--live', url])).toBe(0)
		expect(await skill(['test', folder, '--root', root])).toBe(0)
		expect(printed()).toContain('"savedAsExpected":true')
		const expected = readExpectedFile(folder)
		expect(typeof expected.at).toBe('string')
		expect(expected.live).toHaveLength(1)
		expect(existsSync(join(folder, 'evals', 'accepted'))).toBe(false) // a live-only file is no past run
	})

	it('does not count a stale live pass toward saving the first run (#322)', async () => {
		const { folder } = noRubricForC2()
		const root = gitRepo()
		recordLivePass(folder, 'release-notes', live({ skillFingerprint: 'old' }))
		expect(await skill(['test', folder, '--root', root])).toBe(0) // not tested is no failure
		expect(printed()).not.toContain('"savedAsExpected":true')
		expect(readExpectedFile(folder)).not.toHaveProperty('at')
	})

	it.each([
		[['--live', url], 'live-target'],
		[['--criterion', 'C2', '--case', 'two-prs', '--live', url], 'live-target'],
		[['--criterion', 'C2', '--live', 'not a link'], 'live-evidence'],
		[['--criterion', 'C2', '--live', 'file:///etc/passwd'], 'live-evidence'],
		[['--criterion', 'C9', '--live', url], 'unknown-criterion'],
		[['--case', 'nope', '--live', url], 'unknown-case'],
		[['--criterion', 'C2'], 'live-missing'],
		[['--note', 'x'], 'live-missing'],
	])('refuses %j with %s and writes nothing', async (extra, code) => {
		const { folder } = noRubricForC2()
		expect(await skill(['accept', folder, ...extra])).toBe(2)
		expect(errors()).toContain(`error: ${code}:`)
		expect(existsSync(expectedFile(folder))).toBe(false)
	})
})

describe('a live pass in skill test (#323)', () => {
	it('shows "verified live (link)" beside the run, never as a pass rate', async () => {
		const { folder } = noRubricForC2()
		const root = gitRepo()
		await skill(['accept', folder, '--criterion', 'C2', '--live', url, '--note', 'held the thread'])
		expect(await skill(['test', folder, '--root', root, '--format', 'text'])).toBe(0)
		const text = printed()
		expect(text).toContain('C2: not-tested')
		expect(text).toContain(`live C2: verified live (${url}) — held the thread`)
		expect(text).not.toContain('stale')
	})

	it('marks it stale once SKILL.md or a reference changed, and still shows it', async () => {
		const { folder } = noRubricForC2()
		const root = gitRepo()
		await skill(['accept', folder, '--criterion', 'C2', '--live', url])
		mkdirSync(join(folder, 'references'))
		writeFileSync(join(folder, 'references', 'more.md'), '# More\n')
		await skill(['test', folder, '--root', root, '--format', 'text'])
		expect(printed()).toContain(`live C2: verified live (${url}), stale: skill changed since`)
	})

	it('lets a failing run decide: the test fails, and the live pass hides nothing', async () => {
		const { folder } = noRubricForC2()
		const root = gitRepo()
		await skill(['accept', folder, '--criterion', 'C1', '--live', url])
		expect(await skill(['test', folder, '--root', root, '--format', 'text'], fakeRun(false))).toBe(1)
		const text = printed()
		expect(text).toContain('C1: fail 0 of 3')
		expect(text).toContain(`live C1: verified live (${url})`)
		expect(text).toContain('this run fails it, and the run decides')
	})

	it('decides changed from the runs alone', () => {
		const result = { criteria: [{ id: 'C1', status: 'pass' }], cases: [] } as unknown as TestResult
		expect(liveLine(live({ id: 'C1' }), result)).not.toContain('the run decides')
	})
})

describe('a live pass in skill check (#323)', () => {
	it('counts as covered for VER-3 and VER-13, and VER-15 warns it has no rubric', () => {
		const before = byId(checkVerification(noRubricForC2()))
		expect(before['VER-3']).toMatchObject({ status: 'fail', message: expect.stringContaining('C2') })
		expect(before['VER-15']).toEqual({ id: 'VER-15', status: 'pass' })
		const skillFiles = noRubricForC2()
		recordLivePass(skillFiles.folder, 'release-notes', live({ skillFingerprint: skillFingerprint(skillFiles.folder) }))
		const after = byId(checkVerification(skillFiles))
		expect(after['VER-3']).toEqual({ id: 'VER-3', status: 'pass' })
		expect(after['VER-13']).toEqual({ id: 'VER-13', status: 'pass' })
		expect(after['VER-15']).toEqual({
			id: 'VER-15',
			status: 'fail',
			message: 'C2 verified live, no rubric',
			file: 'evals/expected.json',
		})
	})

	it('flags a stale live pass and one that names no criterion', () => {
		const skillFiles = goodSkill()
		recordLivePass(skillFiles.folder, 'release-notes', live({ id: 'C1', skillFingerprint: 'old' }))
		recordLivePass(
			skillFiles.folder,
			'release-notes',
			live({ id: 'C9', skillFingerprint: skillFingerprint(skillFiles.folder) }),
		)
		expect(byId(checkVerification(skillFiles))['VER-15']?.message).toBe(
			'live pass for C9 names no criterion; live pass for C1 is stale: skill changed since',
		)
	})

	it('the default Verification aspect declares VER-15 as a warning', async () => {
		const { folder } = noRubricForC2()
		recordLivePass(folder, 'release-notes', live({ skillFingerprint: skillFingerprint(folder) }))
		await skill(['check', folder, '--format', 'json'])
		const report = JSON.parse(printed()) as { aspects: { aspect: string; checks: { id: string }[] }[] }
		const checks = report.aspects.find((aspect) => aspect.aspect === 'verification')?.checks ?? []
		expect(byId(checks)).toMatchObject({
			'VER-3': { status: 'pass', severity: 'critical' },
			'VER-15': { status: 'fail', severity: 'warning', message: 'C2 verified live, no rubric' },
		})
	})
})

describe('a live pass in skill report (#323)', () => {
	const run = {
		version: 1,
		skill: 'release-notes',
		at: '2026-11-14T09:00:00Z',
		verification: 'x',
		runs: 3,
		threshold: 2,
		baseline: 'without the skill',
		trigger: [],
		criteria: [
			{ id: 'C1', status: 'pass', passed: 3, ran: 3 },
			{ id: 'C2', status: 'not-tested', reason: 'it has no rubric' },
		],
		cases: [],
		notRun: [],
	} as unknown as TestResult

	it('shows it beside the criterion and in its own section, with no pass rate', () => {
		const out = reportMarkdown(
			evalReport('release-notes', run, { live: [live({ note: 'held | the thread', by: 'hwong' })] }),
		)
		expect(out).toContain(`| **C2** | — | — | not-tested: it has no rubric; verified live (${url}) |`)
		expect(out).toContain('### Verified live')
		expect(out).toContain(`| **C2** | [verified live](${url}) | 2026-11-20 by hwong | held \\| the thread |`)
	})

	it('reports the live passes of a file that holds no run, and a stale one says so', () => {
		const { folder } = noRubricForC2()
		recordLivePass(folder, 'release-notes', live({ skillFingerprint: 'old' }))
		const report = readEvalReport('release-notes', folder, {})
		expect(report).toMatchObject({ hasResult: false, live: [{ id: 'C2', stale: true }] })
		const out = reportMarkdown(report)
		expect(out).toContain('no saved eval run yet')
		expect(out).toContain('skill changed since')
	})

	it('acceptResult carries the live passes into the new expected result', () => {
		const { folder } = noRubricForC2()
		recordLivePass(folder, 'release-notes', live())
		acceptResult(run, folder)
		expect(readExpectedFile(folder)).toEqual({ ...run, live: [live()] })
		expect(readdirSync(join(folder, 'evals')).includes('accepted')).toBe(false)
	})

	it('viewLivePasses marks only the entries whose fingerprint differs', () => {
		expect(viewLivePasses([live({ skillFingerprint: 'a' }), live({ id: 'C1', skillFingerprint: 'b' })], 'a')).toEqual([
			live({ skillFingerprint: 'a' }),
			{ ...live({ id: 'C1', skillFingerprint: 'b' }), stale: true },
		])
	})
})
