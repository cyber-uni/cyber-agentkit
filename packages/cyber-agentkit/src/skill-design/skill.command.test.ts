import {
	chmodSync,
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	symlinkSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { run } from '../cli.js'
import { goodSkill, goodSkillMd, makeSkill } from './skill-design.fixtures.js'

const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)

afterEach(() => {
	stdout.mockClear()
	stderr.mockClear()
	process.exitCode = undefined
})

const printed = () => stdout.mock.calls.map(([chunk]) => String(chunk)).join('')
const check = (folder: string, ...rest: string[]) =>
	run(['node', 'cyber-agentkit', 'skill', 'check', folder, '--format', 'json', ...rest])
const longBody = (md: string) => md.replace('## Done when', `${'line\n'.repeat(500)}\n## Done when`)

describe('skill check', () => {
	it('exits 0 when no check it ran fails, and reports the rest as not checked', async () => {
		const code = await check(goodSkill().folder)
		const report = JSON.parse(printed())
		expect(code).toBe(0)
		expect(report).toMatchObject({ skill: 'release-notes', failed: 0, status: 'not-checked' })
		expect(report.aspects.map((aspect: { aspect: string }) => aspect.aspect)).toEqual([
			'specification',
			'intent',
			'shape',
			'trigger',
			'criteria',
			'verification',
			'research',
			'security',
		])
	})

	it('exits 1 and names the failing check when one fails, still checking every aspect', async () => {
		const md = goodSkillMd.replace('name: release-notes', 'name: Wrong')
		const code = await check(makeSkill({ 'SKILL.md': md }).folder)
		const report = JSON.parse(printed())
		expect(code).toBe(1)
		expect(report.aspects[0].checks).toContainEqual(expect.objectContaining({ id: 'SPEC-2', status: 'fail' }))
		expect(report.aspects).toHaveLength(8)
	})

	it('reports each failure with its severity, and exits 0 on warnings under the default policy', async () => {
		const code = await check(goodSkill({ 'SKILL.md': longBody(goodSkillMd) }).folder)
		const report = JSON.parse(printed())
		expect(code).toBe(0)
		expect(report).toMatchObject({ failed: 1, critical: 0 })
		expect(report.aspects[2].checks).toContainEqual(
			expect.objectContaining({ id: 'SHP-1', status: 'fail', severity: 'warning' }),
		)
	})

	it('exits 1 on a warning with --fail-on any, and on a critical failure under either policy', async () => {
		expect(await check(goodSkill({ 'SKILL.md': longBody(goodSkillMd) }).folder, '--fail-on', 'any')).toBe(1)
		const md = longBody(goodSkillMd.replace('name: release-notes', 'name: Wrong'))
		expect(await check(goodSkill({ 'SKILL.md': md }).folder)).toBe(1)
		expect(await check(goodSkill({ 'SKILL.md': md }).folder, '--fail-on', 'critical')).toBe(1)
	})

	it('shows the severity of each failure in the text report', async () => {
		await run([
			'node',
			'cyber-agentkit',
			'skill',
			'check',
			goodSkill({ 'SKILL.md': longBody(goodSkillMd) }).folder,
			'--format',
			'text',
		])
		expect(printed()).toContain('1 failed of which 0 critical')
		expect(printed()).toMatch(/SHP-1 fail \(warning\): the body is \d+ lines/)
	})

	it('rejects a --fail-on it does not know', async () => {
		const code = await check(goodSkill().folder, '--fail-on', 'some')
		expect(code).not.toBe(0)
		expect(stderr.mock.calls.join('')).toContain('unknown-fail-on: no --fail-on some; use any or critical')
	})

	it('skips TRG-1, TRG-4, TRG-7, TRG-9, and TRG-10 on a name-only skill and checks the form of its description (R140)', async () => {
		const md = goodSkillMd.replace(/^description: .*$/m, 'description: By name only')
		const code = await check(goodSkill({ 'SKILL.md': md }).folder)
		const report = JSON.parse(printed())
		const trigger = report.aspects.find((aspect: { aspect: string }) => aspect.aspect === 'trigger')
		expect(code).toBe(0)
		expect(trigger.checks).toEqual([
			{ id: 'TRG-1', status: 'skipped', severity: 'critical', message: 'the skill is name-only' },
			{
				id: 'TRG-3',
				status: 'not-checked',
				severity: 'warning',
				message: 'an agent decides it by reading the skill',
				needs: 'check',
			},
			{ id: 'TRG-4', status: 'skipped', severity: 'critical', message: 'the skill is name-only' },
			{ id: 'TRG-5', status: 'pass', severity: 'critical' },
			{
				id: 'TRG-6',
				status: 'not-checked',
				severity: 'warning',
				message: 'an agent decides it by reading the skill',
				needs: 'check',
			},
			{ id: 'TRG-7', status: 'skipped', severity: 'warning', message: 'the skill is name-only' },
			{
				id: 'TRG-8',
				status: 'not-checked',
				severity: 'warning',
				message: 'an agent decides it by reading the skill',
				needs: 'check',
			},
			{ id: 'TRG-9', status: 'skipped', severity: 'warning', message: 'the skill is name-only' },
			{ id: 'TRG-10', status: 'skipped', severity: 'warning', message: 'the skill is name-only' },
		])
		expect(report.skipped).toBe(5)
	})

	it('skips TRG-5 and TRG-6 on a skill that is not name-only, and checks TRG-7, TRG-9, and TRG-10', async () => {
		await check(goodSkill().folder)
		const trigger = JSON.parse(printed()).aspects.find((aspect: { aspect: string }) => aspect.aspect === 'trigger')
		expect(trigger.checks.slice(3)).toEqual([
			{ id: 'TRG-5', status: 'skipped', severity: 'critical', message: 'the skill is not name-only' },
			{ id: 'TRG-6', status: 'skipped', severity: 'warning', message: 'the skill is not name-only' },
			{ id: 'TRG-7', status: 'pass', severity: 'warning' },
			{
				id: 'TRG-8',
				status: 'not-checked',
				severity: 'warning',
				message: 'an agent decides it by reading the skill',
				needs: 'check',
			},
			{ id: 'TRG-9', status: 'pass', severity: 'warning' },
			{ id: 'TRG-10', status: 'pass', severity: 'warning' },
		])
	})

	it('stops and names the folder when it holds no SKILL.md', async () => {
		const code = await check('/nonexistent/skill')
		expect(code).toBe(1)
		expect(printed()).toBe('')
		expect(stderr.mock.calls.join('')).toContain('skill-missing: no SKILL.md in /nonexistent/skill')
	})
})

