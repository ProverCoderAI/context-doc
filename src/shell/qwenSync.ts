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
	pipe(
		Effect.sync(() => {
			const hash = qwenHashFromPath(cwd);
			const envSource = process.env.QWEN_SOURCE_DIR;
			const baseFromMeta =
				metaRoot === undefined
					? undefined
					: metaRoot.endsWith(".qwen")
						? metaRoot
						: path.join(metaRoot, ".qwen");
			const homeBase = path.join(os.homedir(), ".qwen");

			const candidates = [
				override,
				envSource,
				baseFromMeta ? path.join(baseFromMeta, "tmp", hash) : undefined,
				path.join(cwd, ".qwen", "tmp", hash),
				path.join(homeBase, "tmp", hash),
			];

			return candidates.find(
				(candidate) => candidate !== undefined && fs.existsSync(candidate),
			);
		}),
		Effect.flatMap((found) =>
			found === undefined
				? Effect.fail(syncError(".qwen", "Qwen source directory is missing"))
				: Effect.succeed(found),
		),
	);

export const syncQwen = (
	options: SyncOptions,
): Effect.Effect<void, SyncError> =>
	pipe(
		resolveQwenSourceDir(options.cwd, options.qwenSourceDir, options.metaRoot),
		Effect.flatMap((qwenSource) =>
			pipe(
				ensureDirectory(path.join(options.cwd, ".knowledge", ".qwen")),
				Effect.flatMap(() =>
					copyDirectoryJsonOnly(
						qwenSource,
						path.join(options.cwd, ".knowledge", ".qwen"),
					),
				),
				Effect.flatMap((copiedCount) =>
					Console.log(
						`Synced ${copiedCount} Qwen dialog files into .knowledge/.qwen`,
					),
				),
			),
		),
		Effect.catchAll(() =>
			Console.log("Qwen source not found; skipped syncing Qwen dialog files"),
		),
	);
