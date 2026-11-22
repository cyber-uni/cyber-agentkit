import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
	capabilityListRow,
	checkEntryLinks,
	checkExternal,
	localPath,
	problemMessages,
	renderCapabilityPage,
	renderEntryPage,
} from './registry-lib.mjs'

const base = 'https://github.com/cyber-uni/cyber-agentkit'
const repo = mkdtempSync(join(tmpdir(), 'registry-'))
mkdirSync(join(repo, 'packages/x'), { recursive: true })
writeFileSync(join(repo, 'packages/x/a.md'), 'a')

const never = () => assert.fail('network must not be used')
const status = (code) => async () => ({ status: code })

test('maps own blob and tree urls to repo paths, others to undefined', () => {
	assert.equal(localPath(`${base}/blob/main/packages/x/a.md#top`), 'packages/x/a.md')
	assert.equal(localPath(`${base}/tree/main/packages/x/`), 'packages/x')
	assert.equal(localPath('https://example.com/a'), undefined)
	assert.equal(localPath(`${base}/blob/other/a.md`), undefined)
})

test('problems fail naming the entry file', () => {
	assert.deepEqual(problemMessages('registry/interfaces/a.md', ['bad tag']), ['registry/interfaces/a.md: bad tag'])
})

test('a missing local path fails naming entry and field, no network', async () => {
	const links = [
		{ field: 'implementations', url: `${base}/blob/main/packages/x/missing.md` },
		{ field: 'plugins', url: `${base}/tree/main/packages/x` },
	]
	const out = await checkEntryLinks({ id: 'e1' }, links, { repo, fetchFn: never })
	assert.equal(out.length, 1)
	assert.match(out[0], /^e1: implementations .*missing\.md/)
})

test('an external 404 fails and an OK passes', async () => {
	assert.match(await checkExternal('https://example.com/x', status(404)), /404/)
	assert.equal(await checkExternal('https://example.com/x', status(200)), undefined)
	const out = await checkEntryLinks({ id: 'e2' }, [{ field: 'usage', url: 'https://example.com/x' }], {
		repo,
		fetchFn: status(404),
	})
	assert.match(out[0], /^e2: usage https:\/\/example\.com\/x/)
})

test('HEAD refused falls back to GET; network failure retries then fails', async () => {
	const methods = []
	const fetchFn = async (_url, { method }) => {
		methods.push(method)
		return { status: method === 'HEAD' ? 405 : 200 }
	}
	assert.equal(await checkExternal('https://example.com', fetchFn), undefined)
	assert.deepEqual(methods, ['HEAD', 'GET'])
	let calls = 0
	const down = async () => {
		calls++
		throw new Error('offline')
	}
	assert.match(await checkExternal('https://example.com', down), /offline/)
	assert.equal(calls, 2)
})

test('page shows only set fields', () => {
	const page = renderEntryPage({ id: 'i', tags: ['t'] })
	assert.match(page, /title: "i"/)
	assert.match(page, /\*\*Tags:\*\* t/)
	assert.doesNotMatch(page, /Implementations|Used by|Status/)
})

test('a capability page names its reference, its plugins, and its blueprints, and only set fields', () => {
	const page = renderCapabilityPage({
		system: 'asana',
		plugins: [{ name: 'cyber-asana', url: 'https://example.com/p' }],
		blueprints: [{ name: 'project-tracker.blueprints.asana.sections' }],
	})
	assert.match(page, /title: "asana"/)
	assert.match(page, /Capability reference: `asana\.capabilities`/)
	assert.match(page, /## Shipped by\n\n- \[cyber-asana\]\(https:\/\/example\.com\/p\)/)
	assert.match(page, /## Blueprints built on it\n\n- project-tracker\.blueprints\.asana\.sections/)
	assert.match(page, /registry\/capabilities\/asana\.md/)
	assert.doesNotMatch(page, /Status|Tags/)
})

test('a capability row carries the blueprint names to search by', () => {
	assert.deepEqual(capabilityListRow({ system: 'asana', blueprints: [{ name: 'x.blueprints.asana.s' }] }), {
		id: 'asana',
		slug: 'asana',
		description: '',
		tags: [],
		status: '',
		plugins: [],
		blueprints: ['x.blueprints.asana.s'],
	})
})
