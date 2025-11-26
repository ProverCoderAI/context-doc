import type * as Fx from "effect";

export interface SyncError {
	readonly _tag: "SyncError";
	readonly path: string;
	readonly reason: string;
}

export interface SyncOptions {
	readonly cwd: string;
	readonly sourceDir?: string;
	readonly destinationDir?: string;
	readonly repositoryUrlOverride?: string;
	readonly metaRoot?: string;
	readonly qwenSourceDir?: string;
	readonly claudeProjectsRoot?: string;
}

export interface SyncSource {
	readonly name: string;
	readonly destSubdir: ".codex" | ".qwen" | ".claude";
	readonly resolveSource: (
		options: SyncOptions,
	) => Fx.Effect<string, SyncError>;
	readonly copy: (
		sourceDir: string,
		destinationDir: string,
		options: SyncOptions,
	) => Fx.Effect<number, SyncError>;
}
