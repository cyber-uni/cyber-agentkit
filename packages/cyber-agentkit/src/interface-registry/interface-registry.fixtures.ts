import type { RegistryFetch } from './interface-registry.js'

export const listing = 'https://api.github.com/repos/cyber-uni/cyber-agentkit/contents/registry/interfaces?ref=main'
export const capabilityListing =
	'https://api.github.com/repos/cyber-uni/cyber-agentkit/contents/registry/capabilities?ref=main'

export function respond(status: number, body: unknown) {
	return { ok: status < 400, status, json: async () => body, text: async () => String(body) }
}

/** A registry host holding the given interface files and capability files, by name. */
export function registryHost(files: Record<string, string>, capabilities: Record<string, string> = {}): RegistryFetch {
	const folders = [
		{ listing, raw: 'https://raw.test/', files },
		{ listing: capabilityListing, raw: 'https://raw.test/capabilities/', files: capabilities },
	]
	return async (url) => {
		const folder = folders.find((each) => each.listing === url)
		if (folder) {
			return respond(
				200,
				Object.keys(folder.files).map((name) => ({ type: 'file', name, download_url: `${folder.raw}${name}` })),
			)
		}
		const owner = url.startsWith('https://raw.test/capabilities/') ? folders[1] : folders[0]
		const file = owner?.files[url.replace(owner.raw, '')]
		return file === undefined ? respond(404, '') : respond(200, file)
	}
}
