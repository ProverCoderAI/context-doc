import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Console, Effect, pipe } from "effect";
import { ensureDirectory, syncError } from "./syncShared.js";
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
				overrideProjectsRoot ?? path.join(os.homedir(), ".claude", "projects");
			const candidate = path.join(base, slug);
			return fs.existsSync(candidate) ? candidate : undefined;
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
	Effect.try({
		try: () => {
			let copied = 0;
			const walk = (current: string): void => {
				const entries = fs.readdirSync(current, { withFileTypes: true });
				for (const entry of entries) {
					const full = path.join(current, entry.name);
					if (entry.isDirectory()) {
						walk(full);
					} else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
						const target = path.join(
							destinationDir,
							path.relative(sourceDir, full),
						);
						fs.mkdirSync(path.dirname(target), { recursive: true });
						fs.copyFileSync(full, target);
						copied += 1;
					}
				}
			};
			walk(sourceDir);
			return copied;
		},
		catch: () => syncError(sourceDir, "Cannot traverse Claude project"),
	});

export const syncClaude = (
	options: SyncOptions,
): Effect.Effect<void, SyncError> =>
	pipe(
		resolveClaudeProjectDir(options.cwd, options.claudeProjectsRoot),
		Effect.flatMap((sourceDir) =>
			pipe(
				ensureDirectory(path.join(options.cwd, ".knowledge", ".claude")),
				Effect.flatMap(() =>
					copyClaudeJsonl(
						sourceDir,
						path.join(options.cwd, ".knowledge", ".claude"),
					),
				),
				Effect.flatMap((copied) =>
					Console.log(
						`Claude: copied ${copied} files from ${sourceDir} to ${path.join(options.cwd, ".knowledge", ".claude")}`,
					),
				),
			),
		),
		Effect.catchAll((error) =>
			Console.log(
				`Claude source not found; skipped syncing Claude dialog files (${error.reason})`,
			),
		),
	);
