import { NodeContext } from "@effect/platform-node"
import * as Command from "@effect/platform/Command"
import * as Path from "@effect/platform/Path"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, pipe } from "effect"

import { buildTestPaths, makeTempDir, withFsPath, writeFile } from "../support/fs-helpers.js"

const testPaths = buildTestPaths(
  new URL(import.meta.url),
  "context-doc-cli-tests",
  "context-doc-pack-tests"
)

const runCommand = (command: Command.Command) =>
  pipe(
    Command.exitCode(command),
    Effect.flatMap((exitCode) =>
      Number(exitCode) === 0
        ? Effect.void
        : Effect.fail(new Error(`Command failed with exit code ${exitCode}`))
    )
  )

const runCommandOutput = (command: Command.Command) => Command.string(command)

const packCli = Effect.gen(function*(_) {
  const { packBase, projectRoot } = yield* _(testPaths)
  const path = yield* _(Path.Path)
  const packDir = yield* _(
    makeTempDir(
      packBase ?? path.join(projectRoot, ".tmp", "context-doc-pack-tests"),
      "pack-"
    )
  )

  const build = pipe(
    Command.make("pnpm", "--filter", "@prover-coder-ai/context-doc", "build"),
    Command.workingDirectory(projectRoot)
  )
  yield* _(runCommand(build))

  const appDir = path.join(projectRoot, "packages", "app")
  const pack = pipe(
    Command.make("npm", "pack", "--silent", "--pack-destination", packDir),
    Command.workingDirectory(appDir)
  )
  const packOutput = yield* _(runCommandOutput(pack))
  const packLines = packOutput
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const tarballName = packLines.at(-1)
  if (tarballName === undefined) {
    return yield* _(Effect.fail(new Error("Packed tarball name not found in npm output")))
  }
  const tarballPath = path.join(packDir, tarballName)
  const tarballSpec = `file:${tarballPath}`

  const tarballExists = yield* _(
    withFsPath((fs) => fs.exists(tarballPath))
  )
  if (!tarballExists) {
    return yield* _(Effect.fail(new Error("Packed tarball was not created")))
  }

  return { projectRoot, tarballSpec }
})

const prepareProject = Effect.gen(function*(_) {
  const { tempBase } = yield* _(testPaths)
  const path = yield* _(Path.Path)
  const root = yield* _(
    makeTempDir(tempBase, "project-")
  )
  const codexSource = path.join(root, "codex-src")
  const destDir = path.join(root, ".knowledge", ".codex")
  const qwenSource = path.join(root, "qwen-src")

  yield* _(
    writeFile(
      path.join(codexSource, "sessions/2025/11/cli.jsonl"),
      JSON.stringify({ cwd: root, message: "ok" })
    )
  )
  yield* _(
    writeFile(
      path.join(qwenSource, "session-1.json"),
      JSON.stringify({ sessionId: "s1" })
    )
  )

  return { root, codexSource, destDir, qwenSource }
})

type CliRunner = "npx" | "pnpm-dlx"

interface CliRunInput {
  readonly runner: CliRunner
  readonly tarballSpec: string
  readonly root: string
  readonly codexSource: string
  readonly destDir: string
  readonly qwenSource: string
}

const runCliWithRunner = ({
  codexSource,
  destDir,
  qwenSource,
  root,
  runner,
  tarballSpec
}: CliRunInput) =>
  Effect.gen(function*(_) {
    const { projectRoot } = yield* _(testPaths)
    const args = [
      "--project-root",
      root,
      "--source",
      codexSource,
      "--dest",
      destDir,
      "--qwen-source",
      qwenSource
    ]
    const command = pipe(
      runner === "npx"
        ? Command.make("npx", "-y", tarballSpec, ...args)
        : Command.make("pnpm", "dlx", tarballSpec, ...args),
      Command.workingDirectory(projectRoot)
    )
    yield* _(runCommand(command))
  })

const assertCopied = (root: string, destDir: string) =>
  withFsPath((fs, path) =>
    Effect.gen(function*(_) {
      const codexFile = path.join(destDir, "sessions/2025/11/cli.jsonl")
      const codexExists = yield* _(fs.exists(codexFile))
      expect(codexExists).toBe(true)

      const qwenFile = path.join(root, ".knowledge", ".qwen", "session-1.json")
      const qwenExists = yield* _(fs.exists(qwenFile))
      expect(qwenExists).toBe(true)
    })
  )

describe("cli package execution", () => {
  it.effect("packs the CLI and executes it via npx", () =>
    Effect.scoped(
      Effect.gen(function*(_) {
        const { tarballSpec } = yield* _(packCli)
        const { codexSource, destDir, qwenSource, root } = yield* _(
          prepareProject
        )
        yield* _(
          runCliWithRunner({
            runner: "npx",
            tarballSpec,
            root,
            codexSource,
            destDir,
            qwenSource
          })
        )
        yield* _(assertCopied(root, destDir))
        const second = yield* _(prepareProject)
        yield* _(
          runCliWithRunner({
            runner: "pnpm-dlx",
            tarballSpec,
            root: second.root,
            codexSource: second.codexSource,
            destDir: second.destDir,
            qwenSource: second.qwenSource
          })
        )
        yield* _(assertCopied(second.root, second.destDir))
      })
    ).pipe(
      Effect.provide(Layer.mergeAll(NodeContext.layer))
    ), 30_000)
})
