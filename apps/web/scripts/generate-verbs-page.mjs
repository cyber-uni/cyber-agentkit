// Builds `src/content/docs/concepts/verbs.md` (gitignored) from the package glossary's `## Verbs` section.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderVerbsPage } from './verbs-page-lib.mjs'

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const glossary = join(web, '../../packages/cyber-agentkit/.agents/spec/glossary.md')
const page = join(web, 'src/content/docs/concepts/verbs.md')

mkdirSync(dirname(page), { recursive: true })
writeFileSync(page, renderVerbsPage(readFileSync(glossary, 'utf8')))
