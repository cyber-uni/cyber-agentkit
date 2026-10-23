import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { cli } from 'clibuilder'
import { command, exitCodes, t } from 'clibuilder'
import { CliError, document, result } from 'clibuilder/axi'
import { classify, ProseMergeError } from './classify.js'
import { parseHistory, retire } from './history.js'

const text = (what: string) => ({ description: `${what}, as text.`, type: t.string().optional() })
const file = (what: string) => ({ description: `${what}, read from this file.`, type: t.string().optional() })

function usage(message: string): never {
	process.stderr.write(`error: usage: ${message}\n`)
	throw CliError.reported(exitCodes.usage)
}

/** Exactly one of `--<name>` and `--<name>-from`. */
function input(name: string, inline: string | undefined, from: string | undefined): string {
	if ((inline === undefined) === (from === undefined)) usage(`pass exactly one of --${name} and --${name}-from.`)
	return inline ?? readFileSync(resolve(from as string), 'utf8')
}

function classifyCommand(): cli.Command {
	return command({
		name: 'classify',
		description:
			'Compare found prose with an offered wording and the retired wordings: the outcome for each part and the merged text, with no judgment involved.',
		options: {
			offered: text('The wording offered now'),
			'offered-from': file('The wording offered now'),
			found: text('The text found in the file being updated'),
			'found-from': file('The text found in the file being updated'),
			history: text('A history text of retired wordings, newest first'),
			'history-from': file('A history text of retired wordings, newest first'),
			retired: {
				description:
					'A retired wording, as text. Repeat for several, newest first. Used when no history text is given.',
				type: t.array(t.string()).optional(),
			},
			'retired-from': {
				description: 'A file holding a retired wording. Repeat for several, newest first.',
				type: t.array(t.string()).optional(),
			},
		},
		async run(args: {
			offered?: string | undefined
			'offered-from'?: string | undefined
			found?: string | undefined
			'found-from'?: string | undefined
			history?: string | undefined
			'history-from'?: string | undefined
			retired?: string[] | undefined
			'retired-from'?: string[] | undefined
		}) {
			const offered = input('offered', args.offered, args['offered-from'])
			const found = input('found', args.found, args['found-from'])
			const retired = [
				...(args.retired ?? []),
				...(args['retired-from'] ?? []).map((path) => readFileSync(resolve(path), 'utf8')),
			]
			const hasHistory = args.history !== undefined || args['history-from'] !== undefined
			if (hasHistory && retired.length) usage('pass a history text or retired wordings, not both.')
			const history = hasHistory ? input('history', args.history, args['history-from']) : retired
			if (typeof history === 'string') {
				const { invalid } = parseHistory(history)
				for (const entry of invalid)
					process.stderr.write(
						`warning: history entry ${entry.position + 1} (line ${entry.line}) did not parse: ${entry.heading}\n`,
					)
			}
			try {
				const out = classify({ found, offered, history })
				return result({
					outcome: out.outcome,
					...(out.reason ? { reason: out.reason } : {}),
					...(out.base ? { base: out.base } : {}),
					parts: out.parts.map((part) => ({
						path: part.path.join(' > '),
						outcome: part.outcome,
						...(part.reason ? { reason: part.reason } : {}),
						...(part.tied ? { tied: part.tied } : {}),
						...(part.base ? { base: part.base } : {}),
						...(part.shared === undefined ? {} : { shared: part.shared, baseSentences: part.baseSentences }),
						...(part.revision ? { revision: part.revision } : {}),
						...(part.text === undefined ? {} : { text: part.text }),
						...(part.collisions
							? {
									collisions: part.collisions.map((c) => ({
										base: c.base.map((s) => s.text),
										found: c.found.map((s) => s.text),
										offered: c.offered.map((s) => s.text),
									})),
								}
							: {}),
					})),
					text: out.text,
				})
			} catch (error) {
				if (!(error instanceof ProseMergeError)) throw error
				process.stderr.write(`error: ${error.code}: ${error.message}\n`)
				throw CliError.reported(exitCodes.error)
			}
		},
	})
}

function retireCommand(): cli.Command {
	return command({
		name: 'retire',
		description:
			'Print the history text with the outgoing wording added as its newest entry. Writes no file: the caller saves the answer.',
		options: {
			history: text('The history text'),
			'history-from': file('The history text'),
			wording: text('The outgoing wording'),
			'wording-from': file('The outgoing wording'),
			date: { description: 'The date of the entry, written as given.', type: t.string() },
			reason: { description: 'Why the wording was replaced.', type: t.string() },
		},
		async run(args: {
			history?: string | undefined
			'history-from'?: string | undefined
			wording?: string | undefined
			'wording-from'?: string | undefined
			date: string
			reason: string
		}) {
			const history = input('history', args.history, args['history-from'])
			const wording = input('wording', args.wording, args['wording-from'])
			return document(retire(history, wording, args.date, args.reason))
		},
	})
}

/** `classify` and `retire`: the script behind the `merge-prose` skill (R26). */
export function createProseMergeCommand(): cli.Command {
	return command({
		name: 'prose-merge',
		description:
			'Bring prose a tool wrote earlier to its offered wording without losing the owner’s edits: classify found prose, and extend the history of retired wordings.',
		commands: [classifyCommand(), retireCommand()],
	})
}
