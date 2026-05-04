# @ccr/eval

A small harness that pits LLM models against the same coding challenges via the CCR proxy and reports pass/fail + latency.

## What it tests

| Challenge | Type | Why it's interesting |
|---|---|---|
| `factorial-recursive` | LeetCode-easy | Catches the infamous "shell one-liner instead of Python" regression that triggered the v1.2.2 default-model swap |
| `two-sum` | LeetCode-easy | Hash map basics |
| `fizzbuzz` | LeetCode-easy | Sanity check / can the model count |
| `reverse-linked-list` | LeetCode-easy | Pointer manipulation, OOP |
| `valid-parens` | LeetCode-easy | Stack reasoning |
| `word-frequency` | LeetCode-medium | Multi-step algorithm with sorting tiebreaks |
| `swe-off-by-one-fix` | SWE bug-fix | Reads buggy code, returns fixed version (binary search infinite loop) |
| `swe-refactor-typescript` | SWE refactor | Removes duplication while preserving behavior |

## Run it

```bash
# Authenticate first if you haven't:
ccr login

# From the repo root:
npm install                               # one-time, picks up the new workspace
npm run -w @ccr/eval eval                 # all challenges × default model set

# Subset of models:
npm run -w @ccr/eval eval -- --models llama-3.3-70b-versatile,openai/gpt-oss-120b

# Subset of challenges:
npm run -w @ccr/eval eval -- --challenges factorial-recursive,fizzbuzz

# Save raw results:
npm run -w @ccr/eval eval -- --json eval-out.json

# Show the actual code each model produced:
npm run -w @ccr/eval eval -- -v
```

## Example output

```
▸ factorial-recursive
    llama-3.1-8b-instant                   ✗  1.2s  groq        · output mismatch — got "1⏎120…" want "1⏎1⏎120⏎3628800⏎VE-OK"
    llama-3.3-70b-versatile                ✓  2.1s  groq
    openai/gpt-oss-120b                    ✓  3.4s  groq
    moonshotai/kimi-k2-instruct            ✓  1.9s  groq

challenge              | llama-3.1-8b-instant | llama-3.3-70b-versatile | …
factorial-recursive    | ✗ 1.2s              | ✓ 2.1s                 | …
two-sum                | ✓ 1.8s              | ✓ 1.6s                 | …
…
PASS RATE              | 4/8 (50%)           | 8/8 (100%)             | …
```

## How it scores

Two validator types per challenge:

- **`exec`** — write the model's code to a temp file, run it with test inputs (Python via `python3`, TypeScript via `npx tsx`, JavaScript via `node`), compare stdout. Catches wrong-language regressions like the original "ccr made me a shell one-liner" failure.
- **`regex`** — pattern-match against the extracted code. Used for SWE-style "preserve behavior X" checks where executing isn't practical.

A run that produces no fenced code block is recorded as `—` (not even attempted), distinct from a validator failure (`✗`).

## Quota

Each challenge × model = 1 proxy request. The default 8 challenges × 6 models = 48 requests, ~2.4% of the 2,000/month free tier.

## Adding a new challenge

Edit `src/challenges.ts` and append to `CHALLENGES`. Two helpful patterns:

```ts
// Algorithmic — exec validator
{
  id: "merge-sorted-arrays",
  category: "leetcode-easy",
  prompt: "Write a Python function `merge(a, b) -> list[int]` …",
  validator: {
    kind: "exec",
    language: "python",
    suffix: `print(merge([1,3,5], [2,4,6]))`,
    cases: [{ stdin: "", expected: "[1, 2, 3, 4, 5, 6]" }],
  },
}

// SWE — regex validator
{
  id: "remove-console-log",
  category: "swe-refactor",
  prompt: "Remove the debug console.log calls from this snippet…",
  validator: {
    kind: "regex",
    language: "javascript",
    mustNotMatch: [/console\.log/],
  },
}
```
