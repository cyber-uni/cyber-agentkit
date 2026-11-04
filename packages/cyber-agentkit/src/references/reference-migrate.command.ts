import { homedir } from 'node:os'
import type { cli } from 'clibuilder'
import { command, t } from 'clibuilder'
import { document, empty, result } from 'clibuilder/axi'
import { collapseHome } from '../command-output/collapse-home.js'
import type { ReferenceWarning } from './reference-codes.js'
import {
	asCliError,
	type CommonArgs,
	compact,
	givenRoot,
	type LayersFor,
	rootOption,
	writeWarnings,
} from './reference-command-support.js'
import { ReferenceFailure } from './reference-error.js'
import { type MigrationRow, migrateReferences } from './reference-migrate.js'

/** `migrate`'s answer: the plan, and whether it was applied (R121). */
export type ReferenceMigrateReport = {
	changes: MigrationRow[]
	/** Set when `--write` applied the changes that are not manual. */
	written?: true
	warnings?: ReferenceWarning[]
}

function rowLine(row: MigrationRow): string {
	const where = row.folder === undefined ? row.tier : `${row.tier} ${row.folder}`
	const change = row.manual === undefined ? `${row.from} → ${row.to}` : `${row.from}: manual: ${row.manual}`
	const by = row.by === undefined ? '' : ` (by ${row.by})`
	const user = row.tier === 'user' ? '; a user file, which no git history restores' : ''
	return `${row.path} (${where}): ${row.form}: ${change}${by}${user}`
}

function summary(rows: readonly MigrationRow[], written: boolean): string {
	const manual = rows.filter((row) => row.manual !== undefined).length
	const applied = rows.length - manual
	const left = manual ? ` ${manual} ${manual === 1 ? 'needs' : 'need'} a person, as each says.` : ''
	if (written) return `migrated ${applied} ${applied === 1 ? 'change' : 'changes'}.${left}`
	if (!applied) return `nothing to apply.${left}`
	return `${applied} ${applied === 1 ? 'change' : 'changes'} to make; run \`reference migrate --write\` with the same arguments to apply ${applied === 1 ? 'it' : 'them'}.${left}`
}

export function migrateCommand(layersFor: LayersFor): cli.Command {
	return command({
		name: 'migrate',
		description:
			'Rewrite reference files still in a form version 1 wrote, and rename files under a name a plugin renamed, in the repo and user tiers and every project section, or in one plugin or skill source folder. Prints the plan; `--write` applies it. Never changes a managed or installed file.',
		arguments: [
			{
				name: 'names',
				description:
					'Reference names to limit the run to, without the `.md` extension; a file under an older name of one is included.',
				type: t.array(t.string()).optional(),
			},
		],
		options: {
			root: rootOption,
			plugin: {
				description:
					"A plugin's source folder in this repository: migrate only its `references/`, in place of the tiers.",
				type: t.string().optional(),
			},
			default: {
				description:
					"A skill's source folder in this repository: migrate only its `references/`, in place of the tiers. A default at `references/<name>.md` is renamed only for a name given.",
				type: t.string().optional(),
			},
			write: {
				description: 'Apply the changes. It edits `user` files too, which no git history restores.',
				type: t.boolean().optional(),
			},
		},
		async run(
			args: CommonArgs & {
				names?: string[] | undefined
				plugin: string | undefined
				default: string | undefined
				write: boolean | undefined
			},
		) {
			const format = this.format
			try {
				const home = homedir()
				// A usage error comes before anything is read, `root-missing` included.
				if (args.plugin !== undefined && args.default !== undefined) {
					throw new ReferenceFailure('options-conflict', 'pass one of --plugin and --default.')
				}
				const layers = await layersFor({ root: args.root }, home)
				const migrated = migrateReferences(layers, {
					root: layers.root ?? givenRoot(args.root),
					home,
					names: args.names,
					plugin: args.plugin,
					default: args.default,
					write: args.write,
				})
				const changes = migrated.rows.map((row) => ({ ...row, path: collapseHome(home, row.path) }))
				if (!changes.length && !migrated.warnings.length) {
					return empty('0 changes — no reference file is in a version 1 form or under a renamed name', {
						help: ['Run `reference check` for every warning `load` raises.'],
					})
				}
				const report: ReferenceMigrateReport = compact({
					changes,
					written: migrated.written ? (true as const) : undefined,
					warnings: migrated.warnings,
				})
				if (format !== 'text') return result(report)
				writeWarnings(migrated.warnings)
				const lines = changes.map(rowLine)
				return document(`${[...lines, '', summary(changes, migrated.written)].join('\n').trimStart()}\n`)
			} catch (error) {
				return asCliError(error, 'Reference migration failed.')
			}
		},
	})
}
