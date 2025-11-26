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
}
