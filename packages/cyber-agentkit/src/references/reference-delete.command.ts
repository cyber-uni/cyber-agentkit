import { homedir } from 'node:os'
import { resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { document, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import {
	asCliError,
	type CommonArgs,
	compact,
	type LayersFor,
	pluginOption,
	rootOption,
	scopeOption,
	skillOption,
} from './reference-command-support.js'
import { type DeleteResult, deleteContribution, describeAnswer } from './reference-write.js'

export type ReferenceDeleteReport = {
	path: string
	/** `no-file` when there was no file to delete: a no-op, exit 0. */
	code?: 'no-file'
	message?: string
	dryRun?: boolean
	status: string
	stack?: string[]
	answer: string
	selection?: string
	options?: string[]
}

function deleteReport(deleted: DeleteResult, home: string): ReferenceDeleteReport {
	const selection = deleted.selection
		? `the selection extends: [${deleted.selection.join(', ')}] went with it; run \`reference select ${deleted.name} <option>...\` to restore it`
		: undefined
	return compact({
		path: collapseHome(home, deleted.path),
		code: deleted.code,
		message: deleted.message,
		dryRun: deleted.dryRun || undefined,
		status: deleted.after.status,
		stack: deleted.after.trace.stack,
		answer: describeAnswer(deleted.after, (path) => collapseHome(home, path)),
		selection,
		options: deleted.after.options,
	})
}

export function deleteCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'delete',
		description:
			"Delete a repo or user contribution, or one in a plugin's or a skill's source folder, and report what answers the name afterwards. Never deletes an installed or managed one.",
		arguments: [{ name: 'name', description: 'Reference name, without the `.md` extension.', type: t.string() }],
		options: {
			root: rootOption,
			scope: { ...scopeOption, description: 'Tier to delete from: repo (default) or user.' },
			plugin: pluginOption,
			default: skillOption,
			'dry-run': {
				description: 'Print the file that would be deleted and what would answer the name then, and delete nothing.',
				type: t.boolean().optional(),
			},
		},
		async run(
			args: CommonArgs & {
				name: string
				scope: string | undefined
				plugin: string | undefined
				default: string | undefined
				'dry-run': boolean | undefined
			},
		) {
			const format = this.format
			try {
				const home = homedir()
				const layers = await layersFor({ root: args.root, default: args.default }, home)
				const root = layers.root ?? resolve(args.root ?? process.cwd())
				const deleted = deleteContribution(
					layers,
					{
						root,
						home,
						name: args.name,
						scope: args.scope,
						plugin: args.plugin,
						default: args.default,
						dryRun: args['dry-run'],
					},
					{ display: (path) => collapseHome(home, path) },
				)
				const report = deleteReport(deleted, home)
				if (format !== 'text') return result(report)
				if (deleted.code) return document(`${report.path}\n\n${deleted.code}: ${deleted.message}\n`)
				const selection = report.selection ? ` Also, ${report.selection}.` : ''
				return document(
					`${report.path}\n\n${deleted.dryRun ? 'would delete' : 'deleted'}. ${report.answer}${selection}\n`,
				)
			} catch (error) {
				return asCliError(error, 'Reference deletion failed.')
			}
		},
	})
}
