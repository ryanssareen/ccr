# ccr

Clean-room terminal coding assistant backed by Groq. Reads your repo,
proposes diffs, and runs shell commands with approval.

## Install

```bash
# from this directory:
npm install
npm run build
npm link        # makes the `ccr` command global

# or install from npm once published:
# npm install -g ccr-cli
```

## Quick Start

1. **Get a Groq API key:**
   - Sign up at https://console.groq.com/
   - Copy your API key

2. **Set the API key:**
   ```bash
   export GROQ_API_KEY=gsk_...
   ccr "your prompt here"
   ```

3. **Or add to `.env` in your project:**
   ```
   GROQ_API_KEY=gsk_...
   ```

## Configure

```bash
# Override the model (default: llama-3.1-8b-instant):
export CCR_MODEL=llama-3.3-70b-versatile
```

**API Key Options:**
- Environment variable: `export GROQ_API_KEY=...`
- `.env` file in project root
- `~/.ccr/config.json`: `{ "groqApiKey": "gsk_..." }`

## Use

```bash
ccr                                  # interactive Ink UI in current dir
ccr "explain this project"           # interactive UI, prompt pre-submitted
ccr -p "list TODOs"                  # one-shot console mode (no UI)
ccr --resume                         # resume most-recent session
ccr --list-sessions                  # show saved sessions
ccr --yolo                           # auto-approve writes/shell
ccr --model llama-3.3-70b-versatile  # override model
ccr --cwd /path/to/repo "..."        # work in another dir
```

Interactive UI features:

- Persistent input prompt at the bottom; messages stream above.
- Spinner while the model is thinking; **Ctrl-C** to interrupt the run,
  press it again to exit.
- Tool calls render as inline cards: `◌ tool_name(args…)` → `✓` or `✗`.
- Approval prompts appear inline as a yellow box with a colorized diff;
  press **y** to approve, **n** or **Esc** to deny.
- Slash commands: `/help`, `/clear`, `/sessions`, `/save`, `/exit`.

## Tools the model can call

Read-only (auto-allowed):

- `read_file(path, offset?, limit?)`
- `glob(pattern, path?)`
- `grep(pattern, path?, glob?)`

Modifying (each shows a diff/command and asks for approval):

- `write_file(path, content)`
- `edit_file(path, old_string, new_string, replace_all?)`
- `multi_edit(path, edits[])` — atomic sequence of search-replace edits
- `insert_lines(path, line, content)` — insert at a 1-indexed line
- `bash(command, timeout?)`

## Project context

These files at the project root are loaded as system context:
`CLAUDE.md`, `AGENTS.md`, `.ccr/context.md`.

## Sessions

Persisted to `~/.ccr/sessions/<project-id>/<timestamp>.json`. Resume with
`ccr --resume` (latest) or `ccr --resume <id>`.

## Limitations

- No long-running watcher loop yet.
- No memory-distillation layer; transcripts are kept verbatim per session.
- Single-project sessions; no cross-project recall.
