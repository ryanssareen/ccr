# CCR Managed Service — Backend

Firebase project hosting Auth, Firestore, and Cloud Functions for the CCR managed service.

## Layout

```
service/
├── firebase.json            # Firebase project config
├── .firebaserc              # Project alias mapping
├── firestore.rules          # Security rules (clients read own user doc only)
├── firestore.indexes.json   # Composite indexes (none required at launch)
└── functions/               # Cloud Functions (TypeScript)
    ├── src/
    │   ├── index.ts         # Entry — re-exports each function
    │   ├── auth.ts          # Unit 3 (signup/login + token exchange)
    │   ├── proxy.ts         # Unit 4 (chat completions proxy)
    │   ├── providers/       # Unit 2 (Groq/Together/Cerebras/OpenRouter)
    │   └── scheduled/       # Unit 5 (monthly quota reset)
    └── test/                # vitest specs
```

## Data model

### `/users/{uid}`

| Field           | Type      | Notes                                              |
|-----------------|-----------|----------------------------------------------------|
| `email`         | string    | Unique; set from Firebase Auth.                    |
| `displayName`   | string?   | Optional, populated for GitHub signups.            |
| `provider`      | string    | `"email"` or `"github"`.                           |
| `tokenHash`     | string    | SHA-256 hex of the user's CCR bearer token.        |
| `quotaUsed`     | number    | Requests served this month.                        |
| `quotaLimit`    | number    | Default `2000`. Per-user override allowed.         |
| `quotaResetAt`  | Timestamp | First of next month UTC.                           |
| `createdAt`     | Timestamp | Server time of signup.                             |
| `updatedAt`     | Timestamp | Server time of most recent write.                  |

Writes are restricted to Admin SDK (Cloud Functions) — clients cannot tamper with `tokenHash` or `quotaUsed`.

### `/providers/{name}` (internal)

| Field           | Type      | Notes                                              |
|-----------------|-----------|----------------------------------------------------|
| `enabled`       | boolean   | Manual kill switch.                                |
| `weight`        | number    | Weighted-random selection (`groq=4`, etc.).        |
| `healthState`   | string    | `"healthy" \| "degraded" \| "unavailable"`.        |
| `failureCount`  | number    | Consecutive upstream failures.                     |
| `lastCheckedAt` | Timestamp | Last health probe time.                            |
| `lastFailureAt` | Timestamp? | Optional, set on most recent failure.             |

API keys are **not** stored in Firestore. They are loaded from Cloud Functions secrets (see `functions/.env.example`).

## Provider names (canonical)

`groq`, `together`, `cerebras`, `openrouter`. Document IDs match these strings.

## First-time setup

These steps create the live Firebase project and configure providers. Run once per environment.

### 1. Install tooling

```bash
npm install -g firebase-tools
firebase login
```

### 2. Create the Firebase project

```bash
# from the repo root:
cd service
firebase projects:create ccr-managed --display-name "CCR Managed"
```

If `ccr-managed` is taken, pick another id and update `.firebaserc`:

```bash
firebase use --add  # interactive picker
```

### 3. Enable services

In the Firebase console (https://console.firebase.google.com):

- **Authentication → Sign-in method**
  - Enable **Email/Password**.
  - Enable **GitHub**. Create a GitHub OAuth app (https://github.com/settings/developers); set the callback to the URL the console shows. Paste client id + client secret into the Firebase form.
- **Firestore Database**
  - Click **Create database**, choose **Production mode**, pick **multi-region** (`nam5` for the US, `eur3` for Europe).
- **Cloud Functions**
  - Upgrade the project to the **Blaze** plan (required for outbound HTTP calls; free tier covers expected usage).

### 4. Set provider API keys

Use Firebase Secret Manager (not `functions:config`, which is deprecated):

```bash
cd functions
firebase functions:secrets:set GROQ_API_KEY
firebase functions:secrets:set TOGETHER_API_KEY
firebase functions:secrets:set CEREBRAS_API_KEY
firebase functions:secrets:set OPENROUTER_API_KEY
```

### 5. Install function deps and deploy

```bash
cd functions
npm install
cd ..
firebase deploy --only firestore,functions
```

## Local development

Use the emulator suite — no production traffic, no provider quota burn:

```bash
cd service
firebase emulators:start
```

Endpoints exposed locally:
- Auth UI:        http://localhost:4000
- Firestore:      http://localhost:8080
- Functions:      http://localhost:5001

Set `CCR_ENDPOINT=http://localhost:5001/<project-id>/<region>` in the CLI to test against the emulator.

## Security notes

- Firestore rules deny all client writes; only Cloud Functions (Admin SDK) can mutate user docs.
- CCR bearer tokens are stored as SHA-256 hashes — never in plaintext.
- Provider API keys live in Secret Manager — never in source control or Firestore.
- The `cli_redirect` parameter on the website's `/cli-auth` page must be validated to start with `http://localhost:` or `http://127.0.0.1:` (enforced in Unit 6).

## Verifying the rules

After deploying rules, sanity-check from the Firebase console:

1. Sign in as user A, look up `/users/<userA-uid>` → succeeds.
2. Sign in as user A, look up `/users/<userB-uid>` → permission denied.
3. Try to write to `/users/<userA-uid>` from the console-signed-in client → permission denied (only Admin SDK can write).

A scripted test using `@firebase/rules-unit-testing` lives in `functions/test/rules.test.ts` (added by Unit 3).
