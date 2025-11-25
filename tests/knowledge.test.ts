import fs from "node:fs";
import path from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	buildProjectLocator,
	linesMatchProject,
} from "../src/core/knowledge.js";
import { buildSyncProgram } from "../src/shell/syncKnowledge.js";

const projectRoot = process.cwd();
const testWorkspaceRoot = path.join(projectRoot, "tmp-tests");
let testCounter = 0;

const mkTempDir = (): string => {
	testCounter += 1;
	const dir = path.join(testWorkspaceRoot, `run-${testCounter}`);
	fs.mkdirSync(dir, { recursive: true });
	return dir;
};

const writeFile = (filePath: string, content: string): void => {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content, "utf8");
};

afterEach(() => {
	if (fs.existsSync(testWorkspaceRoot)) {
		fs.rmSync(testWorkspaceRoot, { recursive: true, force: true });
	}
});

describe("core: linesMatchProject", () => {
	const locator = buildProjectLocator(
		"https://github.com/ProverCoderAI/context-doc",
		"/home/user/context-doc",
	);

	it("matches by repository_url", () => {
		const lines = [
			'{"git":{"repository_url":"https://github.com/ProverCoderAI/context-doc"},"cwd":"/home/user/context-doc"}',
		] as const;
		expect(linesMatchProject(lines, locator)).toBe(true);
	});

	it("matches by payload.git.repository_url and subdir cwd", () => {
		const lines = [
			'{"payload":{"git":{"repository_url":"git+https://github.com/ProverCoderAI/context-doc.git"},"cwd":"/home/user/context-doc/sub"} }',
		] as const;
		expect(linesMatchProject(lines, locator)).toBe(true);
	});

	it("matches by cwd alone when inside project root", () => {
		const lines = ['{"cwd":"/home/user/context-doc/packages/app"}'] as const;
		expect(linesMatchProject(lines, locator)).toBe(true);
	});

	it("rejects unrelated records", () => {
		const lines = [
			'{"git":{"repository_url":"https://github.com/other/repo"},"cwd":"/home/user/other"}',
		] as const;
		expect(linesMatchProject(lines, locator)).toBe(false);
	});

	it("rejects malformed/empty lines", () => {
		const lines = ["", "not-json", "{}", "[]"] as const;
		expect(linesMatchProject(lines, locator)).toBe(false);
	});
});

describe("shell: syncKnowledge end-to-end", () => {
	let cwd: string;
	let codexDir: string;
	let destDir: string;
	const repoUrl = "https://github.com/ProverCoderAI/context-doc";

	beforeEach(() => {
		cwd = mkTempDir();
		codexDir = path.join(cwd, ".codex");
		destDir = path.join(cwd, ".knowledge", ".codex");

		writeFile(
			path.join(cwd, "package.json"),
			JSON.stringify({ repository: { url: repoUrl } }),
		);

		writeFile(
			path.join(codexDir, "sessions/2025/11/match.jsonl"),
			[
				`{"git":{"repository_url":"${repoUrl}"},"cwd":"${cwd}","message":"match"}`,
				`{"payload":{"git":{"repository_url":"git+${repoUrl}.git"},"cwd":"${path.join(cwd, "sub")}"}}`,
			].join("\n"),
		);

		writeFile(
			path.join(codexDir, "sessions/2025/11/ignore.jsonl"),
			[
				'{"git":{"repository_url":"https://github.com/other/repo"},"cwd":"/tmp/other","message":"skip"}',
			].join("\n"),
		);
	});

	afterEach(() => {
		fs.rmSync(cwd, { recursive: true, force: true });
	});

	it("copies only matching dialogs into destination", () => {
		const program = buildSyncProgram({
			cwd,
			sourceDir: codexDir,
			destinationDir: destDir,
		});

		Effect.runSync(program);

		const copiedFiles = fs
			.readdirSync(path.join(destDir, "sessions/2025/11"), {
				withFileTypes: true,
			})
			.filter((entry) => entry.isFile())
			.map((entry) => entry.name);

		expect(copiedFiles).toEqual(["match.jsonl"]);

		const content = fs.readFileSync(
			path.join(destDir, "sessions/2025/11/match.jsonl"),
			"utf8",
		);

		expect(content).toContain('"message":"match"');
		expect(content).not.toContain("skip");
	});
});
