import path from "node:path";
import { Option, pipe } from "effect";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonRecord;
interface JsonRecord {
	readonly [key: string]: JsonValue;
}

export interface ProjectLocator {
	readonly normalizedRepositoryUrl: string;
	readonly normalizedCwd: string;
}

interface RecordMetadata {
	readonly repositoryUrl: Option.Option<string>;
	readonly cwd: Option.Option<string>;
}

const isJsonRecord = (value: JsonValue): value is JsonRecord =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeRepositoryUrl = (value: string): string =>
	pipe(
		value.trim(),
		(trimmed) => trimmed.replace(/^git\+/, ""),
		(withoutPrefix) => withoutPrefix.replace(/\.git$/, ""),
		(withoutGitSuffix) =>
			withoutGitSuffix.replace(/^git@github\.com:/, "https://github.com/"),
		(withoutSsh) =>
			withoutSsh.replace(/^ssh:\/\/git@github\.com\//, "https://github.com/"),
		(normalized) => normalized.toLowerCase(),
	);

const normalizeCwd = (value: string): string => path.resolve(value);

const pickString = (record: JsonRecord, key: string): Option.Option<string> => {
	const candidate = record[key];
	return typeof candidate === "string" ? Option.some(candidate) : Option.none();
};

const pickRecord = (
	record: JsonRecord,
	key: string,
): Option.Option<JsonRecord> =>
	pipe(record[key], Option.fromNullable, Option.filter(isJsonRecord));

const pickGitRepository = (record: JsonRecord): Option.Option<string> =>
	pipe(
		pickString(record, "repository_url"),
		Option.orElse(() => pickString(record, "repositoryUrl")),
	);

const extractRepository = (record: JsonRecord): Option.Option<string> =>
	pipe(
		pickRecord(record, "git"),
		Option.flatMap(pickGitRepository),
		Option.orElse(() =>
			pipe(
				pickRecord(record, "payload"),
				Option.flatMap((payload) =>
					pipe(pickRecord(payload, "git"), Option.flatMap(pickGitRepository)),
				),
			),
		),
	);

const extractCwd = (record: JsonRecord): Option.Option<string> =>
	pipe(
		pickString(record, "cwd"),
		Option.orElse(() =>
			pipe(
				pickRecord(record, "payload"),
				Option.flatMap((payload) => pickString(payload, "cwd")),
			),
		),
	);

const toMetadata = (value: JsonValue): RecordMetadata => {
	if (!isJsonRecord(value)) {
		return { repositoryUrl: Option.none(), cwd: Option.none() };
	}

	return {
		repositoryUrl: extractRepository(value),
		cwd: extractCwd(value),
	};
};

const normalizeLocator = (
	repositoryUrl: string,
	cwd: string,
): ProjectLocator => ({
	normalizedRepositoryUrl: normalizeRepositoryUrl(repositoryUrl),
	normalizedCwd: normalizeCwd(cwd),
});

const safeParseJson = (line: string): Option.Option<JsonValue> => {
	try {
		return Option.some(JSON.parse(line));
	} catch {
		return Option.none();
	}
};

const metadataMatches = (
	metadata: RecordMetadata,
	locator: ProjectLocator,
): boolean => {
	const cwdMatches = Option.exists(metadata.cwd, (cwdValue) => {
		const normalized = normalizeCwd(cwdValue);
		return normalized === locator.normalizedCwd;
	});

	return cwdMatches;
};

export const buildProjectLocator = (
	repositoryUrl: string,
	cwd: string,
): ProjectLocator => normalizeLocator(repositoryUrl, cwd);

export const linesMatchProject = (
	lines: readonly string[],
	locator: ProjectLocator,
): boolean =>
	lines.some((line) => {
		const trimmed = line.trim();

		if (trimmed.length === 0) {
			return false;
		}

		return pipe(
			safeParseJson(trimmed),
			Option.map(toMetadata),
			Option.exists((metadata) => metadataMatches(metadata, locator)),
		);
	});
