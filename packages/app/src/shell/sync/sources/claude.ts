import * as Path from "@effect/platform/Path"
import { Effect } from "effect"

import { FileSystemService } from "../../services/file-system.js"
import { RuntimeEnv } from "../../services/runtime-env.js"
import { createFilteredSource, resolveProjectRoot, runSyncSource } from "../shared.js"
import { type SyncError, syncError, type SyncOptions, type SyncSource } from "../types.js"

type ClaudeEnv = RuntimeEnv | FileSystemService | Path.Path

const slugFromCwd = (cwd: string): string => `-${cwd.replace(/^\/+/, "").replaceAll("\\", "-").replaceAll("/", "-")}`

const resolveClaudeProjectDir = (
  options: SyncOptions
): Effect.Effect<string, SyncError, ClaudeEnv> =>
  Effect.gen(function*(_) {
    const env = yield* _(RuntimeEnv)
    const homeDir = yield* _(env.homedir)
    const path = yield* _(Path.Path)
    const base = options.claudeProjectsRoot ??
      path.join(homeDir, ".claude", "projects")
    const candidate = path.join(base, slugFromCwd(resolveProjectRoot(path, options)))
    const fs = yield* _(FileSystemService)
    const exists = yield* _(fs.exists(candidate))
    if (!exists) {
      return yield* _(
        Effect.fail(syncError(".claude", "Claude project directory is missing"))
      )
    }

    return candidate
  })

const claudeSource: SyncSource<ClaudeEnv> = createFilteredSource({
  name: "Claude",
  destSubdir: ".claude",
  resolveSource: resolveClaudeProjectDir,
  filter: (entry, fullPath) => entry.kind === "file" && fullPath.endsWith(".jsonl"),
  errorReason: "Cannot traverse Claude project"
})

// CHANGE: sync Claude dialog files through shared sync runner
// WHY: keep Claude-specific path resolution isolated from other sources
// QUOTE(TZ): "SHELL: Все эффекты (IO, сеть, БД, env/process) изолированы"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall f: jsonl(f) -> copied(f)
// PURITY: SHELL
// EFFECT: Effect<void, never, FileSystemService | RuntimeEnv | Path>
// INVARIANT: only .jsonl files are copied
// COMPLEXITY: O(n)/O(n)
export const syncClaude = (
  options: SyncOptions
): Effect.Effect<void, never, ClaudeEnv> => runSyncSource(claudeSource, options)
