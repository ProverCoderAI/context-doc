# Knowledge Sync CLI

Command: `npm run sync:knowledge` (or `tsx src/shell/syncKnowledge.ts`) — copies only dialogs that belong to the current project into `.knowledge/.codex`.

## Flags
- `--source, -s <path>` — explicit path to `.codex`.
- `--dest, -d <path>` — destination root (defaults to `.knowledge/.codex` in the project).
- `--project-url` / `--project-name <url>` — override repository URL (otherwise read from `package.json`).
- `--meta-root <path>` — path to a meta folder; if it’s not already `.codex`, the tool looks for `<meta-root>/.codex`.

## `.codex` lookup order
1) `--source` (if provided)  
2) env `CODEX_SOURCE_DIR`  
3) `--meta-root` (either the `.codex` itself or `<meta-root>/.codex`)  
4) project-local `.codex`  
5) home `~/.codex`

Only `.jsonl` files whose `git.repository_url` or `cwd` match this project are copied.\
Copies are placed under `.knowledge/.codex` preserving the directory structure.
