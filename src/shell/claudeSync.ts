import * as NodeFs from "node:fs";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import { Effect, pipe } from "effect";
import { copyFilteredFiles, runSyncSource, syncError } from "./syncShared.js";
import type { SyncError, SyncOptions, SyncSource } from "./syncTypes.js";

const slugFromCwd = (cwd: string): string =>
	`-${cwd.replace(/^\/+/, "").replace(/\//g, "-")}`;

const resolveClaudeProjectDir = (
	cwd: string,
	overrideProjectsRoot?: string,
): Effect.Effect<string, SyncError> =>
	pipe(
		Effect.sync(() => {
			const slug = slugFromCwd(cwd);
			const base =
				overrideProjectsRoot ??
				NodePath.join(NodeOs.homedir(), ".claude", "projects");
			const candidate = NodePath.join(base, slug);
			return NodeFs.existsSync(candidate) ? candidate : undefined;
		}),
		Effect.flatMap((found) =>
			found === undefined
				? Effect.fail(
						syncError(".claude", "Claude project directory is missing"),
					)
				: Effect.succeed(found),
		),
	);

const copyClaudeJsonl = (
	sourceDir: string,
	destinationDir: string,
): Effect.Effect<number, SyncError> =>
	copyFilteredFiles(
		sourceDir,
		destinationDir,
		(entry, fullPath) => entry.isFile() && fullPath.endsWith(".jsonl"),
		"Cannot traverse Claude project",
	);

export const syncClaude = (
	options: SyncOptions,
): Effect.Effect<void, SyncError> => runSyncSource(claudeSource, options);

const claudeSource: SyncSource = {
	name: "Claude",
	destSubdir: ".claude",
	resolveSource: (options) =>
		resolveClaudeProjectDir(options.cwd, options.claudeProjectsRoot),
	copy: (sourceDir, destinationDir) =>
		copyClaudeJsonl(sourceDir, destinationDir),
};
