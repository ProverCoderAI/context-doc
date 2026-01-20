import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import { Effect, pipe } from "effect"

const accessFsPath = Effect.gen(function*(_) {
  const fs = yield* _(FileSystem.FileSystem)
  const path = yield* _(Path.Path)
  return { fs, path }
})

export const withFsPath = <A, E, R>(
  fn: (fs: FileSystem.FileSystem, path: Path.Path) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, FileSystem.FileSystem | Path.Path | R> =>
  pipe(
    accessFsPath,
    Effect.flatMap(({ fs, path }) => fn(fs, path))
  )

export const writeFile = (filePath: string, content: string) =>
  withFsPath((fs, path) =>
    Effect.gen(function*(_) {
      yield* _(fs.makeDirectory(path.dirname(filePath), { recursive: true }))
      yield* _(fs.writeFileString(filePath, content))
    })
  )

export const makeTempDir = (base: string, prefix: string) =>
  withFsPath((fs, _path) =>
    Effect.gen(function*(_) {
      yield* _(fs.makeDirectory(base, { recursive: true }))
      return yield* _(fs.makeTempDirectoryScoped({ directory: base, prefix }))
    })
  )

export const buildTestPaths = (
  testUrl: URL,
  tempName: string,
  packName?: string
) =>
  Effect.gen(function*(_) {
    const path = yield* _(Path.Path)
    const testFile = yield* _(path.fromFileUrl(testUrl))
    const testRoot = path.dirname(testFile)
    const projectRoot = path.resolve(testRoot, "../../../..")
    const tempBase = path.join(projectRoot, ".tmp", tempName)
    const packBase = packName === undefined
      ? undefined
      : path.join(projectRoot, ".tmp", packName)
    return { projectRoot, tempBase, packBase }
  })
