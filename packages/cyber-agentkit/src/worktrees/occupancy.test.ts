import { describe, expect, it } from 'vitest'

import { occupants, probeProcesses } from './occupancy.js'
import type { ProcessInfo } from './process-source.js'

// Fixture shapes follow the observations in .research/worktree-management/evidence.md (E-PROC-*).

const WT = '/repo.worktrees/repo-1'
const OTHER = '/repo.worktrees/repo-2'
const INIT = 482

const proc = (info: Partial<ProcessInfo> & { pid: number }): ProcessInfo => ({ ppid: 1, argv: [], env: {}, ...info })

const fixed = (processes: ProcessInfo[]) => async () => processes

const claude = (pid: number, cwd: string, ppid = 100) =>
	proc({ pid, ppid, exe: '/home/u/.local/share/claude/versions/2.1.291', argv: ['claude'], cwd })

const claudeTool = (pid: number, ppid: number, sessionPid: number, cwd: string, argv = ['node', 'vite']) =>
	proc({
		pid,
		ppid,
		exe: '/usr/bin/node',
		argv,
		cwd,
		env: {
			CLAUDECODE: '1',
			CLAUDE_CODE_CHILD_SESSION: '1',
			CLAUDE_PID: String(sessionPid),
			CLAUDE_CODE_SESSION_ID: `session-${sessionPid}`,
		},
	})

async function occupancy(processes: ProcessInfo[], root = WT, options = {}) {
	return (await probeProcesses({ source: fixed(processes) })).occupancy(root, options)
}

