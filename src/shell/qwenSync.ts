import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Console, Effect, pipe } from "effect";
import { ensureDirectory, syncError } from "./syncShared.js";
import type { SyncError, SyncOptions } from "./syncTypes.js";

const copyDirectoryJsonOnly = (
	sourceRoot: string,
	destinationRoot: string,
): Effect.Effect<number, SyncError> =>
	Effect.try({
		try: () => {
			let copied = 0;
			fs.cpSync(sourceRoot, destinationRoot, {
				recursive: true,
				filter: (src) => {
					const stat = fs.statSync(src);
					if (stat.isDirectory()) {
						return true;
					}
					if (src.endsWith(".json")) {
						copied += 1;
						return true;
					}
					return false;
				},
			});
			return copied;
		},
		catch: () => syncError(sourceRoot, "Cannot traverse Qwen directory"),
	});

const qwenHashFromPath = (projectPath: string): string =>
	createHash("sha256").update(projectPath).digest("hex");

const resolveQwenSourceDir = (
	cwd: string,
	override?: string,
	metaRoot?: string,
): Effect.Effect<string, SyncError> =>
	Effect.gen(function* (_) {
		const hash = qwenHashFromPath(cwd);
		const envSource = process.env.QWEN_SOURCE_DIR;
		const baseFromMeta =
			metaRoot === undefined
				? undefined
				: metaRoot.endsWith(".qwen")
					? metaRoot
					: path.join(metaRoot, ".qwen");
		const metaKnowledge = path.join(metaRoot ?? "", ".knowledge", ".qwen");
		const homeBase = path.join(os.homedir(), ".qwen");
		const homeKnowledge = path.join(os.homedir(), ".knowledge", ".qwen");

		const candidates = [
			override,
			envSource,
			baseFromMeta ? path.join(baseFromMeta, "tmp", hash) : undefined,
			path.join(cwd, ".qwen", "tmp", hash),
			path.join(cwd, ".knowledge", ".qwen", "tmp", hash),
			metaKnowledge ? path.join(metaKnowledge, "tmp", hash) : undefined,
			path.join(homeBase, "tmp", hash),
			path.join(homeKnowledge, "tmp", hash),
		].filter((candidate): candidate is string => candidate !== undefined);

		const found = candidates.find((candidate) => fs.existsSync(candidate));

		if (found === undefined) {
			return yield* _(
				Effect.fail(
					syncError(
						".qwen",
						`Qwen source directory is missing; checked: ${candidates.join(", ")}`,
					),
				),
			);
		}

		return found;
	});

export const syncQwen = (
	options: SyncOptions,
): Effect.Effect<void, SyncError> =>
	pipe(
		resolveQwenSourceDir(options.cwd, options.qwenSourceDir, options.metaRoot),
		Effect.flatMap((qwenSource) =>
			Effect.gen(function* (_) {
				const destination = path.join(options.cwd, ".knowledge", ".qwen");
				if (path.resolve(qwenSource) === path.resolve(destination)) {
					yield* _(
						Console.log(
							"Qwen source equals destination; skipping copy to avoid duplicates",
						),
					);
					return;
				}

				yield* _(ensureDirectory(destination));
				const copiedCount = yield* _(
					copyDirectoryJsonOnly(qwenSource, destination),
				);
				yield* _(
					Console.log(`Qwen: copied ${copiedCount} files from ${qwenSource} to ${destination}`),
				);
			}),
		),
		Effect.catchAll((error) =>
			Console.log(
				`Qwen source not found; skipped syncing Qwen dialog files (${error.reason})`,
			),
		),
	);
