import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer, pipe } from "effect"

import { CryptoServiceLive } from "../shell/services/crypto.js"
import { FileSystemLive } from "../shell/services/file-system.js"
import { RuntimeEnvLive } from "../shell/services/runtime-env.js"
import { program } from "./program.js"

// CHANGE: run the sync program through the Node runtime with all live layers
// WHY: provide platform services and shell dependencies in one place
// QUOTE(TZ): "SHELL: Все эффекты изолированы"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall env: provide(env) -> runMain(program)
// PURITY: SHELL
// EFFECT: Effect<void, never, RuntimeEnv | FileSystemService | CryptoService | Path>
// INVARIANT: program executed with NodeContext + live services
// COMPLEXITY: O(1)/O(1)
const main = pipe(
  program,
  Effect.provide(
    Layer.provideMerge(
      Layer.mergeAll(RuntimeEnvLive, FileSystemLive, CryptoServiceLive),
      NodeContext.layer
    )
  )
)

NodeRuntime.runMain(main)
