import { sep } from 'node:path'

/**
 * AXI §10: collapses the home directory to `~` so a path in a report is portable to another
 * machine.
 */
export function collapseHome(home: string, path: string): string {
	return home && path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path
}
