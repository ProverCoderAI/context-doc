import * as Path from "@effect/platform/Path"
import { Effect, Option, pipe } from "effect"

import { CryptoService } from "../../services/crypto.js"
import { FileSystemService } from "../../services/file-system.js"
import { RuntimeEnv } from "../../services/runtime-env.js"
import { createFilteredSource, findFirstMatching, resolveProjectRoot, runSyncSource } from "../shared.js"
import { type SyncError, syncError, type SyncOptions, type SyncSource } from "../types.js"

type QwenEnv = RuntimeEnv | CryptoService | FileSystemService | Path.Path

const resolveEnvValue = (envValue: Option.Option<string>): string | undefined => Option.getOrUndefined(envValue)

const findFirstExisting = (
  candidates: ReadonlyArray<string>
): Effect.Effect<string | undefined, SyncError, FileSystemService> =>
  findFirstMatching(candidates, (candidate) =>
    Effect.gen(function*(_) {
      const fs = yield* _(FileSystemService)
      return yield* _(fs.exists(candidate))
    }))

const resolveQwenSourceDir = (
  options: SyncOptions
): Effect.Effect<string, SyncError, QwenEnv> =>
  Effect.gen(function*(_) {
    const env = yield* _(RuntimeEnv)
    const crypto = yield* _(CryptoService)
    const path = yield* _(Path.Path)
    const projectRoot = resolveProjectRoot(path, options)
    const hash = yield* _(
      pipe(
        crypto.sha256(projectRoot),
        Effect.mapError((error) => syncError(".qwen", error.reason))
      )
    )
    const envSource = resolveEnvValue(yield* _(env.envVar("QWEN_SOURCE_DIR")))
    const homeDir = yield* _(env.homedir)
    let baseFromMeta: string | undefined
    if (options.metaRoot !== undefined) {
      baseFromMeta = options.metaRoot.endsWith(".qwen")
        ? options.metaRoot
        : path.join(options.metaRoot, ".qwen")
    }
    const metaKnowledge = options.metaRoot === undefined
      ? undefined
      : path.join(options.metaRoot, ".knowledge", ".qwen")
    const homeBase = path.join(homeDir, ".qwen")
    const homeKnowledge = path.join(homeDir, ".knowledge", ".qwen")

    const candidates = [
      options.qwenSourceDir,
      envSource,
      baseFromMeta ? path.join(baseFromMeta, "tmp", hash) : undefined,
      path.join(projectRoot, ".qwen", "tmp", hash),
      path.join(projectRoot, ".knowledge", ".qwen", "tmp", hash),
      metaKnowledge ? path.join(metaKnowledge, "tmp", hash) : undefined,
      path.join(homeBase, "tmp", hash),
      path.join(homeKnowledge, "tmp", hash)
    ].filter((candidate): candidate is string => candidate !== undefined)

    const found = yield* _(findFirstExisting(candidates))
    if (found === undefined) {
      return yield* _(
        Effect.fail(
          syncError(
            ".qwen",
            `Qwen source directory is missing for hash ${hash}`
          )
        )
      )
    }

    return found
  })

const qwenSource: SyncSource<QwenEnv> = createFilteredSource({
  name: "Qwen",
  destSubdir: ".qwen",
  resolveSource: resolveQwenSourceDir,
  filter: (entry, fullPath) => entry.kind === "file" && fullPath.endsWith(".json"),
  errorReason: "Cannot traverse Qwen directory"
})

// CHANGE: sync Qwen dialog files through shared sync runner
// WHY: keep source-specific resolution isolated and reuse copy/traversal logic
// QUOTE(TZ): "SHELL: Все эффекты (IO, сеть, БД, env/process) изолированы"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall f: json(f) -> copied(f)
// PURITY: SHELL
// EFFECT: Effect<void, never, FileSystemService | RuntimeEnv | CryptoService | Path>
// INVARIANT: only .json files are copied
// COMPLEXITY: O(n)/O(n)
export const syncQwen = (
  options: SyncOptions
): Effect.Effect<void, never, QwenEnv> => runSyncSource(qwenSource, options)
