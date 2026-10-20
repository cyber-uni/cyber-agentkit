import type { FoundSkill } from '../skills/skill-folder.js'
import { defaultLayer, type ReferenceLayer, type ReferenceLayers } from './reference-layers.js'
import { layerNames } from './resolve-reference.js'

type Source = ReferenceLayers | readonly ReferenceLayer[]

/** One installed skill holding a default contribution of one name. */
export type SkillHolding = { name: string; skill: FoundSkill }

/** Every name each installed skill holds a default of, by name then skill. */
export function skillHoldings(source: Source): SkillHolding[] {
	const skills = Array.isArray(source) ? [] : ((source as ReferenceLayers).skills?.skills ?? [])
	return skills
		.flatMap((skill) => layerNames(defaultLayer(skill.folder)).map((name) => ({ name, skill })))
		.sort((a, b) => a.name.localeCompare(b.name) || a.skill.name.localeCompare(b.skill.name))
}

/** Why some skills' defaults are not listed, when the detected harnesses leave any out. */
export function defaultsUnverified(source: Source): string | undefined {
	return Array.isArray(source) ? undefined : (source as ReferenceLayers).skills?.unverified
}

/** The layers as the skill at `folder` loads a name: its default joins as the `default` tier. */
export function withDefault(source: Source, folder: string): ReferenceLayers {
	const { layers, harnesses, skills } = Array.isArray(source)
		? { layers: source as readonly ReferenceLayer[], harnesses: [], skills: undefined }
		: (source as ReferenceLayers)
	return { layers: [...layers.filter(({ tier }) => tier !== 'default'), defaultLayer(folder)], harnesses, skills }
}
