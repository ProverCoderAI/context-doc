import fs from "node:fs";
import path from "node:path";
import { Effect } from "effect";
import type { SyncError } from "./syncTypes.js";

export const syncError = (pathValue: string, reason: string): SyncError => ({
	_tag: "SyncError",
	path: pathValue,
	reason,
});

export const ensureDirectory = (
	directory: string,
): Effect.Effect<void, SyncError> =>
	Effect.try({
		try: () => {
			fs.mkdirSync(directory, { recursive: true });
		},
		catch: () =>
			syncError(directory, "Cannot create destination directory structure"),
	});

export const copyFilteredFiles = (
	sourceRoot: string,
	destinationRoot: string,
	isRelevant: (entry: fs.Dirent, fullPath: string) => boolean,
	errorReason: string,
): Effect.Effect<number, SyncError> =>
	Effect.try({
		try: () => {
			let copied = 0;
			const walk = (current: string): void => {
				const entries = fs.readdirSync(current, { withFileTypes: true });
				for (const entry of entries) {
					const full = path.join(current, entry.name);
					if (entry.isDirectory()) {
						walk(full);
					} else if (isRelevant(entry, full)) {
						const target = path.join(
							destinationRoot,
							path.relative(sourceRoot, full),
						);
						fs.mkdirSync(path.dirname(target), { recursive: true });
						fs.copyFileSync(full, target);
						copied += 1;
					}
				}
			};

			walk(sourceRoot);
			return copied;
		},
		catch: () => syncError(sourceRoot, errorReason),
	});
