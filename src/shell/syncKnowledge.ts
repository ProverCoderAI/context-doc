import { pathToFileURL } from "node:url";
import { Effect } from "effect";
import { syncCodex } from "./codexSync.js";
import { syncQwen } from "./qwenSync.js";
import type { SyncError, SyncOptions } from "./syncTypes.js";

// PURPOSE: Sync project-scoped dialogs (Codex + Qwen) into .knowledge storage.
export const buildSyncProgram = (
	options: SyncOptions,
): Effect.Effect<void, SyncError> =>
	Effect.gen(function* (_) {
		yield* _(syncCodex(options));
		yield* _(syncQwen(options));
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
	let result: SyncOptions = { cwd: process.cwd() };

	const mapping: Readonly<Record<string, keyof SyncOptions>> = {
		"--source": "sourceDir",
		"-s": "sourceDir",
		"--dest": "destinationDir",
		"-d": "destinationDir",
		"--project-url": "repositoryUrlOverride",
		"--project-name": "repositoryUrlOverride",
		"--meta-root": "metaRoot",
		"--qwen-source": "qwenSourceDir",
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const key = mapping[arg as keyof typeof mapping];
		if (key === undefined) {
			continue;
		}

		const value = argv[i + 1];
		if (value !== undefined) {
			result = { ...result, [key]: value };
			i++;
		}
	}

	return result;
};

if (isMainModule()) {
	const program = buildSyncProgram(parseArgs());

	Effect.runSync(program);
}
