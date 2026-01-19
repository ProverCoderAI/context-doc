import type * as Path from "@effect/platform/Path"
import { Effect } from "effect"

import type { CryptoService } from "../services/crypto.js"
import type { FileSystemService } from "../services/file-system.js"
import type { RuntimeEnv } from "../services/runtime-env.js"
import { syncClaude } from "./sources/claude.js"
import { syncCodex } from "./sources/codex.js"
import { syncQwen } from "./sources/qwen.js"
import type { SyncOptions } from "./types.js"

type SyncProgramEnv = RuntimeEnv | FileSystemService | CryptoService | Path.Path

// CHANGE: compose multi-source sync into a single Effect program
// WHY: centralize orchestration while keeping each source isolated
// QUOTE(TZ): "монодическая композиция"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall s in Sources: run(s) -> synced(s)
// PURITY: SHELL
// EFFECT: Effect<void, never, FileSystemService | RuntimeEnv | CryptoService | Path>
// INVARIANT: sources run sequentially in fixed order
// COMPLEXITY: O(n)/O(n)
export const buildSyncProgram = (
  options: SyncOptions
): Effect.Effect<
  void,
  never,
  SyncProgramEnv
> =>
  Effect.gen(function*(_) {
    yield* _(syncClaude(options))
    yield* _(syncCodex(options))
    yield* _(syncQwen(options))
  })
