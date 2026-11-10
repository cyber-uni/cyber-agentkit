import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cli, exitCodes } from 'clibuilder'
import { homeHeader, result } from 'clibuilder/axi'
import { createAssetCommand } from './assets/asset.command.js'
import { detectHarness } from './detection/detect-harness.js'
import { createProseUpdateCommand } from './prose-update/prose-update.command.js'
import { createReferenceCommand } from './references/reference.command.js'
import { createSkillCommand } from './skill-design/skill.command.js'

/** Who runs the CLI: the plugin's name, the package's version, and the folder its own `references/` sit in. */
export type CliHost = { name: string; version: string; root: string }

function readJson<T>(url: URL): T {
	return JSON.parse(readFileSync(url, 'utf8')) as T
}

/**
 * Read from `../plugin.json` and `../package.json`, which resolve from `src/cli.ts` and `dist/cli.js`
 * alike. The skill script, shipped with no package tree beside it, passes its own host instead.
 */
function packageHost(): CliHost {
	const manifest = new URL('../package.json', import.meta.url)
	const { name } = readJson<{ name: string }>(new URL('../plugin.json', import.meta.url))
	const { version } = readJson<{ version: string }>(manifest)
	return { name, version, root: dirname(fileURLToPath(manifest)) }
}

// A factory, not a module-level constant: `cli()` builds state, and state built at import time
// would be shared by every later call in the process.
function app({ name, version, root }: CliHost, format: 'toon' | 'text') {
	return cli({
		format,
		name: 'cyber-agentkit',
		version,
		description:
			'Work with the AI agent harness running here: read its layered reference documents, and update prose a tool wrote earlier.',
	})
		.default({
			description: 'Show the harness running here and the commands to read its references and assets.',
			examples: [{ command: 'cyber-agentkit', description: 'Show the detected harness and the commands' }],
			run() {
				const { harness, candidates } = detectHarness()
				return result(
					{
						...homeHeader({ description: 'Work with the AI agent harness running here', bin: 'cyber-agentkit' }),
						harness,
						...(candidates.length > 1 ? { candidates } : {}),
						commands: ['reference', 'asset', 'prose-update', 'skill'],
					},
					{
						help: [
							'Run `cyber-agentkit reference list` to see every reference',
							'Run `cyber-agentkit reference load <name>` to read one',
						],
					},
				)
			},
		})
		.command(createReferenceCommand({ plugin: { name, root } }))
		.command(createAssetCommand({ plugin: { name, root } }))
		.command(createProseUpdateCommand())
		.command(createSkillCommand({ plugin: { name, root } }))
}

/**
 * `load`, `create`, `customize`, and `delete`, and `asset show`, `update`, and `select`, answer in `text` unless
 * `--format` says otherwise; the other subcommands answer in `toon`. clibuilder 12 has one global `--format` default, so it is chosen
 * from the subcommand the argv names.
 */
function defaultFormat(argv: string[]): 'toon' | 'text' {
	const args = argv.slice(2)
	if (args.some((arg) => arg === '--format' || arg.startsWith('--format='))) return 'toon'
	const subcommand = ['reference', 'asset', 'prose-update', 'skill'].includes(args[0] ?? '') ? args[1] : undefined
	return ['show', 'load', 'create', 'customize', 'update', 'select', 'delete', 'retire'].includes(subcommand ?? '')
		? 'text'
		: 'toon'
}

/** argv in, exit code out — returned rather than written, so a caller that is not the process can act on it. */
export async function run(argv: string[], host: CliHost = packageHost()): Promise<number> {
	try {
		const code = await app(host, defaultFormat(argv)).parse<number | undefined>(argv)
		return typeof code === 'number' ? code : exitCodes.success
	} catch (error) {
		// stderr, not stdout — stdout carries TOON an agent parses.
		process.stderr.write(`error: ${error instanceof Error ? error.message : 'Invalid command.'}\n`)
		return exitCodes.usage
	}
}
