/**
 * Each challenge is one prompt to the model. The validator runs after we
 * extract the first code block from the model's response. Two flavors:
 *
 * - kind: "exec"   — write code to a temp file, run it with the listed test
 *                    cases, compare stdout. Catches "writes wrong-language"
 *                    regressions like the python-shell-one-liner factorial.
 *
 * - kind: "regex"  — run a list of must-match / must-NOT-match patterns
 *                    against the extracted code. Cheaper, less precise,
 *                    but useful for SWE-style "did you preserve X" tests.
 */

export type Language = "python" | "typescript" | "javascript";

export interface ExecCase {
  /** Stdin to pipe into the program (empty string if none). */
  stdin: string;
  /** Expected stdout (after trim). */
  expected: string;
}

export interface ExecValidator {
  kind: "exec";
  language: Language;
  /** Optional code prefix injected before the model's code (e.g. imports). */
  prefix?: string;
  /** Optional code suffix that calls into the model's code with assertions. */
  suffix?: string;
  cases: ExecCase[];
  /** Maximum seconds the program may run per case. */
  timeoutSec?: number;
}

export interface RegexValidator {
  kind: "regex";
  language: Language;
  /** Each pattern must appear in the extracted code. */
  mustMatch?: RegExp[];
  /** None of these may appear in the extracted code. */
  mustNotMatch?: RegExp[];
}

export type Validator = ExecValidator | RegexValidator;

export interface Challenge {
  id: string;
  category: "leetcode-easy" | "leetcode-medium" | "swe-fix" | "swe-refactor";
  prompt: string;
  validator: Validator;
}

