import { Context, Effect, Layer, Option } from "effect"

export class RuntimeEnv extends Context.Tag("RuntimeEnv")<
  RuntimeEnv,
  {
    readonly argv: Effect.Effect<ReadonlyArray<string>>
    readonly cwd: Effect.Effect<string>
    readonly homedir: Effect.Effect<string>
    readonly envVar: (key: string) => Effect.Effect<Option.Option<string>>
  }
>() {}

const readProcess = (): NodeJS.Process | undefined => typeof process === "undefined" ? undefined : process

const readEnv = (): NodeJS.ProcessEnv => readProcess()?.env ?? {}

const resolveHomeDir = (env: NodeJS.ProcessEnv, cwdFallback: string): string => {
  const direct = env["HOME"] ?? env["USERPROFILE"]
  if (direct !== undefined) {
    return direct
  }

  const drive = env["HOMEDRIVE"]
  const path = env["HOMEPATH"]
  if (drive !== undefined && path !== undefined) {
    return `${drive}${path}`
  }

  return cwdFallback
}

// CHANGE: wrap process/os access behind a typed Effect service
// WHY: keep shell dependencies injectable and testable
// QUOTE(TZ): "Внешние зависимости: только через типизированные интерфейсы"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall k: env(k) -> Option<string>
// PURITY: SHELL
// EFFECT: Effect<RuntimeEnv, never, never>
// INVARIANT: argv/cwd/homedir are read once per effect
// COMPLEXITY: O(1)/O(1)
export const RuntimeEnvLive = Layer.succeed(RuntimeEnv, {
  argv: Effect.sync(() => {
    const proc = readProcess()
    return proc === undefined ? [] : [...proc.argv]
  }),
  cwd: Effect.sync(() => readProcess()?.cwd() ?? "."),
  homedir: Effect.sync(() => {
    const proc = readProcess()
    const cwdFallback = proc?.cwd() ?? "."
    return resolveHomeDir(readEnv(), cwdFallback)
  }),
  envVar: (key) => Effect.sync(() => Option.fromNullable(readEnv()[key]))
})
