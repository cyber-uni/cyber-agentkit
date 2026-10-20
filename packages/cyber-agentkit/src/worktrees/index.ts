export type {
	AcquireErrorCode,
	AcquireOptions,
	AcquireResult,
	CreateWorktreeRequest,
	ExplainOptions,
	SkipReason,
	WorktreeCreator,
	WorktreeCreatorUndo,
	WorktreeVerdict,
} from './acquire.js'
export { AcquireError, acquire, explain, gitWorktreeCreator } from './acquire.js'
export type { DirtyOptions } from './dirty.js'
export { readDirty } from './dirty.js'
export type { Exec } from './exec.js'
export { nodeExec } from './exec.js'
export type { ForgeMergedProbe, LandedSignal } from './landed.js'
export { ghForgeMergedProbe } from './landed.js'
export type { Lease, LeaseFs, LeaseStoreOptions, ReleaseResult } from './lease.js'
export { claimLease, holdsLease, leaseFile, nodeLeaseFs, release } from './lease.js'
export type { ListWorktreesOptions, PrimaryRootOptions, WorktreeEntry } from './list-worktrees.js'
export { listWorktrees, normalizeWorktreePath, primaryRoot } from './list-worktrees.js'
export { slotNumber, slotPath, worktreesDir } from './naming.js'
export type {
	LeftoverProcess,
	LeftoverReason,
	OccupancyOptions,
	ProbeOptions,
	ProcessProbe,
	Session,
	WorktreeOccupancy,
} from './occupancy.js'
export { occupants, probeProcesses } from './occupancy.js'
export type { ClassifyOwnerOptions, LeaseReason, WorktreeOwner, WorktreeOwnerKind } from './owner.js'
export { classifyOwner, LEASE_LIBRARY, parseLeaseReason } from './owner.js'
export type { ProcessInfo, ProcessSource } from './process-source.js'
export { procfsProcessSource } from './process-source.js'
export type { PruneOutcome, PruneReport, PruneSkipReason, PruneWorktreesOptions } from './prune-worktrees.js'
export { pruneWorktrees } from './prune-worktrees.js'
export type { RemoveWorktreeOptions } from './remove-worktree.js'
export { removeWorktree } from './remove-worktree.js'
export type {
	SeedFs,
	SeedInventory,
	SeedSkip,
	SeedSkipReason,
	SeedWorktreeOptions,
} from './seed-worktree.js'
export { nodeSeedFs, seedWorktree, WORKTREE_INCLUDE } from './seed-worktree.js'
export type { SessionHarnessId } from './session-signatures.js'
