import { type InterfaceLookup, lookupByName } from '../interface-registry/interface-lookup.js'
import {
	type RegistryArea,
	type RegistryFetch,
	type RegistryRead,
	readRegistryFolder,
	registryFileUrl,
	registryFolderUrl,
} from '../interface-registry/interface-registry.js'
import { type CapabilityEntry, parseCapabilityEntry } from './capability-entry.js'

/**
 * The capability area of the registry, beside the interface area: one file per system,
 * `registry/capabilities/<system>.md` (decision 0008, Q14).
 */
export const capabilityArea: RegistryArea = {
	folder: 'registry/capabilities',
	noun: 'capability reference',
	short: 'capability reference',
	counted: ['system', 'systems'],
	branch: 'register-capabilities',
}

/** The web page of the capability registry folder. */
export const capabilityRegistryUrl: string = registryFolderUrl(capabilityArea.folder)

/** The web page of one system's entry file. */
export function capabilityEntryUrl(system: string): string {
	return registryFileUrl(capabilityArea.folder, system)
}

/**
 * Reads every system's entry from the live repository. Like the interface registry, it needs a
 * network and throws `RegistryUnreachable` without one; a folder that does not exist reads as empty.
 * Nothing that loads a reference calls it.
 */
export async function readCapabilityRegistry(fetcher?: RegistryFetch): Promise<RegistryRead<CapabilityEntry>> {
	return readRegistryFolder(capabilityArea.folder, parseCapabilityEntry, (entry) => entry.system, fetcher)
}

/**
 * Looks a system up against the registered ones, as the interface lookup does: the same name once
 * normalized is the same system; a near match is listed with why, and never decided on.
 */
export function lookupCapability(
	system: string,
	description: string | undefined,
	entries: readonly CapabilityEntry[],
): InterfaceLookup<CapabilityEntry> {
	return lookupByName(system, description, entries, (entry) => entry.system)
}
