/**
 * The errors `skill test` knows the test sandbox, not the skill, caused (R154). A run whose tool output or error
 * carries one is a sandbox failure: it counts toward no pass rate. Add an entry here for each new one, with the
 * research claim that names its cause.
 */
export type SandboxFault = {
	/** A short, stable name for the fault, saved with each run it broke. */
	id: string
	/** A regular expression source that matches the fault's fixed text in a command's output. */
	pattern: string
	/** What breaks, in a few words, for the report. */
	cause: string
}

export const sandboxFaults: readonly SandboxFault[] = [
	{
		// E-CC-D17, E-CC-D18: Claude Code's Bash sandbox mounts a loaded plugin read-only, then cannot mount over
		// `.claude/launch.json` and the like inside it, and every later command fails.
		id: 'bwrap-read-only-mount',
		pattern: String.raw`bwrap: Can't create file at [^\n]*?: Read-only file system`,
		cause: "the shell's sandbox could not mount a path inside a read-only folder, so every later command failed",
	},
	{
		// E-CC-D22: the Bash sandbox binds a mount point of a loaded plugin's dependency copy that the copy does not
		// have, and every command fails before it starts.
		id: 'bwrap-missing-source',
		pattern: String.raw`bwrap: Can't find source path [^\n]*?: No such file or directory`,
		cause: "the shell's sandbox could not mount a path a loaded plugin does not have, so every command failed",
	},
]

/** The fault a run hit, and the text of it, cut at 300 characters. */
export type SandboxFaultHit = { fault: string; text: string }

/** The first known sandbox fault in a piece of tool output or error text, if any. */
export function recognizeSandboxFault(
	text: string,
	faults: readonly Pick<SandboxFault, 'id' | 'pattern'>[] = sandboxFaults,
): SandboxFaultHit | undefined {
	for (const fault of faults) {
		const match = new RegExp(fault.pattern).exec(text)
		if (match) return { fault: fault.id, text: match[0].slice(0, 300) }
	}
	return undefined
}