describe('skill where', () => {
	it("gives a skill's folder from its name, for the commands that take a folder", async () => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), 'skill-where-')))
		mkdirSync(join(root, '.git'))
		mkdirSync(join(root, 'skills', 'probe'), { recursive: true })
		cpSync(goodSkill().folder, join(root, 'skills', 'probe'), { recursive: true })
		const code = await run([
			'node',
			'cyber-agentkit',
			'skill',
			'where',
			'release-notes',
			'--root',
			root,
			'--format',
			'json',
		])
		expect(code).toBe(0)
		expect(JSON.parse(printed())).toEqual({ name: 'release-notes', folder: join(root, 'skills', 'probe') })
	})

	it('fails as a usage error when no skill has the name', async () => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), 'skill-where-')))
		mkdirSync(join(root, '.git'))
		const code = await run(['node', 'cyber-agentkit', 'skill', 'where', 'no-such-skill-here', '--root', root])
		expect(code).toBe(2)
		expect(stderr.mock.calls.join('')).toContain('skill-not-found')
	})
})

describe('skill doctor', () => {
	const loadLine = 'Load `triage.rules` with the `reference` skill of `cyber-agentkit`.'
	const repoWith = (folder: string, defaults = true) => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), 'skill-doctor-')))
		mkdirSync(join(root, '.git'))
		const dir = join(root, folder, 'triage')
		mkdirSync(join(dir, 'references'), { recursive: true })
		writeFileSync(join(dir, 'SKILL.md'), `---\nname: triage\ndescription: a skill\n---\n\n# Triage\n\n${loadLine}\n`)
		if (defaults) writeFileSync(join(dir, 'references', 'triage.rules.default.md'), '## Rules\n\nTriage.\n')
		return { root, dir }
	}
	/** Clears every harness signal the test runner itself may carry, so the running harness is what a test sets. */
	const noHarness = () => {
		for (const key of Object.keys(process.env))
			if (/^(CLAUDE|CODEX|CURSOR|COPILOT|OPENCODE|KILO|GEMINI|QWEN|CLINE|CRUSH|OPENHANDS|AUGMENT|AI_AGENT)/.test(key))
				vi.stubEnv(key, undefined)
	}
	const inClaudeCode = () => {
		noHarness()
		vi.stubEnv('CLAUDECODE', '1')
		vi.stubEnv('CLAUDE_CODE_SESSION_ID', 'session')
	}
	/** A PATH holding a stand-in for each harness command named, and the system folders git runs from. */
	const pathWith = (...commands: string[]) => {
		const bin = realpathSync(mkdtempSync(join(tmpdir(), 'skill-doctor-bin-')))
		for (const name of commands) {
			writeFileSync(join(bin, name), '#!/bin/sh\n')
			chmodSync(join(bin, name), 0o755)
		}
		vi.stubEnv('PATH', [bin, '/usr/bin', '/bin'].join(':'))
	}
	afterEach(() => vi.unstubAllEnvs())

	it("examines a named skill's references for the running harness and exits 0 when they pass", async () => {
		inClaudeCode()
		const { root, dir } = repoWith('skills')
		const code = await run(['node', 'cyber-agentkit', 'skill', 'doctor', 'triage', '--root', root, '--format', 'json'])
		expect(code).toBe(0)
		const report = JSON.parse(printed())
		expect(report).toMatchObject({ status: 'passed', running: 'claude-code' })
		expect(report.harnesses).toEqual([
			expect.objectContaining({
				harness: 'claude-code',
				source: 'running',
				status: 'passed',
				skills: [
					expect.objectContaining({
						skill: 'triage',
						folder: dir,
						references: [expect.objectContaining({ name: 'triage.rules', answeredBy: ['default'] })],
					}),
				],
			}),
		])
	})

	it('says when no harness is detected and reads only the harness-neutral files', async () => {
		noHarness()
		const { root, dir } = repoWith('skills')
		mkdirSync(join(dir, 'agents'))
		writeFileSync(join(dir, 'agents', 'openai.yaml'), 'interface: [unclosed\n')
		const code = await run(['node', 'cyber-agentkit', 'skill', 'doctor', 'triage', '--root', root, '--format', 'text'])
		expect(code).toBe(0)
		expect(printed()).toContain('harness unknown: no harness is detected running here')
		expect(printed()).toContain('agents/openai.yaml is read by Codex, which is not checked here')
		expect(printed()).not.toContain('codex-metadata-invalid')
	})

	it('exits 1 when a reference fails, and says what to do in text', async () => {
		inClaudeCode()
		const { root } = repoWith('skills', false)
		const code = await run(['node', 'cyber-agentkit', 'skill', 'doctor', 'triage', '--root', root, '--format', 'text'])
		expect(code).toBe(1)
		expect(printed()).toContain('triage.rules: missing, answered by no tier')
		expect(printed()).toContain('reference create triage.rules')
	})

	it('examines every skill the running harness loads when none is named', async () => {
		const { root, dir } = repoWith('.claude/skills')
		inClaudeCode()
		vi.stubEnv('HOME', realpathSync(mkdtempSync(join(tmpdir(), 'skill-doctor-home-'))))
		const cwd = process.cwd()
		process.chdir(root)
		try {
			const code = await run(['node', 'cyber-agentkit', 'skill', 'doctor', '--root', root, '--format', 'json'])
			expect(code).toBe(0)
			const [section] = JSON.parse(printed()).harnesses
			expect(section.skills).toContainEqual(expect.objectContaining({ skill: 'triage', folder: dir }))
		} finally {
			process.chdir(cwd)
		}
	})

	it('checks the running harness only by default, even when another is installed', async () => {
		inClaudeCode()
		pathWith('codex')
		const { root } = repoWith('skills')
		const code = await run(['node', 'cyber-agentkit', 'skill', 'doctor', 'triage', '--root', root, '--format', 'json'])
		expect(code).toBe(0)
		expect(JSON.parse(printed()).harnesses.map(({ harness }: { harness: string }) => harness)).toEqual(['claude-code'])
	})

	it('with --all-harnesses, reports per harness and reads agents/openai.yaml for Codex', async () => {
		inClaudeCode()
		pathWith('codex')
		vi.stubEnv('HOME', realpathSync(mkdtempSync(join(tmpdir(), 'skill-doctor-home-'))))
		const { root, dir } = repoWith('skills')
		mkdirSync(join(dir, 'agents'))
		writeFileSync(join(dir, 'agents', 'openai.yaml'), 'interface:\n  icon_small: logo.svg\n')
		const args = ['node', 'cyber-agentkit', 'skill', 'doctor', 'triage', '--root', root, '--all-harnesses']
		expect(await run([...args, '--format', 'json'])).toBe(0)
		const report = JSON.parse(printed())
		expect(report.status).toBe('warned')
		expect(
			report.harnesses.map(({ harness, source, status }: Record<string, string>) => [harness, source, status]),
		).toEqual([
			['claude-code', 'running', 'passed'],
			['codex', 'installed', 'warned'],
		])
		expect(report.harnesses[1].skills[0].warnings).toEqual([expect.objectContaining({ code: 'codex-icon-ignored' })])
		stdout.mockClear()
		expect(await run([...args, '--format', 'text'])).toBe(0)
		expect(printed()).toContain('== claude-code (detected: running)')
		expect(printed()).toContain('== codex (detected: installed)')
		expect(printed()).toContain('warning codex-icon-ignored')
	})

	it('with --all-harnesses, checks a declared harness with no detection signal, and marks it declared', async () => {
		noHarness()
		pathWith()
		const home = realpathSync(mkdtempSync(join(tmpdir(), 'skill-doctor-home-')))
		vi.stubEnv('HOME', home)
		vi.stubEnv('USERPROFILE', home)
		const { root } = repoWith('skills')
		const declare = ['node', 'cyber-agentkit', 'harness', 'add', 'vscode-copilot', '--scope', 'user', '--root', root]
		expect(await run(declare)).toBe(0)
		stdout.mockClear()
		const args = ['node', 'cyber-agentkit', 'skill', 'doctor', 'triage', '--root', root, '--all-harnesses']
		expect(await run([...args, '--format', 'json'])).toBe(0)
		const report = JSON.parse(printed())
		expect(report.running).toBe('unknown')
		expect(report.harnesses).toEqual([
			expect.objectContaining({
				harness: 'vscode-copilot',
				source: 'declared',
				sources: ['declared'],
				status: 'passed',
				skills: [expect.objectContaining({ skill: 'triage' })],
			}),
		])
		stdout.mockClear()
		expect(await run([...args, '--format', 'text'])).toBe(0)
		expect(printed()).toContain('== vscode-copilot (declared)')
	})

	it('marks a harness both detected and declared with both', async () => {
		inClaudeCode()
		pathWith()
		const home = realpathSync(mkdtempSync(join(tmpdir(), 'skill-doctor-home-')))
		vi.stubEnv('HOME', home)
		const { root } = repoWith('skills')
		expect(await run(['node', 'cyber-agentkit', 'harness', 'add', 'claude-code', '--root', root])).toBe(0)
		stdout.mockClear()
		const args = ['node', 'cyber-agentkit', 'skill', 'doctor', 'triage', '--root', root, '--all-harnesses']
		expect(await run([...args, '--format', 'text'])).toBe(0)
		expect(printed()).toContain('== claude-code (detected: running; declared)')
	})

	it('with --all-harnesses, checks a declared harness with no detection signal, and marks it declared', async () => {
		noHarness()
		pathWith()
		const home = realpathSync(mkdtempSync(join(tmpdir(), 'skill-doctor-home-')))
		vi.stubEnv('HOME', home)
		vi.stubEnv('USERPROFILE', home)
		const { root } = repoWith('skills')
		const declare = ['node', 'cyber-agentkit', 'harness', 'add', 'vscode-copilot', '--scope', 'user', '--root', root]
		expect(await run(declare)).toBe(0)
		stdout.mockClear()
		const args = ['node', 'cyber-agentkit', 'skill', 'doctor', 'triage', '--root', root, '--all-harnesses']
		expect(await run([...args, '--format', 'json'])).toBe(0)
		const report = JSON.parse(printed())
		expect(report.running).toBe('unknown')
		expect(report.harnesses).toEqual([
			expect.objectContaining({
				harness: 'vscode-copilot',
				source: 'declared',
				sources: ['declared'],
				status: 'passed',
				skills: [expect.objectContaining({ skill: 'triage' })],
			}),
		])
		stdout.mockClear()
		expect(await run([...args, '--format', 'text'])).toBe(0)
		expect(printed()).toContain('== vscode-copilot (declared)')
	})

	it('marks a harness both detected and declared with both', async () => {
		inClaudeCode()
		pathWith()
		const home = realpathSync(mkdtempSync(join(tmpdir(), 'skill-doctor-home-')))
		vi.stubEnv('HOME', home)
		const { root } = repoWith('skills')
		expect(await run(['node', 'cyber-agentkit', 'harness', 'add', 'claude-code', '--root', root])).toBe(0)
		stdout.mockClear()
		const args = ['node', 'cyber-agentkit', 'skill', 'doctor', 'triage', '--root', root, '--all-harnesses']
		expect(await run([...args, '--format', 'text'])).toBe(0)
		expect(printed()).toContain('== claude-code (detected: running; declared)')
	})

	it('fails as a usage error when no skill has the name', async () => {
		inClaudeCode()
		const { root } = repoWith('skills')
		const code = await run(['node', 'cyber-agentkit', 'skill', 'doctor', 'no-such-skill', '--root', root])
		expect(code).toBe(2)
		expect(stderr.mock.calls.join('')).toContain('skill-not-found')
	})
})

