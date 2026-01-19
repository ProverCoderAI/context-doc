import { Effect, pipe } from "effect"

import { readSyncOptions } from "../shell/cli.js"
import { buildSyncProgram } from "../shell/sync/index.js"

/**
 * Compose the knowledge sync CLI as a single effect.
 *
 * @returns Effect that runs multi-source sync in sequence.
 *
 * @pure false - reads argv and performs filesystem IO
 * @effect RuntimeEnv, FileSystemService, CryptoService, Path
 * @invariant forall opts: buildSyncProgram(opts) runs each source exactly once
 * @precondition true
 * @postcondition sources are synced or skipped with logs
 * @complexity O(n) where n = number of files scanned
 * @throws Never - all errors are typed in the Effect error channel
 */
// CHANGE: rewire program to knowledge-sync orchestration
// WHY: replace greeting demo with the fully effectful sync pipeline
// QUOTE(TZ): "Возьми прошлый ... код и перепиши его полностью"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall a: parse(a) -> run(sync(a))
// PURITY: SHELL
// EFFECT: Effect<void, never, RuntimeEnv | FileSystemService | CryptoService | Path>
// INVARIANT: sync sources run in deterministic order
// COMPLEXITY: O(n)/O(n)
export const program = pipe(
  readSyncOptions,
  Effect.flatMap((options) => buildSyncProgram(options))
)
