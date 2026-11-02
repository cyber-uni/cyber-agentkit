import type { cli } from 'clibuilder'
import { command } from 'clibuilder'
import { checkCommand } from './reference-check.command.js'
import { layerSource } from './reference-command-support.js'
import { createCommand } from './reference-create.command.js'
import { deleteCommand } from './reference-delete.command.js'
import { implementationsCommand } from './reference-implementations.command.js'
import type { ReferencePlugin } from './reference-layers.js'
import { listCommand } from './reference-list.command.js'
import { searchCommand } from './reference-search.command.js'
import { selectCommand } from './reference-select.command.js'
import { showCommand } from './reference-show.command.js'
import { whereCommand } from './reference-where.command.js'

export type { ReferenceCheckReport } from './reference-check.command.js'
export { traceText } from './reference-command-support.js'
export type { ReferenceCreateReport } from './reference-create.command.js'
export type { ReferenceDeleteReport } from './reference-delete.command.js'
export type { ReferenceImplementationsReport } from './reference-implementations.command.js'
export type { ReferenceListReport } from './reference-list.command.js'
export type { ReferenceSearchReport } from './reference-search.command.js'
export type { ReferenceSelectReport } from './reference-select.command.js'
export type { ReferenceShowEntry } from './reference-show.command.js'
export type { ReferenceWhereOutput } from './reference-where.command.js'

export type ReferenceCommandOptions = {
	/** The plugin running the command; see `ReferenceLayerOptions['plugin']`. */
	plugin?: ReferencePlugin | undefined
}

export type ReferenceCommands = {
	show: cli.Command
	list: cli.Command
	search: cli.Command
	where: cli.Command
	create: cli.Command
	select: cli.Command
	delete: cli.Command
	check: cli.Command
	implementations: cli.Command
}

/** A factory, so each host CLI names itself as the plugin whose own references come first. */
export function createReferenceCommands({ plugin }: ReferenceCommandOptions = {}): ReferenceCommands {
	const layersFor = layerSource(plugin)
	return {
		show: showCommand(layersFor),
		list: listCommand(layersFor),
		search: searchCommand(layersFor),
		where: whereCommand(layersFor),
		create: createCommand(layersFor),
		select: selectCommand(layersFor),
		delete: deleteCommand(layersFor),
		check: checkCommand(layersFor),
		implementations: implementationsCommand(layersFor),
	}
}

export function createReferenceCommand(options: ReferenceCommandOptions = {}): cli.Command {
	const {
		show,
		list,
		search,
		where,
		create,
		select,
		delete: remove,
		check,
		implementations,
	} = createReferenceCommands(options)
	return command({
		name: 'reference',
		description:
			'Read reference documents by name, composed from the managed, project, user, plugin, and default tiers, and write, select, or delete a contribution.',
		commands: [show, list, search, where, create, select, remove, implementations, check],
	})
}
