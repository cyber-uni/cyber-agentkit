// Probe for research E-CC-D23 (cyber-agentkit#302): do Claude Code's file-tool limits
// (permissions.blockReadsOutsideWorkingDirectories, blockWritesOutsideWorkingDirectories) still refuse a
// file tool outside the working folder when the OS sandbox is off (sandbox: { enabled: false })?
//
// It makes no paid call: a local mock of the Messages API answers the first request with one tool_use,
// records the tool_result Claude Code sends back, and ends the turn. Credentials from the real environment
// are not passed on; HOME and CLAUDE_CONFIG_DIR are empty temporary folders.
//
// Run it from a scratch folder that holds the Agent SDK `skill test` pins:
//   npm install @anthropic-ai/claude-agent-sdk@0.3.322
//   node <repo>/scripts/probes/file-tool-limits-unsandboxed.mjs [cases, such as 1,2,3]
// Each case prints its options, the Claude Code version, the tool_result, and whether the outside file exists.

import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { query } from '@anthropic-ai/claude-agent-sdk'

const mk = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p))
const LIMITS = {
	permissions: { blockReadsOutsideWorkingDirectories: true, blockWritesOutsideWorkingDirectories: true },
}

async function runCase(name, { tool, mkInput, settings, sandbox }) {
	const run = mk('probe-run-')
	const outside = mk('probe-outside-')
	const cfg = mk('probe-cfg-')
	const home = mk('probe-home-')
	fs.writeFileSync(path.join(outside, 'secret.txt'), 'TOP-SECRET-OUTSIDE\n')
	fs.writeFileSync(path.join(run, 'inside.txt'), 'inside-content\n')
	const input = mkInput({ run, outside })
	const results = []
	let calls = 0
	const server = http.createServer((req, res) => {
		let body = ''
		req.on('data', (c) => (body += c))
		req.on('end', () => {
			let j = {}
			try {
				j = JSON.parse(body)
			} catch {}
			if (!req.url.startsWith('/v1/messages') || req.url.includes('count_tokens')) {
				res.setHeader('content-type', 'application/json')
				return res.end(JSON.stringify({ input_tokens: 10 }))
			}
			const msgs = j.messages ?? []
			const last = msgs[msgs.length - 1]
			const tr = Array.isArray(last?.content) ? last.content.find((b) => b.type === 'tool_result') : null
			const hasTools = (j.tools ?? []).some((t) => t.name === tool)
			let blocks
			if (tr) {
				results.push(tr)
				blocks = [{ type: 'text', text: 'done' }]
			} else if (hasTools && calls++ === 0) blocks = [{ type: 'tool_use', id: 'toolu_01probe', name: tool, input }]
			else blocks = [{ type: 'text', text: 'ok' }]
			const msg = {
				id: 'msg_x',
				type: 'message',
				role: 'assistant',
				model: j.model ?? 'm',
				content: blocks,
				stop_reason: blocks[0].type === 'tool_use' ? 'tool_use' : 'end_turn',
				stop_sequence: null,
				usage: { input_tokens: 5, output_tokens: 5 },
			}
			if (!j.stream) {
				res.setHeader('content-type', 'application/json')
				return res.end(JSON.stringify(msg))
			}
			res.writeHead(200, { 'content-type': 'text/event-stream' })
			const ev = (t, d) => res.write(`event: ${t}\ndata: ${JSON.stringify({ type: t, ...d })}\n\n`)
			ev('message_start', { message: { ...msg, content: [], stop_reason: null } })
			blocks.forEach((b, i) => {
				if (b.type === 'text') {
					ev('content_block_start', { index: i, content_block: { type: 'text', text: '' } })
					ev('content_block_delta', { index: i, delta: { type: 'text_delta', text: b.text } })
				} else {
					ev('content_block_start', {
						index: i,
						content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} },
					})
					ev('content_block_delta', {
						index: i,
						delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.input) },
					})
				}
				ev('content_block_stop', { index: i })
			})
			ev('message_delta', { delta: { stop_reason: msg.stop_reason, stop_sequence: null }, usage: { output_tokens: 5 } })
			ev('message_stop', {})
			res.end()
		})
	})
	await new Promise((r) => server.listen(0, '127.0.0.1', r))
	const port = server.address().port
	const env = {
		PATH: process.env.PATH,
		HOME: home,
		CLAUDE_CONFIG_DIR: cfg,
		ANTHROPIC_BASE_URL: `http://127.0.0.1:${port}`,
		ANTHROPIC_API_KEY: 'sk-fake',
		DISABLE_TELEMETRY: '1',
		CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
	}
	const options = {
		cwd: run,
		settingSources: ['project'],
		permissionMode: 'acceptEdits',
		allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
		env,
		model: 'claude-sonnet-4-5',
		maxTurns: 3,
		...(settings ? { settings } : {}),
		...(sandbox ? { sandbox } : {}),
	}
	let version
	let err
	try {
		for await (const m of query({ prompt: 'go', options }))
			if (m.type === 'system' && m.subtype === 'init') version = m.claude_code_version
	} catch (e) {
		err = String(e)
	}
	server.close()
	const outFile = input.file_path
	const outsideFileExists = outFile ? fs.existsSync(outFile) : undefined
	const report = {
		name,
		version,
		options: { settings, sandbox, tool, input },
		toolResults: results.map((r) => r.content),
		err,
		outsideFileExists,
		outsideContent: outsideFileExists ? fs.readFileSync(outFile, 'utf8') : undefined,
	}
	process.stdout.write(`${JSON.stringify(report, null, 1)}\n`)
}
const off = { enabled: false }
const cases = {
	1: [
		'1 Read outside, sandbox off, limits on',
		{
			tool: 'Read',
			mkInput: ({ outside }) => ({ file_path: path.join(outside, 'secret.txt') }),
			settings: LIMITS,
			sandbox: off,
		},
	],
	2: [
		'2 Write outside, sandbox off, limits on',
		{
			tool: 'Write',
			mkInput: ({ outside }) => ({ file_path: path.join(outside, 'new.txt'), content: 'pwned' }),
			settings: LIMITS,
			sandbox: off,
		},
	],
	3: [
		'3 Read outside, sandbox off, limits OFF',
		{ tool: 'Read', mkInput: ({ outside }) => ({ file_path: path.join(outside, 'secret.txt') }), sandbox: off },
	],
	4: [
		'4 Read inside, limits on',
		{
			tool: 'Read',
			mkInput: ({ run }) => ({ file_path: path.join(run, 'inside.txt') }),
			settings: LIMITS,
			sandbox: off,
		},
	],
	5: [
		'5 Edit outside, sandbox off, limits on',
		{
			tool: 'Edit',
			mkInput: ({ outside }) => ({
				file_path: path.join(outside, 'secret.txt'),
				old_string: 'TOP-SECRET',
				new_string: 'CHANGED',
			}),
			settings: LIMITS,
			sandbox: off,
		},
	],
	6: [
		'6 Grep outside abs path',
		{
			tool: 'Grep',
			mkInput: ({ outside }) => ({ pattern: 'SECRET', path: outside, output_mode: 'content' }),
			settings: LIMITS,
			sandbox: off,
		},
	],
	7: [
		'7 Glob outside abs path',
		{ tool: 'Glob', mkInput: ({ outside }) => ({ pattern: '*.txt', path: outside }), settings: LIMITS, sandbox: off },
	],
}
for (const k of (process.argv[2] ?? '1,2,3,4,5,6,7').split(',')) await runCase(...cases[k])
