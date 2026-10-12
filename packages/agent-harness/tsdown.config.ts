import { defineConfig } from 'tsdown'

// The library build inlines `yaml` and keeps `clibuilder` external:
// `createReferenceCommand` must compose into the host CLI's own `clibuilder` instance, not a
// private inlined copy that breaks command-registry identity. It is an optional peer, so a
// consumer of `.` or `./worktrees` installs no runtime dependency. The bin build inlines both.
// tsdown 0.23 defaults to `.mjs`/`.d.mts` on the node platform; `fixedExtension: false`
// keeps the `.js`/`.d.ts` names the package.json `exports` map points at.
const shared = {
	outDir: 'dist',
	format: 'esm',
	platform: 'node',
	fixedExtension: false,
} as const

export default defineConfig([
	{
		...shared,
		entry: {
			index: 'src/index.ts',
			commands: 'src/commands.ts',
			worktrees: 'src/worktrees/index.ts',
		},
		dts: true,
		clean: true,
		deps: { alwaysBundle: ['yaml'], onlyBundle: false },
	},
	{
		// The bin's entry; nothing imports it, so it ships no declarations.
		...shared,
		entry: { cli: 'src/cli.ts' },
		dts: false,
		// `bin` installs with no `clibuilder` beside it, so the CLI carries its own copy.
		deps: { alwaysBundle: [/.*/], onlyBundle: false },
		outputOptions: { codeSplitting: false },
	},
])
