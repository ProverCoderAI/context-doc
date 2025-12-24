# context-doc

A CLI tool that automatically syncs AI conversation history from different AI assistants (Claude, Codex, Qwen) into your project's `.knowledge` folder.

## What does it do?

When you work with AI coding assistants like Claude, Codex, or Qwen, they store conversation history in their own directories (usually in your home folder). This tool helps you collect all that AI conversation history and copy it into your current project's `.knowledge` folder, so you can:

- Keep track of AI conversations related to your project
- Share AI context with your team
- Archive important AI-assisted development sessions
- Have a local backup of your AI conversations

## Quick Start

Run this command in your project directory:

```bash
npx @prover-coder-ai/context-doc
```

**Example output:**
```
user@arch ~/effect-template (main)> npx @prover-coder-ai/context-doc
Claude: source not found; skipped syncing (Claude project directory is missing)
Codex: copied 9 files from /home/user/.codex to /home/user/effect-template/.knowledge/.codex
Qwen: copied 1 files from /home/user/.qwen/tmp/040644799b0a7c05ac8df9cf26da0eab978287161b20ee2addc8105393cf98dd to /home/user/effect-template/.knowledge/.qwen
```

That's it! The tool will automatically:
1. Find AI conversation files on your system
2. Copy relevant conversations to `.knowledge/.codex`, `.knowledge/.qwen`, and `.knowledge/.claude` in your project
3. Filter Codex conversations to only include ones related to your current project

## Installation

### One-time use (recommended)
```bash
npx @prover-coder-ai/context-doc
```

### Global installation
```bash
npm install -g @prover-coder-ai/context-doc
context-doc
```

### Local development
```bash
npm run sync:knowledge
```

## Advanced Usage

### Custom source directories

```bash
# Custom Codex source
context-doc --source /custom/path/.codex

# Custom Codex destination
context-doc --dest /custom/path/.knowledge/.codex

# Custom Qwen source
context-doc --qwen-source /custom/path/.qwen/tmp/abc123

# Custom Claude projects root
context-doc --claude-projects /custom/path/projects
```

### Override project identification

```bash
# Override repository URL (for Codex filtering)
context-doc --project-url https://github.com/your/repo
```

### Use meta root for multiple AI tools

```bash
# Specify a meta folder that contains both .codex and .qwen
context-doc --meta-root /data/meta
```

## How it works

### Codex Sync
- **Searches for:** `.jsonl` files in `.codex` directories
- **Filters by:** Project URL or current working directory (only copies conversations related to your current project)
- **Default locations checked:**
  1. `--source` flag value
  2. `CODEX_SOURCE_DIR` environment variable
  3. `--meta-root/.codex`
  4. `<project>/.codex`
  5. `~/.codex`
  6. `<project>/.knowledge/.codex`
  7. `~/.knowledge/.codex`

### Qwen Sync
- **Searches for:** `.json` files in `.qwen/tmp/<hash>` directories
- **Filters by:** Nothing (copies all `.json` files found)
- **Hash calculation:** Based on your current working directory path
- **Default locations checked:**
  1. `--qwen-source` flag value
  2. `QWEN_SOURCE_DIR` environment variable
  3. `--meta-root/.qwen/tmp/<hash>`
  4. `<project>/.qwen/tmp/<hash>`
  5. `<project>/.knowledge/.qwen/tmp/<hash>`
  6. `--meta-root/.knowledge/.qwen/tmp/<hash>`
  7. `~/.qwen/tmp/<hash>`
  8. `~/.knowledge/.qwen/tmp/<hash>`

### Claude Sync
- **Searches for:** `.jsonl` files in Claude project directories
- **Filters by:** Current working directory (matches Claude project slug)
- **Default locations checked:**
  1. `--claude-projects` flag value
  2. `~/.claude/projects/-<cwd-slug>`

## Command-line Flags

| Flag | Short | Description | Example |
|------|-------|-------------|---------|
| `--source` | `-s` | Codex source directory | `--source /tmp/project/.codex` |
| `--dest` | `-d` | Codex destination directory | `--dest /tmp/project/.knowledge/.codex` |
| `--project-url` | | Override repository URL | `--project-url https://github.com/your/repo` |
| `--project-name` | | Alias for `--project-url` | `--project-name https://github.com/your/repo` |
| `--meta-root` | | Meta folder containing `.codex`, `.qwen`, `.claude` | `--meta-root /data/meta` |
| `--qwen-source` | | Qwen source directory | `--qwen-source /data/qwen/tmp/abc123` |
| `--claude-projects` | | Claude projects root directory | `--claude-projects ~/.claude/projects` |

## Environment Variables

- `CODEX_SOURCE_DIR` - Default Codex source directory
- `QWEN_SOURCE_DIR` - Default Qwen source directory

## Links

- **NPM Package:** https://www.npmjs.com/package/@prover-coder-ai/context-doc
- **Repository:** https://github.com/prover-coder-ai/context-doc
- **Issues:** https://github.com/prover-coder-ai/context-doc/issues

## Troubleshooting

**"source not found; skipped syncing"** - This is normal if you don't have that particular AI assistant's data on your system. The tool will skip it and continue with others.

**"Source .codex directory is missing"** - The tool couldn't find any Codex conversation files. Make sure you have Codex installed and have had some conversations, or specify a custom path with `--source`.

**No files copied** - Check that:
1. You have AI conversation files in the expected locations
2. For Codex: The conversations are related to your current project (check the `git.repository_url` or `cwd` in the `.jsonl` files)
3. For Qwen: The hash matches your current directory path
