import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as S from "@effect/schema/Schema";
import { Console, Effect, pipe } from "effect";
import type { ProjectLocator } from "../core/knowledge.js";
import { buildProjectLocator, linesMatchProject } from "../core/knowledge.js";
import { ensureDirectory, syncError } from "./syncShared.js";
import type { SyncError, SyncOptions } from "./syncTypes.js";

const PackageRepositorySchema = S.Struct({
	url: S.String,
});

const PackageFileSchema = S.Struct({
	repository: S.optional(PackageRepositorySchema),
});
const PackageFileFromJson = S.compose(S.parseJson(), PackageFileSchema);
const decodePackageFile = S.decodeUnknownSync(PackageFileFromJson);

const readRepositoryUrl = (
	cwd: string,
	repositoryUrlOverride?: string,
): Effect.Effect<string, SyncError> =>
	Effect.try({
		try: () => {
			if (repositoryUrlOverride !== undefined) {
				return repositoryUrlOverride;
			}

			const raw = fs.readFileSync(path.join(cwd, "package.json"), "utf8");
			const parsed = decodePackageFile(raw);
			const repositoryUrl = parsed.repository?.url;

			if (repositoryUrl === undefined) {
				throw new Error("repository url is missing");
			}

			return repositoryUrl;
		},
		catch: () => syncError("package.json", "Cannot read repository url"),
	});

const resolveSourceDir = (
	cwd: string,
	override?: string,
	metaRoot?: string,
): Effect.Effect<string, SyncError> =>
	pipe(
		Effect.sync(() => {
			const envSource = process.env.CODEX_SOURCE_DIR;
			const metaCandidate =
				metaRoot === undefined
					? undefined
					: metaRoot.endsWith(".codex")
						? metaRoot
						: path.join(metaRoot, ".codex");
			const localSource = path.join(cwd, ".codex");
			const homeSource = path.join(os.homedir(), ".codex");
			const localKnowledge = path.join(cwd, ".knowledge", ".codex");
			const homeKnowledge = path.join(os.homedir(), ".knowledge", ".codex");

			const candidates = [
				override,
				envSource,
				metaCandidate,
				localSource,
				homeSource,
				localKnowledge,
				homeKnowledge,
			].filter((candidate): candidate is string => candidate !== undefined);

			const existing = candidates.find((candidate) => fs.existsSync(candidate));

			return { existing, candidates };
		}),
		Effect.tap(({ candidates }) =>
			Console.log(`Codex source candidates: ${candidates.join(", ")}`),
		),
		Effect.flatMap(({ existing, candidates }) =>
			existing === undefined
				? Effect.fail(
						syncError(
							".codex",
							`Source .codex directory is missing; checked: ${candidates.join(", ")}`,
						),
					)
				: Effect.succeed(existing),
		),
	);

const collectJsonlFiles = (
	root: string,
): Effect.Effect<ReadonlyArray<string>, SyncError> =>
	Effect.try({
		try: () => {
			const collected: string[] = [];
			const walk = (current: string): void => {
				const entries = fs.readdirSync(current, { withFileTypes: true });
				for (const entry of entries) {
					const fullPath = path.join(current, entry.name);
					if (entry.isDirectory()) {
						walk(fullPath);
					} else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
						collected.push(fullPath);
					}
				}
			};

			walk(root);
			return collected;
		},
		catch: () => syncError(root, "Cannot traverse .codex"),
	});

const isFileRelevant = (
	filePath: string,
	locator: ProjectLocator,
): Effect.Effect<boolean, SyncError> =>
	Effect.try({
		try: () => {
			const content = fs.readFileSync(filePath, "utf8");
			const lines = content.split("\n");
			return linesMatchProject(lines, locator);
		},
		catch: () => syncError(filePath, "Cannot read jsonl file"),
	});

const copyRelevantFile = (
	sourceRoot: string,
	destinationRoot: string,
	filePath: string,
): Effect.Effect<void, SyncError> =>
	Effect.try({
		try: () => {
			const relative = path.relative(sourceRoot, filePath);
			const targetPath = path.join(destinationRoot, relative);
			fs.mkdirSync(path.dirname(targetPath), { recursive: true });
			fs.copyFileSync(filePath, targetPath);
		},
		catch: () => syncError(filePath, "Cannot copy file into .knowledge/.codex"),
	});

const selectRelevantFiles = (
	files: ReadonlyArray<string>,
	locator: ProjectLocator,
): Effect.Effect<ReadonlyArray<string>, SyncError> =>
	Effect.reduce(files, [] as string[], (acc, filePath) =>
		pipe(
			isFileRelevant(filePath, locator),
			Effect.map((isRelevant) => {
				if (isRelevant) {
					acc.push(filePath);
				}

				return acc;
			}),
		),
	);

// CHANGE: Extract Codex dialog sync into dedicated module for clarity.
// WHY: Separate Codex-specific shell effects from other sync flows.
// QUOTE(ТЗ): "вынеси в отдельный файл"
// REF: user request 2025-11-26
// SOURCE: internal requirement
// FORMAT THEOREM: ∀f ∈ Files: relevant(f, locator) → copied(f, destination)
// PURITY: SHELL
// EFFECT: Effect<void, SyncError, never>
// INVARIANT: ∀f ∈ copiedFiles: linesMatchProject(f, locator)
// COMPLEXITY: O(n) time / O(n) space, n = |files|
export const syncCodex = (
	options: SyncOptions,
): Effect.Effect<void, SyncError> =>
	Effect.gen(function* (_) {
		const repositoryUrl = yield* _(
			readRepositoryUrl(options.cwd, options.repositoryUrlOverride),
		);
		const sourceDir = yield* _(
			resolveSourceDir(options.cwd, options.sourceDir, options.metaRoot),
		);
		const destinationDir =
			options.destinationDir ?? path.join(options.cwd, ".knowledge", ".codex");

		if (path.resolve(sourceDir) === path.resolve(destinationDir)) {
			yield* _(
				Console.log(
					"Codex source equals destination; skipping copy to avoid duplicates",
				),
			);
			return;
		}

		yield* _(ensureDirectory(destinationDir));

		const locator = buildProjectLocator(repositoryUrl, options.cwd);
		const allJsonlFiles = yield* _(collectJsonlFiles(sourceDir));
		const relevantFiles = yield* _(selectRelevantFiles(allJsonlFiles, locator));

		yield* _(
			Effect.forEach(relevantFiles, (filePath) =>
				copyRelevantFile(sourceDir, destinationDir, filePath),
			),
		);

		yield* _(
			Console.log(
				`Synced ${relevantFiles.length} dialog files into .knowledge/.codex from ${sourceDir}`,
			),
		);
	}).pipe(
		Effect.catchAll((error) =>
			Console.log(
				`Codex source not found; skipped syncing Codex dialog files (${error.reason})`,
			),
		),
	);
