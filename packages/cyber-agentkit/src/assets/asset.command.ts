import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { CliError, document, isCliError, result } from 'clibuilder/axi'
import { createAssetResolveCommands, type ReferenceCommandOptions } from '../references/reference.command.js'
import { AssetError, deleteAsset, listAssets, showAsset, writeAsset } from './skill-assets.js'

type Common = { skill: string; root: string | undefined }

const skillOption = {
	description: "A skill's source folder in this repository: its `assets/` folder is acted on.",
	type: t.string(),
}

const rootOption = {
	description: 'The directory the repository is found from. Defaults to the current directory.',
	type: t.string().optional(),
}

function fail(error: unknown, fallback: string): never {
	if (isCliError(error)) throw error
	if (error instanceof AssetError) {
		process.stderr.write(`error: ${error.code}: ${error.message}\n`)
		throw CliError.reported(error.usage ? exitCodes.usage : exitCodes.error)
	}
	process.stderr.write(`error: ${error instanceof Error ? error.message : fallback}\n`)
	throw CliError.reported(exitCodes.error)
}

function usage(message: string): never {
	process.stderr.write(`error: usage: ${message}\n`)
	throw CliError.reported(exitCodes.usage)
}

const pathDescription = 'Asset path inside `assets/`, such as `data/rules.json`.'
function rootOf(args: Common): string {
	return resolve(args.root ?? process.cwd())
}

function listCommand(): cli.Command {
	return command({
		name: 'list',
		description: "List every file in a skill's assets/ folder with its size.",
		options: { skill: skillOption, root: rootOption },
		async run(args: Common) {
			try {
				const entries = listAssets(args.skill, rootOf(args))
				return result({ assets: entries.length ? entries : '0 assets — the skill holds none' })
			} catch (error) {
				return fail(error, 'Asset listing failed.')
			}
		},
	})
}

function showCommand(): cli.Command {
	return command({
		name: 'show',
		description: 'Print a text asset as written.',
		arguments: [{ name: 'path', description: pathDescription, type: t.string() }],
		options: { skill: skillOption, root: rootOption },
		async run(args: Common & { path: string }) {
			try {
				return document(showAsset(args.skill, rootOf(args), args.path))
			} catch (error) {
				return fail(error, 'Asset read failed.')
			}
		},
	})
}

type WriteArgs = Common & { path: string; content: string | undefined; from: string | undefined }

function writeCommand(mode: 'create' | 'update'): cli.Command {
	return command({
		name: mode,
		description:
			mode === 'create'
				? 'Add a new asset from --content or --from. Never overwrites a file.'
				: 'Replace an existing asset from --content or --from.',
		arguments: [{ name: 'path', description: pathDescription, type: t.string() }],
		options: {
			skill: skillOption,
			root: rootOption,
			content: { description: 'The text to write.', type: t.string().optional() },
			from: { description: 'A local file whose bytes to write.', type: t.string().optional() },
		},
		async run(args: WriteArgs) {
			try {
				if ((args.content === undefined) === (args.from === undefined))
					usage('pass exactly one of --content and --from.')
				const content = args.content ?? readFileSync(resolve(args.from as string), 'utf8')
				const file = writeAsset(mode, args.skill, rootOf(args), args.path, content)
				return document(`${file}\n\n${mode === 'create' ? 'created' : 'updated'}.\n`)
			} catch (error) {
				return fail(error, `Asset ${mode} failed.`)
			}
		},
	})
}

function deleteCommand(): cli.Command {
	return command({
		name: 'delete',
		description: "Delete an asset from a skill's source folder, and any folder it leaves empty.",
		arguments: [{ name: 'path', description: pathDescription, type: t.string() }],
		options: { skill: skillOption, root: rootOption },
		async run(args: Common & { path: string }) {
			try {
				return document(`${deleteAsset(args.skill, rootOf(args), args.path)}\n\ndeleted.\n`)
			} catch (error) {
				return fail(error, 'Asset deletion failed.')
			}
		},
	})
}

export function createAssetCommand(options: ReferenceCommandOptions = {}): cli.Command {
	const { load, names, where } = createAssetResolveCommands(options)
	return command({
		name: 'asset',
		description:
			"Manage a skill's assets/ files by path (list, show, create, update, delete), and load one by name through the tiers (load, names, where).",
		commands: [
			listCommand(),
			showCommand(),
			writeCommand('create'),
			writeCommand('update'),
			deleteCommand(),
			load,
			names,
			where,
		],
	})
}
