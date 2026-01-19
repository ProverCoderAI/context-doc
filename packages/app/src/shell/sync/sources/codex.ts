import * as Path from "@effect/platform/Path"
import * as Schema from "@effect/schema/Schema"
import { Console, Effect, Option, pipe } from "effect"

import type { JsonValue, ProjectLocator } from "../../../core/knowledge.js"
import { buildProjectLocator, valueMatchesProject } from "../../../core/knowledge.js"
import { FileSystemService } from "../../services/file-system.js"
import { RuntimeEnv } from "../../services/runtime-env.js"
import {
  collectFiles,
  copyFilePreservingRelativePath,
  ensureDestination,
  findFirstMatching,
  resolveProjectRoot
} from "../shared.js"
import { type SyncError, syncError, type SyncOptions } from "../types.js"

type CodexEnv = RuntimeEnv | FileSystemService | Path.Path
type CodexFsEnv = FileSystemService | Path.Path

const some = Option.some
const forEach = Effect.forEach

const JsonValueSchema: Schema.Schema<JsonValue> = Schema.suspend(() =>
  Schema.Union(
    Schema.String,
    Schema.Number,
    Schema.Boolean,
    Schema.Null,
    Schema.Array(JsonValueSchema),
    Schema.Record({ key: Schema.String, value: JsonValueSchema })
  )
)

const parseJsonLine = (
  line: string
): Effect.Effect<Option.Option<JsonValue>> =>
  pipe(
    Schema.decode(Schema.parseJson(JsonValueSchema))(line),
    Effect.match({
      onFailure: () => Option.none(),
      onSuccess: (value) => some(value)
    })
  )

const resolveEnvValue = (envValue: Option.Option<string>): string | undefined => Option.getOrUndefined(envValue)

const buildLocator = (path: Path.Path, projectRoot: string): ProjectLocator => {
  const normalizedRoot = path.resolve(projectRoot)
  const isWithinRoot = (candidate: string): boolean => {
    const normalizedCandidate = path.resolve(candidate)
    const relative = path.relative(normalizedRoot, normalizedCandidate)
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
  }
  return buildProjectLocator(normalizedRoot, isWithinRoot)
}

const containsJsonl = (root: string): Effect.Effect<boolean, SyncError, FileSystemService> =>
  Effect.gen(function*(_) {
    const fs = yield* _(FileSystemService)
    const entries = yield* _(fs.readDirectory(root))
    for (const entry of entries) {
      if (entry.kind === "file" && entry.path.endsWith(".jsonl")) {
        return true
      }
      if (entry.kind === "directory") {
        const found = yield* _(containsJsonl(entry.path))
        if (found) {
          return true
        }
      }
    }
    return false
  })

const hasJsonlInCandidate = (
  candidate: string
): Effect.Effect<boolean, SyncError, FileSystemService> =>
  Effect.gen(function*(_) {
    const fs = yield* _(FileSystemService)
    const exists = yield* _(fs.exists(candidate))
    if (!exists) {
      return false
    }
    return yield* _(containsJsonl(candidate))
  })

const findFirstExistingWithJsonl = (
  candidates: ReadonlyArray<string>
): Effect.Effect<string | undefined, SyncError, FileSystemService> => findFirstMatching(candidates, hasJsonlInCandidate)

const resolveSourceDir = (
  options: SyncOptions
): Effect.Effect<string, SyncError, CodexEnv> =>
  Effect.gen(function*(_) {
    const env = yield* _(RuntimeEnv)
    const path = yield* _(Path.Path)
    const envSource = resolveEnvValue(yield* _(env.envVar("CODEX_SOURCE_DIR")))
    const homeDir = yield* _(env.homedir)
    const projectRoot = resolveProjectRoot(path, options)
    let metaCandidate: string | undefined
    if (options.metaRoot !== undefined) {
      metaCandidate = options.metaRoot.endsWith(".codex")
        ? options.metaRoot
        : path.join(options.metaRoot, ".codex")
    }
    const localSource = path.join(projectRoot, ".codex")
    const localKnowledge = path.join(projectRoot, ".knowledge", ".codex")
    const homeSource = path.join(homeDir, ".codex")
    const homeKnowledge = path.join(homeDir, ".knowledge", ".codex")

    const candidates = [
      options.sourceDir,
      envSource,
      metaCandidate,
      localSource,
      homeSource,
      localKnowledge,
      homeKnowledge
    ].filter((candidate): candidate is string => candidate !== undefined)

    const existing = yield* _(findFirstExistingWithJsonl(candidates))
    if (existing === undefined) {
      return yield* _(
        Effect.fail(
          syncError(
            ".codex",
            `No .jsonl files found in .codex candidates; checked: ${candidates.join(", ")}`
          )
        )
      )
    }

    return existing
  })

