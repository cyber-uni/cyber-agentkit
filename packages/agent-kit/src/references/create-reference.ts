import { readFileSync } from 'node:fs'
import { parseDocument as parseYaml } from 'yaml'
import { frontmatterPattern, parseDocument, parseSections } from './reference-document.js'
import type { ReferenceInterface } from './reference-interface.js'

/** No `#` title: `patch` matches by heading path, so a title would hold every section under it. */
export const defaultTemplate: string = `---
description: What this reference covers, and when an agent should read it.
tags: [topic]
---

## Overview

Write the guidance here. Give each topic its own top-level \`##\` section.
`

export type Template = { content: string; metadata: Record<string, unknown>; body: string }

/** The interface's sections as `##` headings, in order, each stubbed `**Unsupported.**`. */
export function implementationTemplate(iface: ReferenceInterface): Template {
	const sections = iface.sections.map(
		(name) =>
			`## ${name}\n\n**Unsupported.** Replace this line with the section, or say in one sentence why it is not supported.\n`,
	)
	return parseTemplate(
		`---\ndescription: What this ${iface.id} implementation covers, and when an agent should read it.\nimplements: ${iface.id}@${iface.version}\n---\n\n${sections.join('\n')}`,
		`the ${iface.id} interface`,
	)
}

export function readTemplate(path: string | undefined): Template {
	if (path === undefined) return parseTemplate(defaultTemplate, 'the default template')
	let content: string
	try {
		content = readFileSync(path, 'utf8')
	} catch (error) {
		throw new Error(`cannot read the template ${path}: ${(error as Error).message}`)
	}
	return parseTemplate(content, `the template ${path}`)
}

function parseTemplate(content: string, label: string): Template {
	let mapping = true
	const { metadata, body } = parseDocument(content, () => {
		mapping = false
	})
	// `show` would drop such frontmatter, so the reference would lose every key in it.
	if (!mapping) throw new Error(`${label} has frontmatter that is not a YAML mapping.`)
	return { content, metadata, body }
}

/**
 * A title: the top level is a single heading holding every other one. `patch` matches by heading
 * path, so it would add the whole document under the title instead of patching its sections.
 */
export function titleOf({ body }: Pick<Template, 'body'>): string | undefined {
	const tree = parseSections(body, () => {})
	const [only] = tree.children
	return tree.children.length === 1 && only?.children.length ? only.heading.trim() : undefined
}

export function hasDescription({ metadata }: Pick<Template, 'metadata'>): boolean {
	return typeof metadata['description'] === 'string' && metadata['description'].trim().length > 0
}

/**
 * Sets or removes frontmatter keys and keeps the rest of the file as written: other keys, comments,
 * and the body. A file left with no key and no body is empty.
 */
export function editFrontmatter(raw: string, keys: Record<string, unknown>): string {
	const match = frontmatterPattern.exec(raw)
	const body = match ? raw.slice(match[0].length) : raw
	const doc = parseYaml(match ? (match[1] as string) : '')
	for (const [key, value] of Object.entries(keys)) {
		if (value === undefined) doc.delete(key)
		else {
			const node = doc.createNode(value, { flow: Array.isArray(value) })
			doc.set(key, node)
		}
	}
	const contents = doc.contents as { items?: unknown[] } | null
	if (!contents?.items?.length) return body.replace(/^(?:[ \t]*\r?\n)+/, '')
	const gap = !match && body.trim() ? '\n' : ''
	return `---\n${doc.toString({ lineWidth: 0, flowCollectionPadding: false })}---\n${gap}${body}`
}
