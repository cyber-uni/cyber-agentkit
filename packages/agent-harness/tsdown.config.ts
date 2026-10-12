import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

/** Read once here so the skill script gets them as literals: it ships with no manifest beside it. */
const readJson = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const { name } = readJson('./plugin.json') as { name: string }
const { version } = readJson('./package.json') as { version: string }

// The library build inlines `yaml` and keeps `clibuilder` and `@clibuilder/axi` external:
// `createReferenceCommand` must compose into the host CLI's own `clibuilder` instance, not a
// private inlined copy that breaks command-registry identity. Those two are optional peers, so a
// consumer of `.` or `./worktrees` installs no runtime dependency. The bin build inlines all three.
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
		alias: { 'jsonc-parser': 'jsonc-parser/lib/esm/main.js' },
		outputOptions: { codeSplitting: false, keepNames: true },
	},
	{
		// The `reference` skill's launcher. An installed plugin has no `node_modules`, so every
		// dependency is inlined into this one file, and it is written straight into the skill folder.
		// The built file is committed, so a git-sourced install carries it; `pnpm build` rebuilds it.
		format: 'esm',
		platform: 'node',
		outDir: 'skills/reference/scripts',
		entry: { reference: 'src/references/reference.skill-script.ts' },
		fixedExtension: true,
		dts: false,
		clean: false,
		minify: true,
		// One file: a copied-out skill folder has no sibling chunks to resolve a dynamic import from.
		// `keepNames`: clibuilder tells a zod array argument from a scalar by its constructor's name,
		// which minifying renames.
		outputOptions: { codeSplitting: false, keepNames: true },
		define: { __PLUGIN_NAME__: JSON.stringify(name), __PACKAGE_VERSION__: JSON.stringify(version) },
		// jsonc-parser (through clibuilder) defaults to a UMD build whose `require()` calls rolldown
		// can't follow; its ESM build is unlisted in `exports` but resolves as a direct subpath.
		alias: { 'jsonc-parser': 'jsonc-parser/lib/esm/main.js' },
		deps: { alwaysBundle: [/.*/], onlyBundle: false },
		banner: {
			js: `#!/usr/bin/env node
// Generated from packages/agent-harness/src/references/reference.skill-script.ts by \`pnpm build\`
// — do not edit. Runs \`agent-harness reference\` from this bundle; it needs no node_modules.
`,
		},
	},
])
