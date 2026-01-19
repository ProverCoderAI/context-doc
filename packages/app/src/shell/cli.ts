import { Effect } from "effect"

import { RuntimeEnv } from "./services/runtime-env.js"
import type { SyncOptions } from "./sync/types.js"

type CliKey = Exclude<keyof SyncOptions, "cwd">

const flagMap = new Map<string, CliKey>([
  ["--project-root", "projectRoot"],
  ["-r", "projectRoot"],
  ["--source", "sourceDir"],
  ["-s", "sourceDir"],
  ["--dest", "destinationDir"],
  ["-d", "destinationDir"],
  ["--project-url", "repositoryUrlOverride"],
  ["--project-name", "repositoryUrlOverride"],
  ["--meta-root", "metaRoot"],
  ["--qwen-source", "qwenSourceDir"],
  ["--claude-projects", "claudeProjectsRoot"]
])

const parseArgs = (args: ReadonlyArray<string>, cwd: string): SyncOptions => {
  let result: SyncOptions = { cwd }

  let index = 0
  while (index < args.length) {
    const arg = args[index]
    if (arg === undefined) {
      index += 1
      continue
    }
    const key = flagMap.get(arg)
    if (key === undefined) {
      index += 1
      continue
    }

    const value = args[index + 1]
    if (value !== undefined) {
      result = { ...result, [key]: value }
      index += 2
      continue
    }
    index += 1
  }

  return result
}

/**
 * Reads CLI arguments and builds SyncOptions.
 *
 * @returns Effect with resolved SyncOptions.
 *
 * @pure false - reads process argv/cwd via RuntimeEnv
 * @effect RuntimeEnv
 * @invariant options.cwd is always defined; projectRoot overrides cwd for matching
 * @complexity O(n) where n = |args|
 */
// CHANGE: parse CLI flags with optional project root override
// WHY: allow matching against repo root while running from subpackages
// QUOTE(TZ): "передай root-path на основную папку"
// REF: user-2026-01-19-project-root
// SOURCE: n/a
// FORMAT THEOREM: forall a: parse(a) -> SyncOptions
// PURITY: SHELL
// EFFECT: Effect<SyncOptions, never, RuntimeEnv>
// INVARIANT: unknown flags are ignored
// COMPLEXITY: O(n)/O(1)
export const readSyncOptions = Effect.gen(function*(_) {
  const env = yield* _(RuntimeEnv)
  const argv = yield* _(env.argv)
  const cwd = yield* _(env.cwd)
  return parseArgs(argv.slice(2), cwd)
})
