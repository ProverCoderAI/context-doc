import { Option, pipe } from "effect"

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | ReadonlyArray<JsonValue> | JsonRecord
export interface JsonRecord {
  readonly [key: string]: JsonValue
}

export interface ProjectLocator {
  readonly normalizedCwd: string
  readonly isWithinRoot: (candidate: string) => boolean
}

interface RecordMetadata {
  readonly cwd: Option.Option<string>
}

const isJsonRecord = (value: JsonValue): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const pickString = (record: JsonRecord, key: string): Option.Option<string> => {
  const candidate = record[key]
  return Option.fromNullable(typeof candidate === "string" ? candidate : null)
}

const pickRecord = (record: JsonRecord, key: string): Option.Option<JsonRecord> =>
  pipe(
    record[key],
    Option.fromNullable,
    Option.filter((value) => isJsonRecord(value))
  )

const extractCwd = (record: JsonRecord): Option.Option<string> =>
  pipe(
    pickString(record, "cwd"),
    Option.orElse(() =>
      pipe(
        pickRecord(record, "payload"),
        Option.flatMap((payload) => pickString(payload, "cwd"))
      )
    )
  )

const toMetadata = (value: JsonValue): RecordMetadata => {
  if (!isJsonRecord(value)) {
    return { cwd: Option.none() }
  }

  return {
    cwd: extractCwd(value)
  }
}

const cwdMatches = (metadata: RecordMetadata, locator: ProjectLocator): boolean =>
  Option.exists(metadata.cwd, (cwdValue) => locator.isWithinRoot(cwdValue))

const metadataMatches = (
  metadata: RecordMetadata,
  locator: ProjectLocator
): boolean => cwdMatches(metadata, locator)

/**
 * Builds a locator for matching project-scoped metadata.
 *
 * @param normalizedCwd - Pre-normalized cwd of the project root.
 * @param isWithinRoot - Pure predicate for checking candidate cwd membership.
 * @returns Locator values for project comparisons.
 *
 * @pure true
 * @invariant normalizedCwd is absolute and stable for equal inputs
 * @complexity O(1) time / O(1) space
 */
// CHANGE: bundle normalized root and pure membership predicate in a locator
// WHY: keep matching invariants in CORE and leave path normalization in SHELL
// QUOTE(TZ): "FUNCTIONAL CORE, IMPERATIVE SHELL"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall c: locator(c) -> membership(c)
// PURITY: CORE
// EFFECT: n/a
// INVARIANT: normalizedCwd is absolute and stable for equal inputs
// COMPLEXITY: O(1)/O(1)
export const buildProjectLocator = (
  normalizedCwd: string,
  isWithinRoot: (candidate: string) => boolean
): ProjectLocator => ({
  normalizedCwd,
  isWithinRoot
})

/**
 * Checks whether a parsed JSON value contains project metadata.
 *
 * @param value - Parsed JSON value from a .jsonl line.
 * @param locator - Normalized project locator.
 * @returns True when cwd matches the project root.
 *
 * @pure true
 * @invariant valueMatchesProject implies metadataMatches for extracted metadata
 * @complexity O(k) where k = number of metadata fields read
 */
// CHANGE: restrict project matching to cwd-only semantics
// WHY: align with project-local path matching requirement
// QUOTE(TZ): "каждая функция — теорема"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall v: JsonValue -> matches(v, locator) <-> metadataMatches(v)
// PURITY: CORE
// EFFECT: n/a
// INVARIANT: metadataMatches uses cwd evidence only
// COMPLEXITY: O(k)/O(1)
export const valueMatchesProject = (
  value: JsonValue,
  locator: ProjectLocator
): boolean => metadataMatches(toMetadata(value), locator)
