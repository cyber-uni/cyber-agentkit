import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import {
	type BundleReport,
	bundleDefaults,
	noPluginFailure,
	outOfDateFailure,
	pluginRootOf,
} from './reference-bundle.js'
import { asCliError, compact, defaultReferencePath } from './reference-command-support.js'
import { ReferenceFailure } from './reference-error.js'

export type ReferenceDefaultsReport = BundleReport

export function defaultsCommand(path = defaultReferencePath): cli.Command {
	return command({
		name: 'defaults',
		description:
			"Write a folder's bundled default copies: each reference its text loads, such as a skill's, copied from its plugin's canonical reference to references/<name>.default.md with `default` taken out of `extends`, since an installed copy gets only its own folder. Reports orphan copies, which it never deletes. With --check, writes nothing and fails when a copy is missing, stale, misnamed, or no longer loaded.",
		arguments: [
			{ name: 'folder', description: 'The folder that loads references, such as a skill folder.', type: t.string() },
		],
		options: {
			plugin: {
				description: "The plugin's folder, when the folder has no plugin manifest at or above it.",
				type: t.string().optional(),
			},
			check: {
				description: 'Write nothing; fail when any copy is out of date.',
				type: t.boolean().optional(),
			},
		},
		examples: [
			{ command: `${path} defaults skills/my-skill`, description: "Write a skill folder's bundled default copies" },
			{
				command: `${path} defaults skills/my-skill --check`,
				description: 'Fail when a bundled copy is out of date',
			},
		],
		async run(args: { folder: string; plugin: string | undefined; check: boolean | undefined }) {
			try {
				const home = homedir()
				const folder = resolve(process.cwd(), args.folder)
				if (!isFolder(folder)) {
					throw new ReferenceFailure('path-not-found', `No folder at ${args.folder}.`, { details: { path: folder } })
				}
				const pluginRoot = args.plugin ? resolve(process.cwd(), args.plugin) : pluginRootOf(folder)
				if (!pluginRoot) throw noPluginFailure(collapseHome(home, folder))
				const report = bundleDefaults({ folder, pluginRoot, write: !args.check })
				if (args.check && !report.ok) throw outOfDateFailure({ ...report, folder: collapseHome(home, folder) })
				return result(
					compact({
						folder: collapseHome(home, folder),
						pluginRoot: collapseHome(home, pluginRoot),
						ok: report.ok,
						entries: report.entries,
					}),
				)
			} catch (error) {
				return asCliError(error, 'Bundling default copies failed.')
			}
		},
	})
}

function isFolder(path: string): boolean {
	try {
		return statSync(path).isDirectory()
	} catch {
		return false
	}
}
