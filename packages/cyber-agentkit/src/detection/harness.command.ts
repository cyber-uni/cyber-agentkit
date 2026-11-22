import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { CliError, result } from 'clibuilder/axi'
import { Document, parseDocument } from 'yaml'
import { collapseHome } from '../command-output/collapse-home.js'
import type { HarnessId } from '../harness/harness-id.js'
import { harnessIds } from '../harness/harness-id.js'
import {
	type DeclarationTier,
	declaredHarnesses,
	declaredHarnessesReference,
	isHarnessId,
	type TierDeclaration,
	tierDeclaration,
	unknownHarnessMessage,
} from './declared-harnesses.js'

type Args = { root?: string | undefined; scope?: string | undefined }

const rootOption = {
	description:
		'The repository root, whose `.agents/references/` holds the repo declaration. Defaults to the nearest folder at or above the current directory holding `.git`.',
	type: t.string().optional(),
}

const scopeOption = {
	description:
		'The declaration to change: repo (default), `.agents/references/harnesses.yaml` at the root, or user, `~/.agents/references/harnesses.yaml`.',
	type: t.string().optional(),
}

function usage(message: string): never {
	throw new CliError(message, {
		code: 'invalid-usage',
		exitCode: exitCodes.usage,
		help: 'Run `cyber-agentkit harness --help` for the commands.',
	})
}

function scopeOf(scope: string | undefined): DeclarationTier {
	if (scope === undefined || scope === 'repo') return 'repo'
	if (scope === 'user') return 'user'
	return usage(`--scope is repo or user; got "${scope}".`)
}

/** Every ID valid, or a usage error naming the unknown ones and the valid IDs. */
function harnessesOf(values: readonly string[]): HarnessId[] {
	const unknown = values.filter((value) => !isHarnessId(value))
	if (unknown.length) usage(unknown.map(unknownHarnessMessage).join(' '))
	return [...new Set(values as HarnessId[])]
}

/** Writes the tier's `declared` list, keeping the file's other keys and, in YAML, its comments. */
function writeDeclaration(found: TierDeclaration, harnesses: readonly HarnessId[]): string {
	if (found.rejected.some(({ harness }) => harness === undefined))
		throw new CliError(found.rejected.map(({ message }) => message).join(' '), { exitCode: exitCodes.error })
	const declared = harnessIds.filter((harness) => harnesses.includes(harness))
	const file = found.file ?? join(found.dir, `${declaredHarnessesReference}.yaml`)
	mkdirSync(found.dir, { recursive: true })
	if (file.endsWith('.json')) {
		const value = JSON.parse(readFileSync(file, 'utf8') || '{}') as Record<string, unknown>
		writeFileSync(file, `${JSON.stringify({ ...value, declared }, null, 2)}\n`)
	} else {
		const text = found.file ? readFileSync(file, 'utf8') : ''
		const doc = text.trim() ? parseDocument(text) : new Document({})
		doc.set('declared', declared)
		writeFileSync(file, doc.toString())
	}
	return file
}

function changeCommand(name: 'add' | 'remove'): cli.Command {
	return command({
		name,
		description:
			name === 'add'
				? 'Declare harnesses you use, so `presentHarnesses({ all: true })` and `skill doctor --all-harnesses` check them with no detection signal, such as the Cursor IDE or Copilot in VS Code. Writes the repo declaration, or the user one with `--scope user`. An ID that is not a harness ID is refused with the valid ones.'
				: 'Remove harnesses from the repo declaration, or the user one with `--scope user`. A harness the other tier declares stays declared.',
		arguments: [
			{ name: 'harnesses', description: `Harness IDs: ${harnessIds.join(', ')}.`, type: t.array(t.string()) },
		],
		options: { root: rootOption, scope: scopeOption },
		examples: [
			name === 'add'
				? {
						command: 'cyber-agentkit harness add vscode-copilot --scope user',
						description: 'Declare Copilot in VS Code for you',
					}
				: { command: 'cyber-agentkit harness remove cursor', description: "Remove Cursor from the repo's declaration" },
		],
		run(args: Args & { harnesses: string[] }) {
			const tier = scopeOf(args.scope)
			const given = harnessesOf(args.harnesses)
			const home = homedir()
			const found = tierDeclaration(tier, { root: args.root, home })
			const next =
				name === 'add' ? [...found.harnesses, ...given] : found.harnesses.filter((harness) => !given.includes(harness))
			const file = writeDeclaration(found, next)
			const declared = harnessIds.filter((harness) => next.includes(harness))
			return result({ scope: tier, file: collapseHome(home, file), declared })
		},
	})
}

function listCommand(): cli.Command {
	return command({
		name: 'list',
		description:
			'List the declared harnesses: each with the files that declare it, the repo and user declarations combined, and any entry that is not a harness ID.',
		options: { root: rootOption },
		examples: [{ command: 'cyber-agentkit harness list', description: 'List the declared harnesses' }],
		run(args: Args) {
			const home = homedir()
			const display = (path: string) => collapseHome(home, path)
			const { harnesses, rejected } = declaredHarnesses({ root: args.root, home })
			return result(
				{
					declared: harnesses.map(({ harness, evidence }) => ({ harness, evidence: evidence.map(display) })),
					...(rejected.length
						? { rejected: rejected.map(({ file, harness, message }) => ({ file: display(file), harness, message })) }
						: {}),
				},
				{ help: ['Run `cyber-agentkit harness add <id> [--scope user]` to declare one'] },
			)
		},
	})
}

/** `harness`: declare the harnesses in use that detection cannot find. */
export function createHarnessCommand(): cli.Command {
	return command({
		name: 'harness',
		description:
			'Declare the harnesses you use, for harnesses detection cannot find: add, remove, and list the IDs the repo and user `harnesses` references hold.',
		commands: [changeCommand('add'), changeCommand('remove'), listCommand()],
	})
}
