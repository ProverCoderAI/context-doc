import * as Path from "@effect/platform/Path"
import { Console, Effect, Match, pipe } from "effect"

import { type DirectoryEntry, FileSystemService } from "../services/file-system.js"
import { type SyncError, syncError, type SyncOptions, type SyncSource } from "./types.js"

const forEach = Effect.forEach

type FilteredSourceEnv<R> = R | FileSystemService | Path.Path

const ensureDirectory = (
  directory: string
): Effect.Effect<void, SyncError, FileSystemService> =>
  Effect.gen(function*(_) {
    const fs = yield* _(FileSystemService)
    yield* _(fs.makeDirectory(directory))
  })

// CHANGE: expose recursive traversal for callers that filter by entry
// WHY: reuse traversal logic across sources without duplicating Match logic
// QUOTE(TZ): "минимальный корректный diff"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall f: collectFiles(root, p) -> p(f) => exists(f)
// PURITY: SHELL
// EFFECT: Effect<ReadonlyArray<string>, SyncError, FileSystemService>
// INVARIANT: returned paths are absolute and exist in traversal
// COMPLEXITY: O(n)/O(n)
export const collectFiles = (
  root: string,
  isRelevant: (entry: DirectoryEntry) => boolean
): Effect.Effect<ReadonlyArray<string>, SyncError, FileSystemService> =>
  Effect.gen(function*(_) {
    const fs = yield* _(FileSystemService)
    const entries = yield* _(fs.readDirectory(root))
    const chunks = yield* _(
      forEach(entries, (entry) =>
        Match.value(entry.kind).pipe(
          Match.when("directory", () => collectFiles(entry.path, isRelevant)),
          Match.when("file", () => isRelevant(entry) ? Effect.succeed([entry.path]) : Effect.succeed([])),
          Match.when("other", () => Effect.succeed([])),
          Match.exhaustive
        ))
    )
    return chunks.flat()
  })

// CHANGE: share relative path copy for multiple sync sources
// WHY: avoid repeating path math in each source
// QUOTE(TZ): "SHELL → CORE (but not наоборот)"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall f: copy(f) -> relative(f) preserved
// PURITY: SHELL
// EFFECT: Effect<void, SyncError, FileSystemService | Path>
// INVARIANT: destination preserves source-relative path
// COMPLEXITY: O(1)/O(1)
export const copyFilePreservingRelativePath = (
  sourceRoot: string,
  destinationRoot: string,
  filePath: string
): Effect.Effect<void, SyncError, FileSystemService | Path.Path> =>
  Effect.gen(function*(_) {
    const fs = yield* _(FileSystemService)
    const path = yield* _(Path.Path)
    const relative = path.relative(sourceRoot, filePath)
    const targetPath = path.join(destinationRoot, relative)
    yield* _(fs.makeDirectory(path.dirname(targetPath)))
    yield* _(fs.copyFile(filePath, targetPath))
  })

// CHANGE: expose reusable first-match search with effectful predicate
// WHY: remove duplicated recursive search logic across sources
// QUOTE(TZ): "минимальный корректный diff"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall c: match(c) -> returns first c
// PURITY: SHELL
// EFFECT: Effect<string | undefined, SyncError, R>
// INVARIANT: result is undefined iff no candidate matches
// COMPLEXITY: O(n)/O(1)
export const findFirstMatching = <R>(
  candidates: ReadonlyArray<string>,
  matches: (candidate: string) => Effect.Effect<boolean, SyncError, R>
): Effect.Effect<string | undefined, SyncError, R> => {
  const loop = (
    remaining: ReadonlyArray<string>
  ): Effect.Effect<string | undefined, SyncError, R> =>
    Effect.gen(function*(_) {
      const [candidate, ...rest] = remaining
      if (candidate === undefined) {
        return
      }
      const matched = yield* _(matches(candidate))
      if (!matched) {
        return yield* _(loop(rest))
      }
      return candidate
    })

  return loop(candidates)
}

// CHANGE: ensure destination directory is created through Effect-typed fs
// WHY: keep IO effects inside SHELL and reuse in sync flows
// QUOTE(TZ): "SHELL: Все эффекты изолированы в тонкой оболочке"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall d: ensureDirectory(d) -> exists(d)
// PURITY: SHELL
// EFFECT: Effect<void, SyncError, FileSystemService>
// INVARIANT: directory exists after successful effect
// COMPLEXITY: O(1)/O(1)
export const ensureDestination = ensureDirectory

