import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cli } from 'clibuilder'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import {
	type Attestation,
	readAttestations,
	recordAttestation,
	skillFingerprint,
	viewAttestations,
} from './attestation.js'
import { evalReport, readEvalReport, reportMarkdown } from './eval-report.js'
import { attestedLine, createSkillCommand } from './skill.command.js'
import { byId, goodSkill } from './skill-design.fixtures.js'
import { acceptResult, type PromptfooRun } from './skill-test.js'
import type { TestResult } from './test-result.js'
import { checkVerification } from './verification-checks.js'

const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
beforeEach(() => {
	const home = mkdtempSync(join(tmpdir(), 'skill-attest-home-'))
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

/** A skill whose C2 has no rubric: the kind a attested pass is for. */
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
	const root = mkdtempSync(join(tmpdir(), 'skill-attest-repo-'))
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

const attestation = (extra: Partial<Attestation> = {}): Attestation =>
	({
		id: 'C2',
		status: 'pass',
		source: 'attested',
		evidence: url,
		at: '2026-11-20T02:10:00.000Z',
		skillFingerprint: 'x',
		...extra,
	}) as Attestation

describe('skill attest (#323)', () => {
	it('writes a attested pass for a criterion with its evidence, note, author, time and fingerprint, and no run counts', async () => {
		const { folder } = noRubricForC2()
		const code = await skill([
			'attest',
			folder,
			'C2',
			url,
			'--note',
			'held the thread',
			'--by',
			'hwong',
			'--format',
			'text',
		])
		expect(code).toBe(0)
		expect(printed()).toContain(`attested C2 (${url})`)
		const expected = readExpectedFile(folder)
		expect(expected.attested).toEqual([
			{
				id: 'C2',
				status: 'pass',
				source: 'attested',
				evidence: url,
				note: 'held the thread',
				by: 'hwong',
				at: expect.stringMatching(/^\d{4}-\d\d-\d\dT/),
				skillFingerprint: skillFingerprint(folder),
			},
		])
		expect(expected.attested[0]).not.toHaveProperty('passed')
		expect(expected.attested[0]).not.toHaveProperty('ran')
		// A file with no run in it is not a run result: no `at`, so `test` still saves its first passing run.
		expect(expected).not.toHaveProperty('at')
	})

	it('records a case, and a second pass for the same target replaces the first', async () => {
		const { folder } = noRubricForC2()
		expect(await skill(['attest', folder, 'two-prs', url])).toBe(0)
		expect(await skill(['attest', folder, 'two-prs', `${url}2`])).toBe(0)
		expect(await skill(['attest', folder, 'C2', url])).toBe(0)
		expect(readAttestations(folder).map((entry) => [entry.case ?? entry.id, entry.evidence])).toEqual([
			['two-prs', `${url}2`],
			['C2', url],
		])
	})

	it('keeps the run result already in expected.json, and an accepted run keeps the attested passes', async () => {
		const { folder } = noRubricForC2()
		const root = gitRepo()
		expect(await skill(['test', folder, '--root', root, '--accept'])).toBe(0) // C2 is not tested, so only --accept saves it (#322)
		const run = readExpectedFile(folder)
		expect(await skill(['attest', folder, 'C2', url])).toBe(0)
		expect(readExpectedFile(folder)).toEqual({ ...run, attested: [expect.objectContaining({ id: 'C2' })] })
		expect(await skill(['test', folder, '--root', root, '--accept'])).toBe(0)
		const after = readExpectedFile(folder)
		expect(after.at).not.toBe(run.at)
		expect(after.attested).toEqual([expect.objectContaining({ id: 'C2', evidence: url })])
	})

	it('saves the first passing run as expected when the only criterion it does not test is attested', async () => {
		const { folder } = noRubricForC2()
		const root = gitRepo()
		expect(await skill(['attest', folder, 'C2', url])).toBe(0)
		expect(await skill(['test', folder, '--root', root])).toBe(0)
		expect(printed()).toContain('"savedAsExpected":true')
		const expected = readExpectedFile(folder)
		expect(typeof expected.at).toBe('string')
		expect(expected.attested).toHaveLength(1)
		expect(existsSync(join(folder, 'evals', 'accepted'))).toBe(false) // an attested-only file is no past run
	})

	it('exits 0 when the only case is a planned skip covered by an attested pass (#327)', async () => {
		const { folder } = goodSkill({
			'evals/evals.yaml': `outcome:
  - { id: post-it, prompt: post the notes, effects: outside }
rubrics:
  C1:
    - contains: "## Release notes"
`,
		})
		const root = gitRepo()
		expect(await skill(['attest', folder, 'post-it', url])).toBe(0)
		expect(await skill(['test', folder, '--root', root])).toBe(0)
		const report = JSON.parse(printed().slice(printed().lastIndexOf('{"version"')))
		expect(report.notRun).toEqual([expect.objectContaining({ case: 'post-it', kind: 'skipped' })])
		expect(report.attested).toEqual([expect.objectContaining({ case: 'post-it' })])
		expect(report).not.toHaveProperty('savedAsExpected')
	})

	it('does not count a stale attested pass toward saving the first run (#322)', async () => {
		const { folder } = noRubricForC2()
		const root = gitRepo()
		recordAttestation(folder, 'release-notes', attestation({ skillFingerprint: 'old' }))
		expect(await skill(['test', folder, '--root', root])).toBe(0) // not tested is no failure
		expect(printed()).not.toContain('"savedAsExpected":true')
		expect(readExpectedFile(folder)).not.toHaveProperty('at')
	})

	it.each([
		[['C2', 'not a link'], 'attest-evidence'],
		[['C2', 'file:///etc/passwd'], 'attest-evidence'],
		[['C9', url], 'unknown-target'],
		[['nope', url], 'unknown-target'],
	])('refuses %j with %s and writes nothing', async (extra, code) => {
		const { folder } = noRubricForC2()
		expect(await skill(['attest', folder, ...extra])).toBe(2)
		expect(errors()).toContain(`error: ${code}:`)
		expect(existsSync(expectedFile(folder))).toBe(false)
	})

	it('leaves accept to runs: it takes no link', async () => {
		const { folder } = noRubricForC2()
		expect(await skill(['accept', folder, '--live', url])).not.toBe(0)
		expect(existsSync(expectedFile(folder))).toBe(false)
	})
})

describe('a attested pass in skill test (#323)', () => {
	it('shows "attested (link)" beside the run, never as a pass rate', async () => {
		const { folder } = noRubricForC2()
		const root = gitRepo()
		await skill(['attest', folder, 'C2', url, '--note', 'held the thread'])
		expect(await skill(['test', folder, '--root', root, '--format', 'text'])).toBe(0)
		const text = printed()
		expect(text).toContain('C2: not-tested')
		expect(text).toContain(`C2: attested (${url}) — held the thread`)
		expect(text).not.toContain('stale')
	})

	it('marks it stale once SKILL.md or a reference changed, and still shows it', async () => {
		const { folder } = noRubricForC2()
		const root = gitRepo()
		await skill(['attest', folder, 'C2', url])
		mkdirSync(join(folder, 'references'))
		writeFileSync(join(folder, 'references', 'more.md'), '# More\n')
		await skill(['test', folder, '--root', root, '--format', 'text'])
		expect(printed()).toContain(`C2: attested, stale: skill changed since (${url})`)
	})

	it('lets a failing run decide: the test fails, and the attested pass hides nothing', async () => {
		const { folder } = noRubricForC2()
		const root = gitRepo()
		await skill(['attest', folder, 'C1', url])
		expect(await skill(['test', folder, '--root', root, '--format', 'text'], fakeRun(false))).toBe(1)
		const text = printed()
		expect(text).toContain('C1: fail 0 of 3')
		expect(text).toContain(`C1: attested (${url})`)
		expect(text).toContain('this run fails it, and the run decides')
	})

	it('decides changed from the runs alone', () => {
		const result = { criteria: [{ id: 'C1', status: 'pass' }], cases: [] } as unknown as TestResult
		expect(attestedLine(attestation({ id: 'C1' }), result)).not.toContain('the run decides')
	})
})

describe('a attested pass in skill check (#323)', () => {
	it('counts as covered for VER-3 and VER-13, and VER-15 warns it has no rubric', () => {
		const before = byId(checkVerification(noRubricForC2()))
		expect(before['VER-3']).toMatchObject({ status: 'fail', message: expect.stringContaining('C2') })
		expect(before['VER-15']).toEqual({ id: 'VER-15', status: 'pass' })
		const skillFiles = noRubricForC2()
		recordAttestation(
			skillFiles.folder,
			'release-notes',
			attestation({ skillFingerprint: skillFingerprint(skillFiles.folder) }),
		)
		const after = byId(checkVerification(skillFiles))
		expect(after['VER-3']).toEqual({ id: 'VER-3', status: 'pass' })
		expect(after['VER-13']).toEqual({ id: 'VER-13', status: 'pass' })
		expect(after['VER-15']).toEqual({
			id: 'VER-15',
			status: 'fail',
			message: 'C2 attested, no rubric',
			file: 'evals/expected.json',
		})
	})

	it('flags a stale attested pass and one that names no criterion', () => {
		const skillFiles = goodSkill()
		recordAttestation(skillFiles.folder, 'release-notes', attestation({ id: 'C1', skillFingerprint: 'old' }))
		recordAttestation(
			skillFiles.folder,
			'release-notes',
			attestation({ id: 'C9', skillFingerprint: skillFingerprint(skillFiles.folder) }),
		)
		expect(byId(checkVerification(skillFiles))['VER-15']?.message).toBe(
			'attested pass for C9 names no criterion; attested pass for C1 is stale: skill changed since',
		)
	})

	it('the default Verification aspect declares VER-15 as a warning', async () => {
		const { folder } = noRubricForC2()
		recordAttestation(folder, 'release-notes', attestation({ skillFingerprint: skillFingerprint(folder) }))
		await skill(['check', folder, '--format', 'json'])
		const report = JSON.parse(printed()) as { aspects: { aspect: string; checks: { id: string }[] }[] }
		const checks = report.aspects.find((aspect) => aspect.aspect === 'verification')?.checks ?? []
		expect(byId(checks)).toMatchObject({
			'VER-3': { status: 'pass', severity: 'critical' },
			'VER-15': { status: 'fail', severity: 'warning', message: 'C2 attested, no rubric' },
		})
	})
})

describe('a attested pass in skill report (#323)', () => {
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
			evalReport('release-notes', run, { attested: [attestation({ note: 'held | the thread', by: 'hwong' })] }),
		)
		expect(out).toContain(`| **C2** | — | — | not-tested: it has no rubric; attested (${url}) |`)
		expect(out).toContain('### Attested')
		expect(out).toContain(`| **C2** | [attested](${url}) | 2026-11-20 by hwong | held \\| the thread |`)
	})

	it('reports the attested passes of a file that holds no run, and a stale one says so', () => {
		const { folder } = noRubricForC2()
		recordAttestation(folder, 'release-notes', attestation({ skillFingerprint: 'old' }))
		const report = readEvalReport('release-notes', folder, {})
		expect(report).toMatchObject({ hasResult: false, attested: [{ id: 'C2', stale: true }] })
		const out = reportMarkdown(report)
		expect(out).toContain('no saved eval run yet')
		expect(out).toContain('skill changed since')
	})

	it('acceptResult carries the attested passes into the new expected result', () => {
		const { folder } = noRubricForC2()
		recordAttestation(folder, 'release-notes', attestation())
		acceptResult(run, folder)
		expect(readExpectedFile(folder)).toEqual({ ...run, attested: [attestation()] })
		expect(readdirSync(join(folder, 'evals')).includes('accepted')).toBe(false)
	})

	it('viewAttestations marks only the entries whose fingerprint differs', () => {
		expect(
			viewAttestations([attestation({ skillFingerprint: 'a' }), attestation({ id: 'C1', skillFingerprint: 'b' })], 'a'),
		).toEqual([
			attestation({ skillFingerprint: 'a' }),
			{ ...attestation({ id: 'C1', skillFingerprint: 'b' }), stale: true },
		])
	})
})
