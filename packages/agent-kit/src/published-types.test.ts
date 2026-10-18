import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { expect, it } from 'vitest'

function typeCheck(declarations: string) {
	const dir = mkdtempSync(join(tmpdir(), 'agent-harness-types-'))
	try {
		writeFileSync(
			join(dir, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					types: [],
					strict: true,
					noEmit: true,
					target: 'ES2022',
					module: 'NodeNext',
					moduleResolution: 'NodeNext',
				},
				files: [resolve(import.meta.dirname, '../dist', declarations)],
			}),
		)
		const tsc = resolve(import.meta.dirname, '../node_modules/.bin/tsc')
		execFileSync(tsc, ['-p', join(dir, 'tsconfig.json')], { encoding: 'utf8' })
	} finally {
		rmSync(dir, { recursive: true, force: true })
	}
}

it('exports the root, ./commands, and ./worktrees, and keeps command-output internal', () => {
	const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf8'))
	expect(Object.keys(manifest.exports)).toEqual(['.', './commands', './worktrees', './package.json'])
})

// TypeScript 6 defaults `types` to `[]`, so a consumer without `@types/node` in its types must
// still be able to load the published declarations. `pnpm test` builds `dist` first.
it.each(['index.d.ts', 'commands.d.ts', 'worktrees.d.ts'])(
	'the published %s type-checks without @types/node',
	(declarations) => {
		expect(() => typeCheck(declarations)).not.toThrow()
	},
)
