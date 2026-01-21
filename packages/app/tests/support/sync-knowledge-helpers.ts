import { NodeContext } from "@effect/platform-node"
import type { PlatformError as PlatformErrorType } from "@effect/platform/Error"
import type * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import { expect } from "@effect/vitest"
import { Effect, Layer, Option, pipe } from "effect"

import type { CryptoError } from "../../src/shell/services/crypto.js"
import { CryptoService, CryptoServiceLive } from "../../src/shell/services/crypto.js"
import { FileSystemLive } from "../../src/shell/services/file-system.js"
import { RuntimeEnv } from "../../src/shell/services/runtime-env.js"
import { buildSyncProgram } from "../../src/shell/sync/index.js"
import type { SyncOptions } from "../../src/shell/sync/types.js"
import { buildTestPaths, makeTempDir, withFsPath, writeFile } from "./fs-helpers.js"

const forEach = Effect.forEach
const some = Option.some

const mapFileEntry = (
  sessionDir: string,
  fs: FileSystem.FileSystem,
  path: Path.Path
) =>
(entry: string) =>
  pipe(
    fs.stat(path.join(sessionDir, entry)),
    Effect.map((info) => info.type === "File" ? some(entry) : Option.none())
  )

const testPaths = buildTestPaths(
  new URL(import.meta.url),
  "context-doc-tests"
)

const withTempDir = Effect.gen(function*(_) {
  const { tempBase } = yield* _(testPaths)
  return yield* _(makeTempDir(tempBase, "context-doc-"))
})

const createBrokenSymlink = (linkPath: string, targetPath: string) =>
  withFsPath((fs, path) =>
    Effect.gen(function*(_) {
      yield* _(fs.makeDirectory(path.dirname(linkPath), { recursive: true }))
      yield* _(fs.symlink(targetPath, linkPath))
    })
  )

const makeRuntimeEnvLayerWithHome = (
  cwd: string,
  homedir: string
): Layer.Layer<RuntimeEnv> =>
  Layer.succeed(RuntimeEnv, {
    argv: Effect.succeed(["node", "main"]),
    cwd: Effect.succeed(cwd),
    homedir: Effect.succeed(homedir),
    envVar: () => Effect.succeed(Option.none())
  })

const makeRuntimeEnvLayer = (cwd: string): Layer.Layer<RuntimeEnv> => makeRuntimeEnvLayerWithHome(cwd, cwd)

const assertSyncOutput = (
  destDir: string,
  qwenHash: string,
  cwd: string,
  expectedMessage: string,
  skippedMessage: string
) =>
  withFsPath((fs, path) =>
    Effect.gen(function*(_) {
      const sessionDir = path.join(destDir, "sessions/2025/11")
      const entries = yield* _(fs.readDirectory(sessionDir))
      const files = yield* _(
        forEach(entries, mapFileEntry(sessionDir, fs, path))
      )
      const copiedFiles = files.flatMap((entry) => Option.isSome(entry) ? [entry.value] : [])

      expect(copiedFiles).toEqual(["match.jsonl"])

      const content = yield* _(
        fs.readFileString(path.join(sessionDir, "match.jsonl"))
      )

      expect(content).toContain(`"message":"${expectedMessage}"`)
      expect(content).not.toContain(`"message":"${skippedMessage}"`)

      const qwenCopied = path.join(
        cwd,
        ".knowledge",
        ".qwen",
        qwenHash,
        "chats",
        "session-1.json"
      )

      const exists = yield* _(fs.exists(qwenCopied))
      expect(exists).toBe(true)
    })
  )

type SyncScenarioContext = {
  readonly path: Path.Path
  readonly cwd: string
  readonly codexDir: string
  readonly destDir: string
  readonly qwenSource: string
  readonly qwenHash: string
}

type SyncScenarioOverrides = {
  readonly codexSourceDir?: (path: Path.Path, cwd: string) => string
  readonly extraSetup?: (
    context: SyncScenarioContext
  ) => Effect.Effect<void, PlatformErrorType, FileSystem.FileSystem | Path.Path>
  readonly options?: (context: SyncScenarioContext) => SyncOptions
  readonly runtimeEnv?: (context: SyncScenarioContext) => Layer.Layer<RuntimeEnv>
}

const resolveCodexDir = (
  path: Path.Path,
  cwd: string,
  overrides?: SyncScenarioOverrides
): string => overrides?.codexSourceDir?.(path, cwd) ?? path.join(cwd, ".codex")

