import type * as Fx from "effect"

export interface SyncError {
  readonly _tag: "SyncError"
  readonly path: string
  readonly reason: string
}

export interface SyncOptions {
  readonly cwd: string
  readonly projectRoot?: string
  readonly sourceDir?: string
  readonly destinationDir?: string
  readonly repositoryUrlOverride?: string
  readonly metaRoot?: string
  readonly qwenSourceDir?: string
  readonly claudeProjectsRoot?: string
}

export type SyncEffect<A, R = never> = Fx.Effect.Effect<A, SyncError, R>

export interface SyncSource<R> {
  readonly name: string
  readonly destSubdir: ".codex" | ".qwen" | ".claude"
  readonly resolveSource: (options: SyncOptions) => SyncEffect<string, R>
  readonly copy: (
    sourceDir: string,
    destinationDir: string,
    options: SyncOptions
  ) => SyncEffect<number, R>
}

// CHANGE: centralize sync-specific types to keep shell modules consistent
// WHY: shared types and error model simplify composition and testing
// QUOTE(TZ): "Ошибки: типизированы в сигнатурах функций"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall e: SyncError -> typed(e)
// PURITY: SHELL
// EFFECT: n/a
// INVARIANT: SyncError contains path and reason for logging
// COMPLEXITY: O(1)/O(1)
export const syncError = (pathValue: string, reason: string): SyncError => ({
  _tag: "SyncError",
  path: pathValue,
  reason
})
