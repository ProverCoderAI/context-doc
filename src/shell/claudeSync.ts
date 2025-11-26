import * as NodeFs from "node:fs";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import { Console, Effect, pipe } from "effect";
import { copyFilteredFiles, ensureDirectory, syncError } from "./syncShared.js";
import type { SyncError, SyncOptions } from "./syncTypes.js";

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
): Effect.Effect<void, SyncError> =>
	pipe(
		resolveClaudeProjectDir(options.cwd, options.claudeProjectsRoot),
		Effect.flatMap((sourceDir) =>
			pipe(
				ensureDirectory(Path.join(options.cwd, ".knowledge", ".claude")),
				Effect.flatMap(() =>
					copyClaudeJsonl(
						sourceDir,
						Path.join(options.cwd, ".knowledge", ".claude"),
					),
				),
				Effect.flatMap((copied) =>
					Console.log(
						`Claude: copied ${copied} files from ${sourceDir} to ${Path.join(options.cwd, ".knowledge", ".claude")}`,
					),
				),
			),
		),
		Effect.catchAll((error: SyncError) =>
			Console.log(
				`Claude source not found; skipped syncing Claude dialog files (${error.reason})`,
			),
		),
	);