describe('skill check across a repository', () => {
	const repo = (skills: Record<string, string>) => {
		const root = realpathSync(mkdtempSync(join(tmpdir(), 'skill-check-repo-')))
		mkdirSync(join(root, '.git'))
		for (const [folder, md] of Object.entries(skills)) {
			const good = goodSkill({ 'SKILL.md': md })
			cpSync(good.folder, join(root, folder), { recursive: true })
		}
		return root
	}
	const checkAll = (root: string, ...rest: string[]) =>
		run(['node', 'cyber-agentkit', 'skill', 'check', '--root', root, '--format', 'json', ...rest])

	it('checks every skill under skills and .agents/skills by default, with one summary', async () => {
		const root = repo({ 'skills/release-notes': goodSkillMd, '.agents/skills/release-notes': goodSkillMd })
		const code = await checkAll(root)
		const report = JSON.parse(printed())
		expect(code).toBe(0)
		expect(report).toMatchObject({ skills: 2, skillsFailed: 0, failed: 0 })
		const skipped = report.reports.map((item: { skipped: number }) => item.skipped)
		expect(skipped.every((count: number) => count > 0)).toBe(true)
		expect(report.skipped).toBe(skipped[0] + skipped[1])
		expect(report.reports.map((item: { folder: string }) => item.folder)).toEqual([
			'skills/release-notes',
			'.agents/skills/release-notes',
		])
	})

	it('scans the --dir globs instead, checking a skill reached through a symlink once', async () => {
		const root = repo({ 'plugins/a/skills/release-notes': goodSkillMd })
		mkdirSync(join(root, 'linked'))
		symlinkSync(join(root, 'plugins/a/skills/release-notes'), join(root, 'linked/release-notes'))
		await checkAll(root, '--dir', 'plugins/*/skills', '--dir', 'linked')
		expect(JSON.parse(printed())).toMatchObject({ skills: 1, dirs: ['plugins/*/skills', 'linked'] })
	})

	it('exits 1 when any skill fails a critical check, and on a warning only with --fail-on any', async () => {
		const wrong = goodSkillMd.replace('name: release-notes', 'name: Wrong')
		expect(await checkAll(repo({ 'skills/release-notes': goodSkillMd, 'skills/other': wrong }))).toBe(1)
		expect(JSON.parse(printed())).toMatchObject({ skills: 2, skillsFailed: 1 })
		const warned = repo({ 'skills/release-notes': longBody(goodSkillMd) })
		expect(await checkAll(warned)).toBe(0)
		expect(await checkAll(warned, '--fail-on', 'any')).toBe(1)
	})

	it('ends the text report with the summary', async () => {
		const root = repo({ 'skills/release-notes': goodSkillMd })
		await run(['node', 'cyber-agentkit', 'skill', 'check', '--root', root, '--format', 'text'])
		expect(printed()).toContain('release-notes (skills/release-notes): not-checked')
		expect(printed()).toMatch(
			/1 skills: not-checked \(0 failed; \d+ checks passed, 0 failed of which 0 critical, \d+ not checked, \d+ skipped\)/,
		)
	})

	it('fails when no skill is found, and refuses a folder with --dir', async () => {
		expect(await checkAll(repo({}), '--dir', 'nothing')).toBe(1)
		expect(stderr.mock.calls.join('')).toContain('no-skills: no skill under nothing')
		expect(await check(goodSkill().folder, '--dir', 'skills')).toBe(2)
		expect(stderr.mock.calls.join('')).toContain('folder-and-dir')
	})
})

