import fs from "node:fs";
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
