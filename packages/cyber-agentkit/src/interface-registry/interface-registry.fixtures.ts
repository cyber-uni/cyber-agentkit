import type { RegistryFetch } from './interface-registry.js'

export const listing = 'https://api.github.com/repos/cyber-uni/cyber-agentkit/contents/registry/interfaces?ref=main'

export function respond(status: number, body: unknown) {
	return { ok: status < 400, status, json: async () => body, text: async () => String(body) }
}

/** A registry host holding the given files, by name. */
export function registryHost(files: Record<string, string>): RegistryFetch {
	return async (url) => {
		if (url === listing) {
			return respond(
				200,
				Object.keys(files).map((name) => ({ type: 'file', name, download_url: `https://raw.test/${name}` })),
			)
		}
		const name = url.replace('https://raw.test/', '')
		const file = files[name]
		return file === undefined ? respond(404, '') : respond(200, file)
	}
}