// CHANGE: resolve project root for cwd-based matching and destination paths
// WHY: allow running from sub-packages while targeting the repo root
// QUOTE(TZ): "передай root-path на основную папку"
// REF: user-2026-01-19-project-root
// SOURCE: n/a
// FORMAT THEOREM: forall o: root(o) = resolve(o.projectRoot ?? o.cwd)
// PURITY: SHELL
// EFFECT: n/a
// INVARIANT: resolved root is absolute
// COMPLEXITY: O(1)/O(1)
export const resolveProjectRoot = (
  path: Path.Path,
  options: SyncOptions
): string => path.resolve(options.projectRoot ?? options.cwd)

// CHANGE: copy filtered files with typed errors and deterministic traversal
// WHY: reuse shared traversal logic for Qwen/Claude syncs
// QUOTE(TZ): "FUNCTIONAL CORE, IMPERATIVE SHELL"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall f: relevant(f) -> copied(f)
// PURITY: SHELL
// EFFECT: Effect<number, SyncError, FileSystemService | Path>
// INVARIANT: copied count equals length of relevant files
// COMPLEXITY: O(n)/O(n)
export const copyFilteredFiles = (
  sourceRoot: string,
  destinationRoot: string,
  isRelevant: (entry: DirectoryEntry, fullPath: string) => boolean,
  errorReason: string
): Effect.Effect<number, SyncError, FileSystemService | Path.Path> =>
  pipe(
    Effect.gen(function*(_) {
      const files = yield* _(collectFiles(sourceRoot, (entry) => isRelevant(entry, entry.path)))
      yield* _(
        forEach(files, (filePath) => copyFilePreservingRelativePath(sourceRoot, destinationRoot, filePath))
      )
      return files.length
    }),
    Effect.mapError(() => syncError(sourceRoot, errorReason))
  )

// CHANGE: build a SyncSource using shared filtered copy logic
// WHY: eliminate repeated source definitions for file-extension based syncs
// QUOTE(TZ): "минимальный корректный diff"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall s: createFilteredSource(s) -> copyFilteredFiles(s)
// PURITY: SHELL
// EFFECT: Effect<number, SyncError, R>
// INVARIANT: copy uses shared filter predicate
// COMPLEXITY: O(n)/O(n)
export const createFilteredSource = <R>(params: {
  readonly name: SyncSource<FilteredSourceEnv<R>>["name"]
  readonly destSubdir: SyncSource<FilteredSourceEnv<R>>["destSubdir"]
  readonly resolveSource: SyncSource<FilteredSourceEnv<R>>["resolveSource"]
  readonly filter: (entry: DirectoryEntry, fullPath: string) => boolean
  readonly errorReason: string
}): SyncSource<FilteredSourceEnv<R>> => ({
  name: params.name,
  destSubdir: params.destSubdir,
  resolveSource: params.resolveSource,
  copy: (sourceDir, destinationDir) => copyFilteredFiles(sourceDir, destinationDir, params.filter, params.errorReason)
})

// CHANGE: standardize per-source sync orchestration with skip-on-error logging
// WHY: keep the shell thin and consistent for all sources
// QUOTE(TZ): "SHELL → CORE (but not наоборот)"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall s: runSyncSource(s) -> logs(s)
// PURITY: SHELL
// EFFECT: Effect<void, never, FileSystemService | Path>
// INVARIANT: source==destination implies no copy
// COMPLEXITY: O(n)/O(n)
export const runSyncSource = <R>(
  source: SyncSource<R>,
  options: SyncOptions
): Effect.Effect<void, never, R | FileSystemService | Path.Path> =>
  pipe(
    Effect.gen(function*(_) {
      const path = yield* _(Path.Path)
      const resolvedSource = yield* _(source.resolveSource(options))
      const destination = path.join(
        resolveProjectRoot(path, options),
        ".knowledge",
        source.destSubdir
      )

      if (path.resolve(resolvedSource) === path.resolve(destination)) {
        yield* _(
          Console.log(
            `${source.name}: source equals destination; skipping copy to avoid duplicates`
          )
        )
        return
      }

      yield* _(ensureDirectory(destination))
      const copied = yield* _(source.copy(resolvedSource, destination, options))
      yield* _(
        Console.log(
          `${source.name}: copied ${copied} files from ${resolvedSource} to ${destination}`
        )
      )
    }),
    Effect.matchEffect({
      onFailure: (error: SyncError) =>
        Console.log(
          `${source.name}: source not found; skipped syncing (${error.reason})`
        ),
      onSuccess: () => Effect.void
    })
  )
