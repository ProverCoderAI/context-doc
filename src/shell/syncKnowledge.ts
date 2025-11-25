import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as S from "@effect/schema/Schema";
import { Console, Effect, pipe } from "effect";
import type { ProjectLocator } from "../core/knowledge.js";
import { buildProjectLocator, linesMatchProject } from "../core/knowledge.js";

interface SyncError {
	readonly _tag: "SyncError";
	readonly path: string;
	readonly reason: string;
}

const PackageRepositorySchema = S.Struct({
	url: S.String,
});

const PackageFileSchema = S.Struct({
	repository: S.optional(PackageRepositorySchema),
});

const PackageFileFromJson = S.compose(S.parseJson(), PackageFileSchema);

const decodePackageFile = S.decodeUnknownSync(PackageFileFromJson);

export interface SyncOptions {
	readonly cwd: string;
	readonly sourceDir?: string;
	readonly destinationDir?: string;
	readonly repositoryUrlOverride?: string;
	readonly metaRoot?: string;
}

const syncError = (pathValue: string, reason: string): SyncError => ({
	_tag: "SyncError",
	path: pathValue,
	reason,
});

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
	Effect.try({
		try: () => {
			const envSource = process.env.CODEX_SOURCE_DIR;
			const metaCandidate =
				metaRoot === undefined
					? undefined
					: metaRoot.endsWith(".codex")
						? metaRoot
						: path.join(metaRoot, ".codex");
			const localSource = path.join(cwd, ".codex");
			const homeSource = path.join(os.homedir(), ".codex");
			const candidates = [
				override,
				envSource,
				metaCandidate,
				localSource,
				homeSource,
			];
			const existing = candidates.find(
				(candidate) => candidate !== undefined && fs.existsSync(candidate),
			);

			if (existing === undefined) {
				throw new Error("source .codex not found");
			}

			return existing;
		},
		catch: () => syncError(".codex", "Source .codex directory is missing"),
	});

const ensureDirectory = (directory: string): Effect.Effect<void, SyncError> =>
	Effect.try({
		try: () => {
			fs.mkdirSync(directory, { recursive: true });
		},
		catch: () =>
			syncError(directory, "Cannot create destination directory structure"),
	});

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

/**
 * CHANGE: Sync only project-related .jsonl dialogs into .knowledge/.codex
 * WHY: Keep per-project conversation history versioned alongside source code
 * QUOTE(ТЗ): "CORE ↔ SHELL разделение, эффекты только в SHELL"
 * REF: REQ-KNOWLEDGE-SYNC
 * SOURCE: AGENTS.md — контролируемые эффекты через Effect
 * FORMAT THEOREM: ∀d ∈ dialogs: relevant(d, project) → copied(d, .knowledge/.codex)
 * PURITY: SHELL
 * EFFECT: Effect<void, SyncError>
 * INVARIANT: Destination mirrors only project-matching dialogs; no unrelated files are copied
 * COMPLEXITY: O(n) / O(n) where n = count of .jsonl files traversed
 */
export const buildSyncProgram = (options: SyncOptions): Effect.Effect<void, SyncError> =>
	Effect.gen(function* (_) {
		const repositoryUrl = yield* _(
			readRepositoryUrl(options.cwd, options.repositoryUrlOverride),
		);
		const sourceDir = yield* _(
			resolveSourceDir(options.cwd, options.sourceDir, options.metaRoot),
		);
		const destinationDir =
			options.destinationDir ?? path.join(options.cwd, ".knowledge", ".codex");

		yield* _(ensureDirectory(destinationDir));

		const locator = buildProjectLocator(repositoryUrl, options.cwd);
		const allJsonlFiles = yield* _(collectJsonlFiles(sourceDir));
		const relevantFiles = yield* _(
			selectRelevantFiles(allJsonlFiles, locator),
		);

		yield* _(
			Effect.forEach(relevantFiles, (filePath) =>
				copyRelevantFile(sourceDir, destinationDir, filePath),
			),
		);

		yield* _(
			Console.log(
				`Synced ${relevantFiles.length} dialog files into .knowledge/.codex`,
			),
		);
	});

const isMainModule = (): boolean => {
	const entry = process.argv[1];

	if (entry === undefined) {
		return false;
	}

	return import.meta.url === pathToFileURL(entry).href;
};

const parseArgs = (): SyncOptions => {
	const argv = process.argv.slice(2);
	let sourceDir: string | undefined;
	let destinationDir: string | undefined;
	let repositoryUrlOverride: string | undefined;
	let metaRoot: string | undefined;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];

		switch (arg) {
			case "--source":
			case "-s":
				sourceDir = argv[i + 1];
				i++;
				break;
			case "--dest":
			case "-d":
				destinationDir = argv[i + 1];
				i++;
				break;
			case "--project-url":
			case "--project-name":
				repositoryUrlOverride = argv[i + 1];
				i++;
				break;
			case "--meta-root":
				metaRoot = argv[i + 1];
				i++;
				break;
			default:
				break;
		}
	}

	return {
		cwd: process.cwd(),
		sourceDir,
		destinationDir,
		repositoryUrlOverride,
		metaRoot,
	};
};

if (isMainModule()) {
	const program = buildSyncProgram(parseArgs());

	Effect.runSync(program);
}
