# ccr

Free terminal coding assistant. Reads your repo, proposes diffs, and
runs shell commands with your approval. No API key required.

## Install

```bash
npm install -g @ryanisavibecoder/ccr
```

## Quick Start

```bash
ccr login                         # sign up — opens your browser
ccr "explain this codebase"       # one-shot
ccr                               # interactive REPL
```

That's it. `ccr login` creates a free account and provisions everything.
The service routes your requests across multiple LLM providers (Groq,
Together AI, Cerebras, OpenRouter) so individual users don't need to
manage API keys.

### Free tier

Every account gets **2,000 requests per month**. Usage is shown inline
in the REPL header and at the end of every one-shot run. Resets on the
1st of each month UTC.

## Auth options

```bash
ccr login                # browser flow (default)
ccr login --terminal     # email + password directly in the terminal
ccr login --method github # force GitHub OAuth (browser only)
```

Credentials are stored at `~/.ccr/auth.json` (mode `0600`).

## Configure

```bash
# Override the default model:
export CCR_MODEL=llama-3.3-70b-versatile

# Point at a self-hosted or staging deployment:
export CCR_ENDPOINT=https://my-ccr.example.com
```

## Bring your own key (advanced)

If you'd rather skip the managed service and use Groq directly:

```bash
export GROQ_API_KEY=gsk_...
ccr "your prompt"
```

This bypasses the proxy. You'll get a deprecation warning on each run
but it still works for offline / power-user setups.

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
