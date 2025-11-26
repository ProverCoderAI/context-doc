import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { copyFilteredFiles, runSyncSource, syncError } from "./syncShared.js";
import type { SyncError, SyncOptions, SyncSource } from "./syncTypes.js";

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
						`Qwen source directory is missing for hash ${hash}`,
					),
				),
			);
		}

		return found;
	});

export const syncQwen = (
	options: SyncOptions,
): Effect.Effect<void, SyncError> => runSyncSource(qwenSource, options);

const qwenSource: SyncSource = {
	name: "Qwen",
	destSubdir: ".qwen",
	resolveSource: (options) =>
		resolveQwenSourceDir(options.cwd, options.qwenSourceDir, options.metaRoot),
	copy: (sourceDir, destinationDir) =>
		copyFilteredFiles(
			sourceDir,
			destinationDir,
			(entry, fullPath) => entry.isFile() && fullPath.endsWith(".json"),
			"Cannot traverse Qwen directory",
		),
};
