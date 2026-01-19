import * as Path from "@effect/platform/Path"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import fc from "fast-check"

import { buildProjectLocator, type JsonValue, valueMatchesProject } from "../../src/core/knowledge.js"

const buildLocator = (root: string) =>
  buildProjectLocator(
    root,
    (candidate) => candidate === root || candidate.startsWith(`${root}/`)
  )

describe("valueMatchesProject", () => {
  const safeChar: fc.Arbitrary<string> = fc.constantFrom(
    "a",
    "b",
    "c",
    "d",
    "e",
    "f",
    "0",
    "1",
    "2",
    "3"
  )
  const segment: fc.Arbitrary<string> = fc.string({
    minLength: 1,
    maxLength: 8,
    unit: safeChar
  })
  const nonRecordValue: fc.Arbitrary<JsonValue> = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.boolean(),
    fc.constant(null),
    fc.array(fc.string(), { maxLength: 5 }),
    fc.array(fc.integer(), { maxLength: 5 }),
    fc.array(fc.boolean(), { maxLength: 5 }),
    fc.array(fc.constant(null), { maxLength: 5 })
  )

  const projectRoot = Effect.gen(function*(_) {
    const path = yield* _(Path.Path)
    const testFile = yield* _(path.fromFileUrl(new URL(import.meta.url)))
    return path.resolve(path.dirname(testFile), "../../../..")
  })

  it.effect("matches by cwd inside project root", () =>
    Effect.gen(function*(_) {
      const root = yield* _(projectRoot)
      const locator = buildLocator(root)
      const insidePath: fc.Arbitrary<string> = fc
        .array(segment, { minLength: 0, maxLength: 4 })
        .map((segments) => segments.length === 0 ? root : `${root}/${segments.join("/")}`)
      fc.assert(
        fc.property(insidePath, (cwd: string) => {
          const value: JsonValue = { cwd }
          expect(valueMatchesProject(value, locator)).toBe(true)
        })
      )
    }).pipe(Effect.provide(Path.layer)))

  it.effect("rejects unrelated records", () =>
    Effect.gen(function*(_) {
      const root = yield* _(projectRoot)
      const path = yield* _(Path.Path)
      const locator = buildLocator(root)
      const outsideBase = path.join(path.dirname(root), "outside")
      const outsidePath: fc.Arbitrary<string> = fc
        .array(segment, { minLength: 0, maxLength: 4 })
        .map((segments) =>
          segments.length === 0
            ? outsideBase
            : `${outsideBase}/${segments.join("/")}`
        )
      fc.assert(
        fc.property(outsidePath, (cwd: string) => {
          const value: JsonValue = { cwd }
          expect(valueMatchesProject(value, locator)).toBe(false)
        })
      )
    }).pipe(Effect.provide(Path.layer)))

  it.effect("rejects non-record values", () =>
    Effect.gen(function*(_) {
      const root = yield* _(projectRoot)
      const locator = buildLocator(root)
      fc.assert(
        fc.property(nonRecordValue, (value: JsonValue) => {
          expect(valueMatchesProject(value, locator)).toBe(false)
        })
      )
    }).pipe(Effect.provide(Path.layer)))
})
