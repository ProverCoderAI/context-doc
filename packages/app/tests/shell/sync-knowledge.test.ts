import { NodeContext } from "@effect/platform-node"
import type * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option, pipe } from "effect"
import fc from "fast-check"

import { CryptoService, CryptoServiceLive } from "../../src/shell/services/crypto.js"
import { FileSystemLive } from "../../src/shell/services/file-system.js"
import { RuntimeEnv } from "../../src/shell/services/runtime-env.js"
import { buildSyncProgram } from "../../src/shell/sync/index.js"
import { buildTestPaths, makeTempDir, withFsPath, writeFile } from "../support/fs-helpers.js"

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

const makeRuntimeEnvLayer = (cwd: string): Layer.Layer<RuntimeEnv> =>
  Layer.succeed(RuntimeEnv, {
    argv: Effect.succeed(["node", "main"]),
    cwd: Effect.succeed(cwd),
    homedir: Effect.succeed(cwd),
    envVar: () => Effect.succeed(Option.none())
  })

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

const runSyncScenario = (
  matchMessage: string,
  skippedMessage: string
) =>
  Effect.scoped(
    Effect.gen(function*(_) {
      const path = yield* _(Path.Path)
      const crypto = yield* _(CryptoService)
      const cwd = yield* _(withTempDir)
      const codexDir = path.join(cwd, ".codex")
      const destDir = path.join(cwd, ".knowledge", ".codex")
      const qwenSource = path.join(cwd, ".qwen", "tmp")
      const qwenHash = yield* _(crypto.sha256(cwd))
      yield* _(
        writeFile(
          path.join(codexDir, "sessions/2025/11/match.jsonl"),
          [
            JSON.stringify({ cwd, message: matchMessage }),
            JSON.stringify({
              payload: { cwd: path.join(cwd, "sub") }
            })
          ].join("\n")
        )
      )

      yield* _(
        writeFile(
          path.join(codexDir, "sessions/2025/11/ignore.jsonl"),
          [
            JSON.stringify({
              cwd: "/home/user/other",
              message: skippedMessage
            })
          ].join("\n")
        )
      )

      yield* _(
        writeFile(
          path.join(qwenSource, qwenHash, "chats", "session-1.json"),
          JSON.stringify({ sessionId: "s1", projectHash: qwenHash })
        )
      )

      yield* _(
        Effect.provide(
          buildSyncProgram({
            cwd,
            sourceDir: codexDir,
            destinationDir: destDir,
            qwenSourceDir: qwenSource
          }),
          Layer.mergeAll(FileSystemLive, makeRuntimeEnvLayer(cwd))
        )
      )

      yield* _(assertSyncOutput(destDir, qwenHash, cwd, matchMessage, skippedMessage))
    })
  ).pipe(
    Effect.provide(Layer.mergeAll(NodeContext.layer, CryptoServiceLive))
  )

describe("sync-knowledge end-to-end", () => {
  const safeChar = fc.constantFrom(
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "g",
    "h",
    "i",
    "j",
    "k",
    "l",
    "m",
    "n",
    "o",
    "p",
    "q",
    "r",
    "s",
    "t",
    "u",
    "v",
    "w",
    "x",
    "y",
    "z",
    "0",
    "1",
    "2",
    "3",
    "4",
    "5"
  )
  const message: fc.Arbitrary<string> = fc.string({
    minLength: 1,
    maxLength: 12,
    unit: safeChar
  })
  const messagePair: fc.Arbitrary<[string, string]> = fc
    .tuple(message, message)
    .filter((pair) => pair[0] !== pair[1])

  it.effect("copies matching Codex files and Qwen json", () =>
    Effect.tryPromise({
      try: () =>
        fc.assert(
          fc.asyncProperty(
            messagePair,
            ([matchMessage, skippedMessage]: [string, string]) =>
              Effect.runPromise(runSyncScenario(matchMessage, skippedMessage))
          ),
          { numRuns: 5 }
        ),
      catch: (error) => error instanceof Error ? error : new Error(String(error))
    }))
})
