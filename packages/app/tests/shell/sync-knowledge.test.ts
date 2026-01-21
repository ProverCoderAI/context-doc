import { describe, it } from "@effect/vitest"
import { Effect } from "effect"
import fc from "fast-check"

import {
  runSyncScenario,
  runSyncScenarioFromHomeCodex,
  runSyncScenarioWithBrokenSymlink
} from "../support/sync-knowledge-helpers.js"

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

  it.effect("ignores broken Codex symlink entries", () =>
    Effect.gen(function*(_) {
      const matchMessage = "match"
      const skippedMessage = "skip"
      yield* _(runSyncScenarioWithBrokenSymlink(matchMessage, skippedMessage))
    }))

  it.effect("finds Codex entries in homedir when local source is missing", () =>
    Effect.gen(function*(_) {
      const matchMessage = "home-match"
      const skippedMessage = "home-skip"
      yield* _(runSyncScenarioFromHomeCodex(matchMessage, skippedMessage))
    }))
})
