import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { CliError, document, isCliError, result } from 'clibuilder/axi'
import { createAssetResolveCommands, type ReferenceCommandOptions } from '../references/reference.command.js'
import { referenceLayers } from '../references/reference-layers.js'
import { copyAsset } from './copy-asset.js'
import { selectAsset } from './select-asset.js'
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
function rootOf(args: { root: string | undefined }): string {
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

type WriteArgs = Omit<Common, 'skill'> & {
	skill: string | undefined
	path: string
	content: string | undefined
	from: string | undefined
}

function writeCommand(mode: 'create' | 'update', host: ReferenceCommandOptions): cli.Command {
	const create = mode === 'create'
	return command({
		name: mode,
		description: create
			? 'Add a new asset: by path in a skill from --content or --from, or, with --copy, by name in the project or user assets folder as a copy of what a plugin, the default, or another tier holds (never the managed tier). Never overwrites a file.'
			: 'Replace an existing asset from --content or --from.',
		arguments: [{ name: 'path', description: `${pathDescription} With --copy, the asset name.`, type: t.string() }],
		options: {
			skill: { ...skillOption, type: t.string().optional() },
			root: rootOption,
			content: { description: 'The text to write.', type: t.string().optional() },
			from: { description: 'A local file whose bytes to write.', type: t.string().optional() },
			...(create
				? {
						copy: {
							description:
								"Copy the asset of this source: a plugin's name, `default` (the skill's own file), `project`, or `user`. `managed` is refused.",
							type: t.string().optional(),
						},
						scope: {
							description:
								'With --copy, where the copy goes: project (default), `.agents/assets/`, or user, `~/.agents/assets/`.',
							type: t.string().optional(),
						},
					}
				: {}),
		},
		async run(args: WriteArgs & { copy?: string | undefined; scope?: string | undefined }) {
			try {
				if (args.copy !== undefined) {
					if (args.content !== undefined || args.from !== undefined) usage('--copy takes neither --content nor --from.')
					const home = homedir()
					const root = rootOf(args)
					const layers = await referenceLayers({
						root,
						home,
						platform: process.platform,
						env: process.env,
						plugin: host.plugin,
						defaultSkill: args.skill,
						folder: 'assets',
					})
					const done = copyAsset(layers, {
						root,
						home,
						name: args.path,
						scope: args.scope ?? 'project',
						copy: args.copy,
					})
					return document(`${done.path}\n\ncopied from ${done.from}. Edit it; it now answers over the plugin tier.\n`)
				}
				if (!args.skill) usage('pass --skill, or --copy to create an override by name.')
				if ((args.content === undefined) === (args.from === undefined))
					usage('pass exactly one of --content and --from.')
				const content = args.content ?? readFileSync(resolve(args.from as string), 'utf8')
				const file = writeAsset(mode, args.skill, rootOf(args), args.path, content)
				return document(`${file}\n\n${create ? 'created' : 'updated'}.\n`)
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

function selectCommand(options: ReferenceCommandOptions): cli.Command {
	return command({
		name: 'select',
		description:
			'Choose which plugin, or the skill itself, answers an asset name that several hold, by writing `<name>.select` in the project or user assets folder.',
		arguments: [
			{ name: 'name', description: 'Asset name, without its extension.', type: t.string() },
			{
				name: 'option',
				description: "A plugin name, or `default` for the skill's own file. Not used with --clear.",
				type: t.string().optional(),
			},
		],
		options: {
			root: rootOption,
			default: {
				description: "The calling skill's folder: its `assets/<name>.<ext>` is the `default` option.",
				type: t.string().optional(),
			},
			scope: {
				description: 'Where to write: project (default), `.agents/assets/`, or user, `~/.agents/assets/`.',
				type: t.string().optional(),
			},
			clear: { description: 'Remove the selection.', type: t.boolean().optional() },
		},
		async run(args: {
			name: string
			option: string | undefined
			root: string | undefined
			default: string | undefined
			scope: string | undefined
			clear: boolean | undefined
		}) {
			try {
				const home = homedir()
				const root = resolve(args.root ?? process.cwd())
				const layers = await referenceLayers({
					root,
					home,
					platform: process.platform,
					env: process.env,
					plugin: options.plugin,
					defaultSkill: args.default,
					folder: 'assets',
				})
				const done = selectAsset(layers, { ...args, root, home })
				const answer =
					done.after.status === 'found'
						? `${args.name} now answers from ${done.after.trace.stack.join(', ') || 'a tier'}.`
						: `${args.name} is ${done.after.status}: ${done.after.message ?? ''}`
				return document(
					`${done.path}\n\n${done.cleared ? 'selection cleared' : `selected ${done.selected}`}. ${answer}\n`,
				)
			} catch (error) {
				return fail(error, 'Asset selection failed.')
			}
		},
	})
}

export function createAssetCommand(options: ReferenceCommandOptions = {}): cli.Command {
	const { load, names, where } = createAssetResolveCommands(options)
	return command({
		name: 'asset',
		description:
			"Manage a skill's assets/ files by path (list, show, create, update, delete), and load one by name through the tiers (load, names, where, select).",
		commands: [
			listCommand(),
			showCommand(),
			writeCommand('create', options),
			writeCommand('update', options),
			deleteCommand(),
			load,
			names,
			where,
			selectCommand(options),
		],
	})
}
