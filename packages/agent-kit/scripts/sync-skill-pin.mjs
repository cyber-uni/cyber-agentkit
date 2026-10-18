#!/usr/bin/env node
// Moves each skill's `npx -y uni-agent-kit@<version>` fallback to this package's version.
// Run by the root `version` script after `changeset version`; `src/references/reference-skill.test.ts`
// fails while a pin is stale.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const { name, version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const pin = new RegExp(`${name.replace('/', '\\/')}@[0-9][^\\s\`]*`, 'g')

for (const skill of readdirSync(join(root, 'skills'))) {
	const path = join(root, 'skills', skill, 'SKILL.md')
	const before = readFileSync(path, 'utf8')
	const after = before.replace(pin, `${name}@${version}`)
	if (after === before) continue
	writeFileSync(path, after)
	process.stdout.write(`pinned skills/${skill}/SKILL.md to ${name}@${version}\n`)
}
