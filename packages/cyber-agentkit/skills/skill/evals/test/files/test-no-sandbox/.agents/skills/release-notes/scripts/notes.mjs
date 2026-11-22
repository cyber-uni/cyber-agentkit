// Prints release notes in Markdown from a JSON list of merged pull requests: { number, title, labels }.
import { readFileSync } from 'node:fs'

const prs = JSON.parse(readFileSync(process.argv[2] ?? 'prs.json', 'utf8'))
const kept = prs.filter((pr) => !/^Merge (pull request|branch)/.test(pr.title) && !pr.labels.includes('internal'))
const line = (pr) => `- ${pr.title} (#${pr.number})`
const features = kept.filter((pr) => pr.labels.includes('feature')).map(line)
const fixes = kept.filter((pr) => !pr.labels.includes('feature')).map(line)
const out = ['## Release notes', '']
if (features.length) out.push('### Features', '', ...features, '')
if (fixes.length) out.push('### Fixes', '', ...fixes, '')
process.stdout.write(out.join('\n'))
