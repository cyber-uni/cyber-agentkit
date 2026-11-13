import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cli } from 'clibuilder'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import type { PromptfooRun } from '../skill-design/skill-test.js'
import { createInstructionCommand } from './instruction.command.js'

const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
let fakeHome = ''
beforeEach(() => {
	fakeHome = mkdtempSync(join(tmpdir(), 'instruction-home-'))
	vi.stubEnv('HOME', fakeHome)
	vi.stubEnv('USERPROFILE', fakeHome)
})
afterEach(() => {
	stdout.mockClear()
	stderr.mockClear()
	vi.unstubAllEnvs()
})
const printed = () => stdout.mock.calls.map(([chunk]) => String(chunk)).join('')
const errors = () => stderr.mock.calls.map(([chunk]) => String(chunk)).join('')

const casesYaml = `runs: 3
threshold: 2
criteria:
  C1: The change is committed.
  C2: The commit message is a Conventional Commit.
outcome:
  - id: one-fix
    prompt: Fix the typo in notes.txt.
    files: files/repo
    checks:
      C1:
        - script: test -z "$(git status --porcelain)"
      C2:
        - script: git log -1 --format=%s | grep -E '^fix:'
`

/** A repository holding AGENTS.md with a Commit Discipline section, a draft wording, and the default cases file. */
function repo(cases: string | null = casesYaml): string {
	const root = mkdtempSync(join(tmpdir(), 'instruction-repo-'))
	mkdirSync(join(root, '.git'))
	writeFileSync(join(root, 'AGENTS.md'), '# AGENTS.md\n\n## Commit Discipline\n\nCommit each unit.\n\n## Other\n\nx\n')
	writeFileSync(join(root, 'draft.md'), '## Commit Discipline\n\nCommit when a unit is done, as `fix:` or `feat:`.\n')
	if (cases !== null) {
		const dir = join(root, '.agents', 'instruction-design', 'cases')
		mkdirSync(join(dir, 'files', 'repo'), { recursive: true })
		writeFileSync(join(dir, 'files', 'repo', 'notes.txt'), 'teh\n')
		writeFileSync(join(dir, 'commit-discipline.yaml'), cases)
	}
	return root
}

/** A fake promptfoo: arm A passes C1 in every run and C2 in one; arm B passes both in every run. */
function fakeRun(seen: { config?: Record<string, any> }): PromptfooRun {
	return async (folder, config) => {
		const parsed: Record<string, any> = parse(readFileSync(join(folder, config), 'utf8'))
		seen.config = parsed
		const tests = parsed['tests'] as { description: string; vars: { rubrics: string } }[]
		const results = tests.flatMap((test) =>
			['A', 'B'].flatMap((label) =>
				[0, 1, 2].map((repeatIndex) => {
					const ids = Object.keys(JSON.parse(test.vars.rubrics))
					const pass = (id: string) => label === 'B' || id === 'C1' || repeatIndex === 0
					return {
						provider: { label },
						testCase: { description: test.description, vars: { kind: 'outcome' } },
						repeatIndex,
						cost: 0.01,
						response: {
							output: `reply ${label}`,
							metadata: { checks: Object.fromEntries(ids.map((id) => [id, { pass: pass(id) }])) },
						},
						gradingResult: { componentResults: ids.map((metric) => ({ pass: pass(metric), assertion: { metric } })) },
					}
				}),
			),
		)
		return { output: { results: { results } } }
	}
}

async function compare(root: string, run: PromptfooRun, ...extra: string[]) {
	const app = cli({ name: 'cyber-agentkit', version: '0.0.0', description: 'x', format: 'json' }).command(
		createInstructionCommand({ runPromptfoo: run, threads: 8 }),
	)
	const cwd = process.cwd()
	process.chdir(root)
	try {
		return await app
			.parse<number | undefined>([
				'node',
				'cyber-agentkit',
				'instruction',
				'compare',
				...extra,
				'--root',
				root,
				'--format',
				'json',
			])
			.then((code) => (typeof code === 'number' ? code : 0))
	} catch (error) {
		return (error as { code?: number }).code ?? 1
	} finally {
		process.chdir(cwd)
	}
}

