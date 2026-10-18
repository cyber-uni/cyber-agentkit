import type { HarnessId } from '../harness/harness-id.js'

/**
 * Whether a harness lets a plugin declare other plugins it depends on. Only Claude Code does, via
 * `dependencies` in `plugin.json` (E-CC-X1). The other harnesses' manifests have no such field
 * (E-CUR-X1, E-CODEX-X1, E-COPILOT-X1, E-OC-X1, E-KILO-X1, E-GEM-P4, E-QWEN-P3, E-VSC-X1,
 * E-CLINE-X1, E-CRUSH-X1, E-OH-X1, E-AUG-X1).
 */
export function supportsPluginDependencies(harness: HarnessId): boolean {
	return harness === 'claude-code'
}