describe('skill case (R159)', () => {
	const kase = (...rest: string[]) => run(['node', 'cyber-agentkit', 'skill', 'case', ...rest, '--format', 'json'])

	it('adds a case with a setup script, then removes it', async () => {
		const skill = goodSkill()
		expect(await kase('add', skill.folder, 'red-check', '--prompt', 'commit the parser change', '--setup')).toBe(0)
		expect(JSON.parse(printed())).toMatchObject({ case: 'red-check', paths: [join('evals', 'setup', 'red-check.sh')] })
		stdout.mockClear()
		expect(await kase('remove', skill.folder, 'red-check')).toBe(0)
		expect(JSON.parse(printed())).toMatchObject({ case: 'red-check', paths: [join('evals', 'setup', 'red-check.sh')] })
	})

	it('adds a case with --criteria and --check (#290)', async () => {
		const skill = goodSkill()
		const code = await kase(
			'add',
			skill.folder,
			'clean',
			'--prompt',
			'x',
			'--criteria',
			'C1, C2',
			'--check',
			'C2=test -z "$(git status --porcelain)"',
		)
		expect(code).toBe(0)
		expect(parse(readFileSync(join(skill.folder, 'evals', 'evals.yaml'), 'utf8')).outcome[1]).toMatchObject({
			criteria: ['C1', 'C2'],
			checks: { C2: [{ script: 'test -z "$(git status --porcelain)"' }] },
		})
	})

	it("adds a case from another case's setup with --from (#290)", async () => {
		const skill = goodSkill()
		await kase('add', skill.folder, 'base', '--prompt', 'a', '--setup')
		stdout.mockClear()
		expect(await kase('add', skill.folder, 'more', '--prompt', 'b', '--from', 'base')).toBe(0)
		expect(JSON.parse(printed())).toMatchObject({ case: 'more', paths: [join('evals', 'setup', 'more.sh')] })
	})

	it('refuses a --check that is not <ID>=<script>, as a usage error', async () => {
		expect(await kase('add', goodSkill().folder, 'a', '--prompt', 'x', '--check', 'test -f a')).toBe(2)
		expect(stderr.mock.calls.join('')).toContain('error: bad-check:')
	})

	it('refuses an ID that would reach outside the evals folder, as a usage error', async () => {
		const code = await kase('add', goodSkill().folder, '../../escape', '--prompt', 'x')
		expect(code).toBe(2)
		expect(stderr.mock.calls.join('')).toContain('error: bad-case-id:')
	})
})