describe('instruction compare', () => {
	it('runs both wordings over the same cases, each as the project instruction file, and reports per-criterion pass rates and the winner', async () => {
		const root = repo()
		const seen: { config?: Record<string, any> } = {}
		expect(await compare(root, fakeRun(seen), 'AGENTS.md#Commit Discipline', 'draft.md')).toBe(0)
		const providers = seen.config?.['providers'] as { label: string; config: Record<string, any> }[]
		expect(providers.map((p) => p.label)).toEqual(['A', 'B'])
		expect(providers[0]?.config['instruction']).toBe('## Commit Discipline\n\nCommit each unit.\n')
		expect(providers[1]?.config['instruction']).toContain('as `fix:` or `feat:`')
		expect(providers[0]?.config['skillDir']).toBeUndefined()
		expect(seen.config?.['tests']).toHaveLength(1)
		expect(seen.config?.['evaluateOptions']).toMatchObject({ repeat: 3 })

		const result = JSON.parse(printed())
		expect(result).toMatchObject({
			instruction: 'commit-discipline',
			runs: 3,
			threshold: 2,
			wordings: { A: { source: 'AGENTS.md#Commit Discipline' }, B: { source: 'draft.md' } },
			criteria: [
				{
					id: 'C1',
					statement: 'The change is committed.',
					A: { passed: 3, ran: 3, status: 'pass' },
					B: { passed: 3, ran: 3 },
					winner: 'tie',
				},
				{ id: 'C2', A: { passed: 1, ran: 3, status: 'fail' }, B: { passed: 3, ran: 3, status: 'pass' }, winner: 'B' },
			],
			caseStatus: [{ case: 'one-fix', A: 'fail', B: 'pass' }],
			winner: 'B',
			score: { A: 0, B: 1, tie: 1 },
			totalRuns: 6,
			cost: 0.06,
		})
		expect(result.criteria[1].failures.A).toHaveLength(2)
	})

	it('saves the result as a skill test result is saved: latest.json, the previous one beside it, replies, and a git-ignored folder', async () => {
		const root = repo()
		await compare(root, fakeRun({}), 'AGENTS.md#Commit Discipline', 'draft.md')
		await compare(root, fakeRun({}), 'AGENTS.md#Commit Discipline', 'draft.md')
		const folder = join(root, '.agents', 'instruction-design', 'results', 'commit-discipline')
		const latest = JSON.parse(readFileSync(join(folder, 'latest.json'), 'utf8'))
		expect(latest.replies).toMatch(/\.replies\.json$/)
		const replies = JSON.parse(readFileSync(join(folder, latest.replies), 'utf8'))
		expect(replies.map((reply: { arm: string }) => reply.arm)).toEqual(['A', 'A', 'A', 'B', 'B', 'B'])
		expect(readdirSync(folder).filter((name) => !name.endsWith('.replies.json'))).toHaveLength(2)
		expect(readFileSync(join(folder, '..', '.gitignore'), 'utf8')).toBe('*\n')
		expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toContain('Commit each unit.')
	})

	it('states the run count with --plan, and starts no run', async () => {
		const root = repo()
		let ran = false
		const code = await compare(
			root,
			async () => {
				ran = true
				return { problem: 'should not run' }
			},
			'AGENTS.md#Commit Discipline',
			'draft.md',
			'--plan',
			'--runs',
			'5',
		)
		expect(code).toBe(0)
		expect(ran).toBe(false)
		expect(JSON.parse(printed())).toMatchObject({ totalRuns: 10, caseCount: 1, runs: 5 })
	})

	it('names a missing section, and runs nothing', async () => {
		const root = repo()
		let ran = false
		const code = await compare(
			root,
			async () => {
				ran = true
				return { problem: 'x' }
			},
			'AGENTS.md#Delegation',
			'draft.md',
		)
		expect(code).toBe(1)
		expect(ran).toBe(false)
		expect(errors()).toContain('error: section-missing: AGENTS.md has no heading Delegation')
	})

	it('says where it looked when there is no cases file', async () => {
		const root = repo(null)
		expect(await compare(root, fakeRun({}), 'AGENTS.md#Commit Discipline', 'draft.md')).toBe(1)
		expect(errors()).toMatch(
			/error: no-cases: no cases file at .*\.agents\/instruction-design\/cases\/commit-discipline\.yaml/,
		)
	})

	it('takes a named cases file, and refuses trigger cases and unlisted criteria', async () => {
		const root = repo()
		const path = join(root, 'cases.yaml')
		writeFileSync(path, `${casesYaml}trigger:\n  - { prompt: x, expect: fire }\n`)
		expect(await compare(root, fakeRun({}), 'AGENTS.md#Commit Discipline', 'draft.md', '--cases', path)).toBe(1)
		expect(errors()).toContain('an instruction does not fire')
		writeFileSync(path, casesYaml.replace('C2:\n        - script', 'C9:\n        - script'))
		expect(await compare(root, fakeRun({}), 'AGENTS.md#Commit Discipline', 'draft.md', '--cases', path)).toBe(1)
		expect(errors()).toContain('names criterion C9, which `criteria` does not list')
	})
})
