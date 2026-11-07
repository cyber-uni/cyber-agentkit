import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { document, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import {
	asCliError,
	type CommonArgs,
	compact,
	defaultReferencePath,
	givenRoot,
	inOption,
	type LayersFor,
	pluginOption,
	rootOption,
	scopeOption,
	skillOption,
} from './reference-command-support.js'
import { type DeleteResult, deleteContribution, describeAnswer } from './reference-write.js'
import { validateWrite } from './reference-write-checks.js'

/** A write's report is informational (R38), except its `code`, which is contract (J25). */
export type ReferenceDeleteReport = {
	path: string
	/** A project section's folder, relative to the root. */
	folder?: string
	/** The metadata file that went with a non-Markdown file. */
	metadataFile?: string
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
		? `the selection extends: [${deleted.selection.join(', ')}] went with it; run \`reference customize ${deleted.name} --extends ${deleted.selection.join(' ')}\` to restore it`
		: undefined
	return compact({
		path: collapseHome(home, deleted.path),
		folder: deleted.folder,
		metadataFile: deleted.metadataFile === undefined ? undefined : collapseHome(home, deleted.metadataFile),
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

export function deleteCommand(layersFor: LayersFor, path = defaultReferencePath): cli.Command {
	return command({
		name: 'delete',
		description:
			"Delete a repo or user contribution, a folder's project section, or one in a plugin's or a skill's source folder, with a non-Markdown file's metadata file, and report what answers the name afterwards. Never deletes an installed or managed one.",
		arguments: [{ name: 'name', description: 'Reference name, without the `.md` extension.', type: t.string() }],
		options: {
			root: rootOption,
			scope: { ...scopeOption, description: 'Tier to delete from: repo (default) or user.' },
			in: inOption,
			plugin: pluginOption,
			default: skillOption,
			'dry-run': {
				description: 'Print the file that would be deleted and what would answer the name then, and delete nothing.',
				type: t.boolean().optional(),
			},
		},
		examples: [{ command: `${path} delete my-topic`, description: 'Delete your contribution to my-topic' }],
		async run(
			args: CommonArgs & {
				name: string
				scope: string | undefined
				in: string | undefined
				plugin: string | undefined
				default: string | undefined
				'dry-run': boolean | undefined
			},
		) {
			const format = this.format
			try {
				const home = homedir()
				const request = {
					root: givenRoot(args.root),
					home,
					name: args.name,
					scope: args.scope,
					in: args.in,
					plugin: args.plugin,
					default: args.default,
					dryRun: args['dry-run'],
				}
				// A usage error comes before anything is read, `root-missing` included (C3).
				validateWrite({ command: 'delete', ...request })
				const layers = await layersFor({ root: args.root, default: args.default }, home)
				const deleted = deleteContribution(
					layers,
					{ ...request, root: layers.root ?? request.root },
					{ display: (path) => collapseHome(home, path) },
				)
				const report = deleteReport(deleted, home)
				if (format !== 'text') return result(report)
				if (deleted.code) return document(`${report.path}\n\n${deleted.code}: ${deleted.message}\n`)
				const selection = report.selection ? ` Also, ${report.selection}.` : ''
				const metadata = report.metadataFile ? ` Its metadata file ${report.metadataFile} went with it.` : ''
				return document(
					`${report.path}\n\n${deleted.dryRun ? 'would delete' : 'deleted'}. ${report.answer}${metadata}${selection}\n`,
				)
			} catch (error) {
				return asCliError(error, 'Reference deletion failed.')
			}
		},
	})
}