export const CHALLENGES: Challenge[] = [
  // ─── 1. The original "this sucks" regression test ───
  {
    id: "factorial-recursive",
    category: "leetcode-easy",
    prompt:
      "Write a recursive Python function `factorial(n: int) -> int` that returns n! for n >= 0 and raises ValueError for negative inputs. Output ONLY a python code block. No prose.",
    validator: {
      kind: "exec",
      language: "python",
      suffix: `
import sys
print(factorial(0))
print(factorial(1))
print(factorial(5))
print(factorial(10))
try:
    factorial(-1)
    print("MISSED-VALUEERROR")
except ValueError:
    print("VE-OK")
`,
      cases: [
        {
          stdin: "",
          expected: "1\n1\n120\n3628800\nVE-OK",
        },
      ],
    },
  },

  // ─── 2. Two Sum (LeetCode #1) ───
  {
    id: "two-sum",
    category: "leetcode-easy",
    prompt:
      "Write a Python function `two_sum(nums: list[int], target: int) -> list[int]` that returns the indices of the two numbers in `nums` that add up to `target`. Each input has exactly one solution, no element used twice. Output ONLY a python code block.",
    validator: {
      kind: "exec",
      language: "python",
      suffix: `
print(sorted(two_sum([2, 7, 11, 15], 9)))
print(sorted(two_sum([3, 2, 4], 6)))
print(sorted(two_sum([3, 3], 6)))
`,
      cases: [
        {
          stdin: "",
          expected: "[0, 1]\n[1, 2]\n[0, 1]",
        },
      ],
    },
  },

  // ─── 3. FizzBuzz (sanity check) ───
  {
    id: "fizzbuzz",
    category: "leetcode-easy",
    prompt:
      "Write a Python function `fizzbuzz(n: int) -> list[str]` that returns the FizzBuzz sequence from 1 to n inclusive: 'Fizz' for multiples of 3, 'Buzz' for multiples of 5, 'FizzBuzz' for multiples of both, otherwise the number as a string. Output ONLY a python code block.",
    validator: {
      kind: "exec",
      language: "python",
      suffix: `
print(",".join(fizzbuzz(15)))
`,
      cases: [
        {
          stdin: "",
          expected:
            "1,2,Fizz,4,Buzz,Fizz,7,8,Fizz,Buzz,11,Fizz,13,14,FizzBuzz",
        },
      ],
    },
  },

  // ─── 4. Reverse linked list (LeetCode #206) ───
  {
    id: "reverse-linked-list",
    category: "leetcode-easy",
    prompt:
      "Implement a Python class `ListNode` with attributes `val` and `next` (default None), and a function `reverse_list(head: ListNode | None) -> ListNode | None` that reverses a singly-linked list iteratively. Output ONLY a python code block.",
    validator: {
      kind: "exec",
      language: "python",
      suffix: `
def to_list(head):
    out = []
    while head is not None:
        out.append(head.val)
        head = head.next
    return out

def from_list(values):
    head = None
    for v in reversed(values):
        n = ListNode(v)
        n.next = head
        head = n
    return head

print(to_list(reverse_list(from_list([1, 2, 3, 4, 5]))))
print(to_list(reverse_list(from_list([]))))
print(to_list(reverse_list(from_list([1]))))
`,
      cases: [
        {
          stdin: "",
          expected: "[5, 4, 3, 2, 1]\n[]\n[1]",
        },
      ],
    },
  },

  // ─── 5. Valid parens (LeetCode #20) — medium-easy, multiple stack ops ───
  {
    id: "valid-parens",
    category: "leetcode-easy",
    prompt:
      "Write a Python function `is_valid(s: str) -> bool` that returns True iff the string contains only '()[]{}' and every opening bracket has a matching closing bracket of the same type, in the right order. Output ONLY a python code block.",
    validator: {
      kind: "exec",
      language: "python",
      suffix: `
print(is_valid("()"))
print(is_valid("()[]{}"))
print(is_valid("(]"))
print(is_valid("([)]"))
print(is_valid("{[]}"))
print(is_valid(""))
`,
      cases: [
        {
          stdin: "",
          expected: "True\nTrue\nFalse\nFalse\nTrue\nTrue",
        },
      ],
    },
  },

  // ─── 6. Word frequency (medium-ish, real-world flavor) ───
  {
    id: "word-frequency",
    category: "leetcode-medium",
    prompt:
      "Write a Python function `top_k_words(text: str, k: int) -> list[str]` that returns the k most frequent words in `text`, lowercased, sorted by frequency descending then by alphabetical order ascending. Words are sequences of letters separated by whitespace or punctuation. Output ONLY a python code block.",
    validator: {
      kind: "exec",
      language: "python",
      suffix: `
print(top_k_words("the quick brown fox the lazy dog the", 2))
print(top_k_words("a a b b c", 3))
print(top_k_words("Hello, hello! HELLO?", 1))
`,
      cases: [
        {
          stdin: "",
          expected: "['the', 'brown']\n['a', 'b', 'c']\n['hello']",
        },
      ],
    },
  },

  // ─── 7. SWE: fix bug (regex check — code must NOT regress, must keep behavior) ───
  {
    id: "swe-off-by-one-fix",
    category: "swe-fix",
    prompt:
      "The following Python function is supposed to return True iff `target` is in the sorted list `arr`, using binary search, but it has a bug. Fix it. Output ONLY the corrected python code block (the full function body).\n\n```python\ndef contains(arr: list[int], target: int) -> bool:\n    lo, hi = 0, len(arr)\n    while lo < hi:\n        mid = (lo + hi) // 2\n        if arr[mid] == target:\n            return True\n        if arr[mid] < target:\n            lo = mid\n        else:\n            hi = mid\n    return False\n```",
    validator: {
      kind: "exec",
      language: "python",
      suffix: `
arr = [1, 3, 5, 7, 9, 11, 13]
print(contains(arr, 5))
print(contains(arr, 1))
print(contains(arr, 13))
print(contains(arr, 4))
print(contains(arr, 0))
print(contains(arr, 14))
print(contains([], 1))
`,
      cases: [
        {
          stdin: "",
          expected: "True\nTrue\nTrue\nFalse\nFalse\nFalse\nFalse",
          // Buggy original infinite-loops on missing values; our timeout
          // catches that. Fix is `lo = mid + 1`.
        },
      ],
      timeoutSec: 4,
    },
  },

  // ─── 8. SWE: refactor (regex — must remove duplication, keep behavior) ───
  {
    id: "swe-refactor-typescript",
    category: "swe-refactor",
    prompt:
      'Refactor this TypeScript snippet so the three formatters share a single helper. Keep behavior identical. Output ONLY the refactored typescript code block.\n\n```typescript\nfunction formatUSD(n: number): string {\n  return "$" + n.toFixed(2);\n}\nfunction formatEUR(n: number): string {\n  return "€" + n.toFixed(2);\n}\nfunction formatGBP(n: number): string {\n  return "£" + n.toFixed(2);\n}\n```',
    validator: {
      kind: "regex",
      language: "typescript",
      mustMatch: [
        /toFixed\s*\(\s*2\s*\)/,
        // Must contain all three currency symbols somewhere
        /\$/,
        /€/,
        /£/,
      ],
      mustNotMatch: [
        // Crude duplication detector: three separate `toFixed(2)` calls = no refactor.
        // Allow at most two occurrences (one in helper, one elsewhere is fine).
        /toFixed\s*\(\s*2\s*\)[\s\S]*toFixed\s*\(\s*2\s*\)[\s\S]*toFixed\s*\(\s*2\s*\)/,
      ],
    },
  },
];
