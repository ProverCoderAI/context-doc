import type { PlatformError as PlatformErrorType } from "@effect/platform/Error"
import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import { Context, Effect, Layer, pipe } from "effect"

import { type SyncError, syncError } from "../sync/types.js"

export type DirectoryEntryKind = "file" | "directory" | "other"

export interface DirectoryEntry {
  readonly name: string
  readonly path: string
  readonly kind: DirectoryEntryKind
}

export class FileSystemService extends Context.Tag("FileSystemService")<
  FileSystemService,
  {
    readonly readFileString: (pathValue: string) => Effect.Effect<string, SyncError>
    readonly readDirectory: (
      pathValue: string
    ) => Effect.Effect<ReadonlyArray<DirectoryEntry>, SyncError>
    readonly makeDirectory: (pathValue: string) => Effect.Effect<void, SyncError>
    readonly copyFile: (
      sourcePath: string,
      destinationPath: string
    ) => Effect.Effect<void, SyncError>
    readonly exists: (pathValue: string) => Effect.Effect<boolean, SyncError>
  }
>() {}

const forEach = Effect.forEach

const resolveEntryPath = (
  path: Path.Path,
  root: string,
  entry: string
): string => (path.isAbsolute(entry) ? entry : path.join(root, entry))

const entryKindFromInfo = (
  info: FileSystem.File.Info
): DirectoryEntryKind => {
  if (info.type === "Directory") {
    return "directory"
  }
  if (info.type === "File") {
    return "file"
  }
  return "other"
}

const toDirectoryEntry = (
  path: Path.Path,
  entryPath: string,
  info: FileSystem.File.Info
): DirectoryEntry => ({
  name: path.basename(entryPath),
  path: entryPath,
  kind: entryKindFromInfo(info)
})

const missingEntry = (
  path: Path.Path,
  entryPath: string
): DirectoryEntry => ({
  name: path.basename(entryPath),
  path: entryPath,
  kind: "other"
})

const isNotFoundError = (error: PlatformErrorType): boolean =>
  error._tag === "SystemError" && error.reason === "NotFound"

// CHANGE: tolerate missing directory entries while traversing sources
// WHY: broken symlinks should not abort sync traversal
// QUOTE(TZ): n/a
// REF: user-2026-01-21-broken-symlink
// SOURCE: n/a
// FORMAT THEOREM: forall e: notFound(e) -> ignored(e)
// PURITY: SHELL
// EFFECT: Effect<DirectoryEntry, SyncError, FileSystem>
// INVARIANT: NotFound entries are classified as kind="other"
// COMPLEXITY: O(1)/O(1)
const readEntry = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  entryPath: string
): Effect.Effect<DirectoryEntry, SyncError> =>
  pipe(
    fs.stat(entryPath),
    Effect.map((info) => toDirectoryEntry(path, entryPath, info)),
    Effect.catchIf(isNotFoundError, () => Effect.succeed(missingEntry(path, entryPath))),
    Effect.mapError(() => syncError(entryPath, "Cannot read directory entry"))
  )

const resolveEntry = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  root: string,
  entry: string
): Effect.Effect<DirectoryEntry, SyncError> => {
  const entryPath = resolveEntryPath(path, root, entry)
  return readEntry(fs, path, entryPath)
}

// CHANGE: wrap filesystem access behind a service for typed errors and testing
// WHY: enforce shell boundary and avoid raw fs usage in logic
// QUOTE(TZ): "Внешние зависимости: только через типизированные интерфейсы"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall p: exists(p) -> readable(p)
// PURITY: SHELL
// EFFECT: Effect<FileSystemService, SyncError, never>
// INVARIANT: readDirectory returns absolute entry paths
// COMPLEXITY: O(n)/O(n)
export const FileSystemLive = Layer.effect(
  FileSystemService,
  Effect.gen(function*(_) {
    const fs = yield* _(FileSystem.FileSystem)
    const path = yield* _(Path.Path)

    const readFileString = (pathValue: string): Effect.Effect<string, SyncError> =>
      pipe(
        fs.readFileString(pathValue, "utf8"),
        Effect.mapError(() => syncError(pathValue, "Cannot read file"))
      )

    const readDirectory = (
      pathValue: string
    ): Effect.Effect<ReadonlyArray<DirectoryEntry>, SyncError> =>
      pipe(
        fs.readDirectory(pathValue),
        Effect.mapError(() => syncError(pathValue, "Cannot read directory")),
        Effect.flatMap((entries) => forEach(entries, (entry) => resolveEntry(fs, path, pathValue, entry)))
      )

    const makeDirectory = (pathValue: string): Effect.Effect<void, SyncError> =>
      pipe(
        fs.makeDirectory(pathValue, { recursive: true }),
        Effect.mapError(() => syncError(pathValue, "Cannot create destination directory structure"))
      )

    const copyFile = (
      sourcePath: string,
      destinationPath: string
    ): Effect.Effect<void, SyncError> =>
      pipe(
        fs.copyFile(sourcePath, destinationPath),
        Effect.mapError(() => syncError(sourcePath, "Cannot copy file into destination"))
      )

    const exists = (pathValue: string): Effect.Effect<boolean, SyncError> =>
      pipe(
        fs.exists(pathValue),
        Effect.mapError(() => syncError(pathValue, "Cannot check path existence"))
      )

    return {
      readFileString,
      readDirectory,
      makeDirectory,
      copyFile,
      exists
    }
  })
)