const resolveLocator = (
  options: SyncOptions
): Effect.Effect<ProjectLocator, never, Path.Path> =>
  Effect.gen(function*(_) {
    const path = yield* _(Path.Path)
    const projectRoot = resolveProjectRoot(path, options)
    return buildLocator(path, projectRoot)
  })

const lineMatchesProject = (
  line: string,
  locator: ProjectLocator
): Effect.Effect<boolean> =>
  pipe(
    parseJsonLine(line),
    Effect.map((parsed) => Option.exists(parsed, (value) => valueMatchesProject(value, locator)))
  )

const fileMatchesProject = (
  filePath: string,
  locator: ProjectLocator
): Effect.Effect<boolean, SyncError, FileSystemService> =>
  Effect.gen(function*(_) {
    const fs = yield* _(FileSystemService)
    const content = yield* _(fs.readFileString(filePath))
    const lines = content.split("\n")
    const matches = yield* _(
      forEach(lines, (line) => {
        const trimmed = line.trim()
        return trimmed.length === 0
          ? Effect.succeed(false)
          : lineMatchesProject(trimmed, locator)
      })
    )
    return matches.some(Boolean)
  })

const selectRelevantFiles = (
  files: ReadonlyArray<string>,
  locator: ProjectLocator
): Effect.Effect<ReadonlyArray<string>, SyncError, FileSystemService> =>
  pipe(
    forEach(files, (filePath) =>
      pipe(
        fileMatchesProject(filePath, locator),
        Effect.map((matches) => ({ filePath, matches }))
      )),
    Effect.map((results) =>
      results
        .filter((result) => result.matches)
        .map((result) => result.filePath)
    )
  )

const copyCodexFiles = (
  sourceDir: string,
  destinationDir: string,
  locator: ProjectLocator
): Effect.Effect<void, SyncError, CodexFsEnv> =>
  Effect.gen(function*(_) {
    yield* _(ensureDestination(destinationDir))
    const allJsonlFiles = yield* _(
      collectFiles(sourceDir, (entry) => entry.kind === "file" && entry.path.endsWith(".jsonl"))
    )
    const relevantFiles = yield* _(selectRelevantFiles(allJsonlFiles, locator))
    yield* _(
      forEach(relevantFiles, (filePath) => copyFilePreservingRelativePath(sourceDir, destinationDir, filePath))
    )
    yield* _(
      Console.log(
        `Codex: copied ${relevantFiles.length} files from ${sourceDir} to ${destinationDir}`
      )
    )
  })

// CHANGE: extract Codex dialog sync into dedicated module
// WHY: keep Codex-specific shell effects isolated from other sources
// QUOTE(TZ): "FUNCTIONAL CORE, IMPERATIVE SHELL"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall f: relevant(f, locator) -> copied(f)
// PURITY: SHELL
// EFFECT: Effect<void, never, FileSystemService | RuntimeEnv | Path>
// INVARIANT: copied files contain at least one project-matching line by projectRoot
// COMPLEXITY: O(n)/O(n)
export const syncCodex = (
  options: SyncOptions
): Effect.Effect<void, never, CodexEnv> =>
  Effect.gen(function*(_) {
    const locator = yield* _(resolveLocator(options))
    const sourceDir = yield* _(resolveSourceDir(options))
    const path = yield* _(Path.Path)
    const destinationDir = options.destinationDir ??
      path.join(resolveProjectRoot(path, options), ".knowledge", ".codex")

    if (path.resolve(sourceDir) === path.resolve(destinationDir)) {
      yield* _(
        Console.log(
          "Codex source equals destination; skipping copy to avoid duplicates"
        )
      )
      return
    }

    yield* _(copyCodexFiles(sourceDir, destinationDir, locator))
  }).pipe(
    Effect.matchEffect({
      onFailure: (error: SyncError) =>
        Console.log(
          `Codex source not found; skipped syncing Codex dialog files (${error.reason})`
        ),
      onSuccess: () => Effect.void
    })
  )

// CHANGE: expose DirectoryEntry type for Codex traversal helpers
// WHY: reuse typed filesystem entries without leaking Node types
// QUOTE(TZ): "CORE never calls SHELL"
// REF: user-2026-01-19-sync-rewrite
// SOURCE: n/a
// FORMAT THEOREM: forall e: DirectoryEntry -> shellOnly(e)
// PURITY: SHELL
// EFFECT: n/a
// INVARIANT: entry.kind is one of file|directory|other
// COMPLEXITY: O(1)/O(1)
