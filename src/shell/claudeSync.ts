import * as Fs from "node:fs";
import * as Os from "node:os";
import * as Path from "node:path";
import { Console, Effect, pipe } from "effect";
import { copyFilteredFiles, ensureDirectory, syncError } from "./syncShared.js";
import type { SyncError } from "./syncTypes.js";
import type { SyncOptions } from "./syncTypes.js";

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
				overrideProjectsRoot ?? Path.join(Os.homedir(), ".claude", "projects");
			const candidate = Path.join(base, slug);
			return Fs.existsSync(candidate) ? candidate : undefined;
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
		Effect.catchAll((error) =>
			Console.log(
				`Claude source not found; skipped syncing Claude dialog files (${String((error as { reason?: string }).reason ?? error)})`,
			),
		),
	);