const buildScenarioContext = (
  path: Path.Path,
  cwd: string,
  overrides?: SyncScenarioOverrides
): Effect.Effect<SyncScenarioContext, CryptoError, CryptoService> =>
  Effect.gen(function*(_) {
    const crypto = yield* _(CryptoService)
    const codexDir = resolveCodexDir(path, cwd, overrides)
    const destDir = path.join(cwd, ".knowledge", ".codex")
    const qwenSource = path.join(cwd, ".qwen", "tmp")
    const qwenHash = yield* _(crypto.sha256(cwd))
    return {
      path,
      cwd,
      codexDir,
      destDir,
      qwenSource,
      qwenHash
    }
  })

const writeCodexFixtures = (
  context: SyncScenarioContext,
  matchMessage: string,
  skippedMessage: string
): Effect.Effect<void, PlatformErrorType, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function*(_) {
    yield* _(
      writeFile(
        context.path.join(context.codexDir, "sessions/2025/11/match.jsonl"),
        [
          JSON.stringify({ cwd: context.cwd, message: matchMessage }),
          JSON.stringify({
            payload: { cwd: context.path.join(context.cwd, "sub") }
          })
        ].join("\n")
      )
    )

    yield* _(
      writeFile(
        context.path.join(context.codexDir, "sessions/2025/11/ignore.jsonl"),
        [
          JSON.stringify({
            cwd: "/home/user/other",
            message: skippedMessage
          })
        ].join("\n")
      )
    )
  })

const writeQwenFixture = (
  context: SyncScenarioContext
): Effect.Effect<void, PlatformErrorType, FileSystem.FileSystem | Path.Path> =>
  writeFile(
    context.path.join(context.qwenSource, context.qwenHash, "chats", "session-1.json"),
    JSON.stringify({ sessionId: "s1", projectHash: context.qwenHash })
  )

const runExtraSetup = (
  context: SyncScenarioContext,
  overrides?: SyncScenarioOverrides
): Effect.Effect<void, PlatformErrorType, FileSystem.FileSystem | Path.Path> =>
  overrides?.extraSetup?.(context) ?? Effect.void

const resolveOptions = (
  context: SyncScenarioContext,
  overrides?: SyncScenarioOverrides
): SyncOptions =>
  overrides?.options?.(context) ?? {
    cwd: context.cwd,
    sourceDir: context.codexDir,
    destinationDir: context.destDir,
    qwenSourceDir: context.qwenSource
  }

const resolveRuntimeEnv = (
  context: SyncScenarioContext,
  overrides?: SyncScenarioOverrides
): Layer.Layer<RuntimeEnv> => overrides?.runtimeEnv?.(context) ?? makeRuntimeEnvLayer(context.cwd)

const runSyncScenarioWithSetup = (
  matchMessage: string,
  skippedMessage: string,
  overrides?: SyncScenarioOverrides
) =>
  Effect.scoped(
    Effect.gen(function*(_) {
      const path = yield* _(Path.Path)
      const cwd = yield* _(withTempDir)
      const context = yield* _(buildScenarioContext(path, cwd, overrides))
      yield* _(writeCodexFixtures(context, matchMessage, skippedMessage))
      yield* _(runExtraSetup(context, overrides))
      yield* _(writeQwenFixture(context))
      const options = resolveOptions(context, overrides)
      const runtimeEnv = resolveRuntimeEnv(context, overrides)
      yield* _(Effect.provide(buildSyncProgram(options), Layer.mergeAll(FileSystemLive, runtimeEnv)))
      yield* _(assertSyncOutput(context.destDir, context.qwenHash, context.cwd, matchMessage, skippedMessage))
    })
  ).pipe(
    Effect.provide(Layer.mergeAll(NodeContext.layer, CryptoServiceLive))
  )

export const runSyncScenario = (
  matchMessage: string,
  skippedMessage: string
) => runSyncScenarioWithSetup(matchMessage, skippedMessage)

export const runSyncScenarioWithBrokenSymlink = (
  matchMessage: string,
  skippedMessage: string
) =>
  runSyncScenarioWithSetup(matchMessage, skippedMessage, {
    extraSetup: (context) =>
      createBrokenSymlink(
        context.path.join(context.codexDir, "broken-symlink"),
        context.path.join(context.cwd, "missing-target")
      )
  })

export const runSyncScenarioFromHomeCodex = (
  matchMessage: string,
  skippedMessage: string
) =>
  runSyncScenarioWithSetup(matchMessage, skippedMessage, {
    codexSourceDir: (path, cwd) => path.join(cwd, "home", ".codex"),
    extraSetup: (context) =>
      createBrokenSymlink(
        context.path.join(context.codexDir, "broken-home-symlink"),
        context.path.join(context.cwd, "missing-home-target")
      ),
    options: (context) => ({
      cwd: context.cwd,
      destinationDir: context.destDir,
      qwenSourceDir: context.qwenSource
    }),
    runtimeEnv: (context) =>
      makeRuntimeEnvLayerWithHome(
        context.cwd,
        context.path.join(context.cwd, "home")
      )
  })
