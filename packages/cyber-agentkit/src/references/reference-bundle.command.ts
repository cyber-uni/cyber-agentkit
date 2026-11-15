import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import { type BundleReport, bundleSkill, noPluginFailure, outOfDateFailure, pluginRootOf } from './reference-bundle.js'
import {
	asCliError,
	type CommonArgs,
	compact,
	defaultReferencePath,
	type LayersFor,
	rootOption,
} from './reference-command-support.js'
import { findSkill } from './reference-skill-audit.js'

export type ReferenceDefaultsReport = Omit<BundleReport, 'skill' | 'pluginRoot'> & {
	skill: { name: string; folder: string }
	pluginRoot: string
}

export function defaultsCommand(layersFor: LayersFor, path = defaultReferencePath): cli.Command {
	return command({
		name: 'defaults',
		description:
			"Write a skill's bundled default copies: each reference the skill loads, copied from its plugin's canonical reference to references/<name>.default.md with `default` taken out of `extends`, since an installed skill gets only its own folder. Reports orphan copies, which it never deletes. With --check, writes nothing and fails when a copy is missing, stale, misnamed, or no longer named by the skill.",
		arguments: [{ name: 'skill', description: "A skill's folder, or its name.", type: t.string() }],
		options: {
			root: rootOption,
			plugin: {
				description: "The plugin's folder, when the skill's folder has no plugin manifest above it.",
				type: t.string().optional(),
			},
			check: {
				description: 'Write nothing; fail when any copy is out of date.',
				type: t.boolean().optional(),
			},
		},
		examples: [
			{ command: `${path} defaults my-skill`, description: "Write a skill's bundled default copies" },
			{ command: `${path} defaults my-skill --check`, description: 'Fail when a bundled copy is out of date' },
		],
		async run(args: CommonArgs & { skill: string; plugin: string | undefined; check: boolean | undefined }) {
			try {
				const home = homedir()
				const layers = await layersFor(args, home)
				const skill = findSkill(args.skill, layers, process.cwd(), home)
				const pluginRoot = args.plugin ? resolve(process.cwd(), args.plugin) : pluginRootOf(skill.folder)
				if (!pluginRoot) throw noPluginFailure(skill)
				const report = bundleSkill({ skill, pluginRoot, write: !args.check })
				if (args.check && !report.ok) throw outOfDateFailure(report)
				return result(
					compact({
						skill: { name: skill.name, folder: collapseHome(home, skill.folder) },
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
