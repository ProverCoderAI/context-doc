# Knowledge Sync CLI

Command: `npm run sync:knowledge` (or `knowledge-sync` when installed globally) — copies project dialogs into `.knowledge` for both Codex and Qwen.

## Installation (global CLI)
- Install: `npm install -g @prover-coder-ai/context-doc`
- Registry page: https://www.npmjs.com/package/@prover-coder-ai/context-doc
- Run globally: `knowledge-sync [flags]`
- Local (without global install): `npm run sync:knowledge` or `tsx src/shell/syncKnowledge.ts`

## Flags
- `--source, -s <path>` — explicit path to `.codex` (Codex source).
- `--dest, -d <path>` — Codex destination root (defaults to `.knowledge/.codex`).
- `--project-url` / `--project-name <url>` — override repository URL (otherwise read from `package.json`).
- `--meta-root <path>` — meta folder root; Codex lookup tries `<meta-root>/.codex`, Qwen lookup tries `<meta-root>/.qwen/tmp/<hash>`.
- `--qwen-source <path>` — explicit path to Qwen source.

## Codex lookup order (`.jsonl` filtered by project)
1) `--source`
2) env `CODEX_SOURCE_DIR`
3) `--meta-root` (use if already `.codex` or append `/.codex`)
4) project-local `.codex`
5) home `~/.codex`

Files: copies only `.jsonl` whose `git.repository_url` or `cwd` match this project into `.knowledge/.codex`, preserving structure.

## Qwen lookup order (`.json` only, no project filter)
1) `--qwen-source`
2) env `QWEN_SOURCE_DIR`
3) `<meta-root>/.qwen/tmp/<hash>`
4) `<cwd>/.qwen/tmp/<hash>`
5) `~/.qwen/tmp/<hash>`

Files: copies only `.json` into `.knowledge/.qwen`, preserving structure (directories recreated).