describe('occupancy', () => {
	it('is idle with nothing running inside', async () => {
		expect(await occupancy([claude(10, OTHER)])).toEqual({
			busy: false,
			verified: true,
			occupants: [],
			lingering: [],
			unlinked: [],
		})
	})

	it('a Claude Code session inside makes the worktree busy', async () => {
		const result = await occupancy([claude(10, WT)])
		expect(result.busy).toBe(true)
		expect(result.occupants).toEqual([
			{ harness: 'claude-code', pid: 10, pids: [10], research: ['E-PROC-CC1', 'E-PROC-CC2', 'E-PROC-CC3'] },
		])
	})

	it('counts a session in a subfolder, not one in a sibling with the same prefix', async () => {
		expect((await occupancy([claude(10, `${WT}/src`)])).busy).toBe(true)
		expect((await occupancy([claude(10, `${WT}0`)])).busy).toBe(false)
	})

	it('never limits the number of occupants', async () => {
		const result = await occupancy([claude(10, WT), claude(11, WT), claude(12, `${WT}/docs`)])
		expect(result.occupants.map((session) => session.pid)).toEqual([10, 11, 12])
	})

	it('a tool subprocess carrying CLAUDE_CODE_CHILD_SESSION is not a session', async () => {
		const result = await occupancy([claude(10, OTHER), claudeTool(20, 10, 10, WT)])
		expect(result).toMatchObject({ busy: false, occupants: [], lingering: [], unlinked: [] })
	})

	it('a nested claude run from a tool shell is its own session, despite inheriting the outer markers', async () => {
		const shell = claudeTool(20, 10, 10, OTHER, ['/bin/bash'])
		const nested = { ...claude(30, WT, 20), env: shell.env }
		const result = await occupancy([claude(10, OTHER), shell, nested])
		expect(result.occupants.map((session) => session.pid)).toEqual([30])
	})

	it('reveals the session id from a tool process', async () => {
		const result = await occupancy([claude(10, WT), claudeTool(20, 10, 10, WT)])
		expect(result.occupants[0]?.sessionId).toBe('session-10')
	})

	it('excludes processes in a nested worktree', async () => {
		const nested = `${WT}/.claude/worktrees/x`
		expect((await occupancy([claude(10, nested)], WT, { nested: [nested] })).busy).toBe(false)
		expect((await occupancy([claude(10, nested)], nested)).busy).toBe(true)
	})

	describe('lingering', () => {
		it('reports an orphaned service whose CLAUDE_PID names no live session, ancestor test not parent-is-1', async () => {
			const result = await occupancy([claudeTool(20, INIT, 10, WT)])
			expect(result.busy).toBe(false)
			expect(result.lingering).toEqual([
				{ pid: 20, ppid: INIT, argv: ['node', 'vite'], cwd: WT, harness: 'claude-code', reason: 'session-gone' },
			])
		})

		it('a service whose session still lives elsewhere is not lingering', async () => {
			const result = await occupancy([claude(10, OTHER), claudeTool(20, INIT, 10, WT)])
			expect(result.lingering).toEqual([])
			expect(result.unlinked).toEqual([])
		})

		it('a service under a live session is neither busy nor lingering', async () => {
			const result = await occupancy([claude(10, OTHER), claudeTool(20, 10, 10, WT)])
			expect(result).toMatchObject({ busy: false, lingering: [], unlinked: [] })
		})

		it('links by session id when the harness stamps no pid (Codex)', async () => {
			const codex = proc({ pid: 10, exe: '/opt/codex/0.159.3/bin/codex', argv: ['codex'], cwd: OTHER })
			const shell = proc({ pid: 11, ppid: 10, exe: '/bin/bash', cwd: OTHER, env: { CODEX_SESSION_ID: 'a' } })
			const live = proc({ pid: 20, ppid: INIT, exe: '/usr/bin/node', cwd: WT, env: { CODEX_SESSION_ID: 'a' } })
			const dead = proc({ pid: 21, ppid: INIT, exe: '/usr/bin/node', cwd: WT, env: { CODEX_SESSION_ID: 'b' } })
			const result = await occupancy([codex, shell, live, dead])
			expect(result.lingering.map((entry) => entry.pid)).toEqual([21])
			expect(result.unlinked).toEqual([])
		})

		it('reports an id-linked process as unlinked while a live session has not revealed its id', async () => {
			const codex = proc({ pid: 10, exe: '/opt/codex/bin/codex', argv: ['codex'], cwd: OTHER })
			const service = proc({ pid: 20, ppid: INIT, exe: '/usr/bin/node', cwd: WT, env: { CODEX_SESSION_ID: 'b' } })
			const result = await occupancy([codex, service])
			expect(result.lingering).toEqual([])
			expect(result.unlinked).toMatchObject([{ pid: 20, harness: 'codex', reason: 'unresolved-link' }])
		})

		it('an id-linked process with no session of its harness alive is lingering', async () => {
			const service = proc({ pid: 20, ppid: INIT, exe: '/usr/bin/node', cwd: WT, env: { CODEX_SESSION_ID: 'b' } })
			expect((await occupancy([service])).lingering).toMatchObject([{ pid: 20, reason: 'session-gone' }])
		})

		it('a process with no link variable is unlinked, not lingering', async () => {
			const service = proc({ pid: 20, ppid: INIT, exe: '/usr/bin/node', cwd: WT, env: { CRUSH: '1' } })
			const result = await occupancy([service])
			expect(result.lingering).toEqual([])
			expect(result.unlinked).toMatchObject([{ pid: 20, reason: 'no-link' }])
		})

		it('a process whose environment is unreadable is unlinked', async () => {
			const service = proc({ pid: 20, ppid: INIT, exe: '/usr/bin/node', cwd: WT, env: undefined })
			expect((await occupancy([service])).unlinked).toMatchObject([{ pid: 20, reason: 'env-unreadable' }])
		})

		it('lingers only when every harness marker it carries names a gone session', async () => {
			const codex = proc({ pid: 10, exe: '/opt/codex/bin/codex', argv: ['codex'], cwd: OTHER })
			const env = { CLAUDE_PID: '99', CODEX_SESSION_ID: 'b' }
			const service = proc({ pid: 20, ppid: INIT, exe: '/usr/bin/node', cwd: WT, env })
			expect((await occupancy([codex, service])).unlinked).toMatchObject([{ pid: 20, reason: 'unresolved-link' }])
			expect((await occupancy([service])).lingering).toMatchObject([{ pid: 20, reason: 'session-gone' }])
		})
	})

	describe('signatures', () => {
		it('Codex: the code-mode host is a helper, not a session', async () => {
			const codex = proc({ pid: 10, exe: '/opt/codex/bin/codex', argv: ['codex'], cwd: WT })
			const host = proc({ pid: 11, ppid: 10, exe: '/opt/codex/bin/codex', argv: ['codex-code-mode-host'], cwd: WT })
			expect((await occupancy([codex, host])).occupants.map((session) => session.pid)).toEqual([10])
			expect((await occupancy([{ ...host, ppid: INIT }])).lingering).toMatchObject([
				{ pid: 11, harness: 'codex', reason: 'helper-orphaned' },
			])
		})

		it('Copilot CLI: a session whose executable was replaced in place', async () => {
			const copilot = proc({ pid: 10, exe: '/home/u/.copilot-cli/1.0.92/copilot', argv: ['copilot'], cwd: WT })
			expect((await occupancy([copilot])).occupants).toMatchObject([{ harness: 'copilot-cli' }])
		})

		it('Cursor: the session counts, its worker does not, an orphaned worker lingers', async () => {
			const exe = '/home/u/.local/share/cursor-agent/versions/2026.09.28/node'
			const argv = ['/home/u/.local/bin/cursor-agent', '--use-system-ca', 'index.js']
			const session = proc({ pid: 10, exe, argv, cwd: WT, env: { CURSOR_INVOKED_AS: 'cursor-agent' } })
			const worker = proc({ pid: 11, ppid: 10, exe, argv, cwd: WT, env: { AGENT_CLI_SOCKET_PATH: '/tmp/s' } })
			expect((await occupancy([session, worker])).occupants.map((s) => s.pid)).toEqual([10])
			expect((await occupancy([{ ...worker, ppid: INIT }])).lingering).toMatchObject([
				{ pid: 11, harness: 'cursor', reason: 'helper-orphaned' },
			])
		})

		it('Kilo: wrapper and native child are one session, linked by KILO_PID on the native pid', async () => {
			const wrapper = proc({
				pid: 10,
				exe: '/usr/bin/node',
				argv: ['node', '/usr/lib/node_modules/@kilocode/cli/bin/kilo'],
				cwd: OTHER,
			})
			const native = proc({ pid: 11, ppid: 10, exe: '/x/@kilocode/cli-linux-x64/bin/kilo', argv: ['kilo'], cwd: WT })
			const orphan = proc({ pid: 20, ppid: INIT, exe: '/usr/bin/node', cwd: WT, env: { KILO_PID: '11' } })
			const result = await occupancy([wrapper, native, orphan])
			expect(result.occupants).toMatchObject([{ harness: 'kilo', pid: 10, pids: [10, 11] }])
			expect(result.lingering).toEqual([])
		})

		it('Gemini CLI: wrapper and relaunched child are one session', async () => {
			const script = '/usr/lib/node_modules/@google/gemini-cli/bundle/gemini.js'
			const wrapper = proc({ pid: 10, exe: '/usr/bin/node', argv: ['node', script], cwd: WT })
			const child = proc({
				pid: 11,
				ppid: 10,
				exe: '/usr/bin/node',
				argv: ['node', '--max-old-space-size=8192', script],
				cwd: WT,
			})
			expect((await occupancy([wrapper, child])).occupants).toMatchObject([{ harness: 'gemini-cli', pids: [10, 11] }])
		})

		it.each([
			['opencode', { exe: '/home/u/.opencode/bin/opencode', argv: ['opencode'] }],
			['qwen-code', { exe: '/usr/bin/node', argv: ['node', '/x/@qwen-code/qwen-code/cli-entry.js'] }],
			['crush', { exe: '/x/crush/bin/crush', argv: ['crush', 'run'] }],
			['goose', { exe: '/x/block-goose-cli/1.0/bin/goose', argv: ['goose', 'session'] }],
			['openhands', { exe: '/usr/bin/python3.12', argv: ['python3.12', '/home/u/.local/bin/openhands'] }],
			['cline', { exe: '/x/cline/cli-linux-x64/bin/cline', argv: ['cline', 'do it'] }],
			['augment', { exe: '/usr/bin/node', argv: ['node', '/x/@augmentcode/auggie/augment.mjs'] }],
			['antigravity-cli', { exe: '/home/u/.local/bin/agy', argv: ['agy'] }],
		])('%s session', async (harness, shape) => {
			expect((await occupancy([proc({ pid: 10, cwd: WT, ...shape })])).occupants).toMatchObject([{ harness }])
		})

		it('Goose: only `run` and `session` are sessions', async () => {
			const goose = proc({ pid: 10, exe: '/x/bin/goose', argv: ['goose', 'configure'], cwd: WT })
			expect((await occupancy([goose])).busy).toBe(false)
		})

		it('Cline: the shared hub daemon lingers only when no cline session is alive', async () => {
			const exe = '/x/cline/cli-linux-x64/bin/cline'
			const hub = proc({ pid: 20, ppid: INIT, exe, argv: ['cline', '--cline-hub-daemon', '--cwd', WT], cwd: WT })
			const session = proc({ pid: 10, exe, argv: ['cline', 'task'], cwd: OTHER })
			expect(await occupancy([hub, session])).toMatchObject({ busy: false, lingering: [], unlinked: [] })
			expect((await occupancy([hub])).lingering).toMatchObject([{ pid: 20, harness: 'cline', reason: 'harness-idle' }])
		})

		it('OpenHands: the tmux server is a shared helper', async () => {
			const tmux = proc({ pid: 20, ppid: INIT, exe: '/usr/bin/tmux', argv: ['tmux', '-Lopenhands', 'new'], cwd: WT })
			expect((await occupancy([tmux])).lingering).toMatchObject([{ harness: 'openhands', reason: 'harness-idle' }])
		})

		it('an unknown harness is invisible', async () => {
			const unknown = proc({ pid: 10, exe: '/usr/bin/some-agent', argv: ['some-agent'], cwd: WT })
			expect((await occupancy([unknown])).busy).toBe(false)
		})
	})

	describe('unsupported platform', () => {
		const source = async () => null

		it('is unverified and not busy by default', async () => {
			const probe = await probeProcesses({ source })
			expect(probe.verified).toBe(false)
			expect(probe.occupancy(WT)).toEqual({ busy: false, verified: false, occupants: [], lingering: [], unlinked: [] })
		})

		it('is busy in strict mode', async () => {
			expect((await probeProcesses({ source })).occupancy(WT, { strict: true }).busy).toBe(true)
		})

		it('occupants() answers undefined, not an empty list', async () => {
			expect(await occupants(WT, { source })).toBeUndefined()
		})
	})

	it('occupants() lists the sessions inside', async () => {
		expect(await occupants(WT, { source: fixed([claude(10, WT), claude(11, OTHER)]) })).toMatchObject([{ pid: 10 }])
	})
})
