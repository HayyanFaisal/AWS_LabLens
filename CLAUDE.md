# LabLens: Build & Deploy Brief for Claude Code

> **How to use:** unzip `lab-report-digitizer.zip`, open that folder in Claude Code
> (model: **Opus 5.5, effort high**), and paste everything below the line as your first message.
> Keep this file in the project root as `CLAUDE.md` so Claude Code re-reads it in later sessions.

---

## Who we are and what this is for

We are **Hayyan Faisal (23F-3108)** and **Ali Sajjad (23I-0110)**, university students presenting a
**Cloud Services** project. We registered two AWS services: **AWS Amplify** and **Amazon Textract**.
We are graded on: introduction (10), technical depth (25), **live hands-on demo (30)**,
presentation (15), teamwork (10) and Q&A (10). So the app must **work reliably live**, be
**deployed on AWS**, and we must be able to **explain every part of it**.

The project is **LabLens**, a lab report digitizer. A user signs up, uploads a photo or PDF of a
blood test report, Amazon Textract reads the results table and answers questions about the
report, our code flags each value LOW / NORMAL / HIGH against its printed reference range, the
results are saved permanently, and a trends page charts each test over time.

## Starting point (read this first)

This folder already contains a working, tested version built on Amplify Gen 2 with
**Cognito + AppSync**. We are **removing Cognito and AppSync** to keep the architecture minimal
and easy to explain. **Keep and reuse** these as-is unless a change is needed:

- `amplify/functions/process-report/parser.ts`: Textract blocks → tests, header detection,
  range parsing, flags. **Tested**; do not rewrite it. Run `npm run test:parser`.
- `amplify/functions/process-report/parser.test.ts`
- `amplify/functions/process-report/handler.ts`: Textract sync (images) vs async (PDF) logic;
  reuse its `analyzeSync` / `analyzeAsync` functions inside the new API.
- `src/components/*`, `src/styles.css`: the UI screens (Upload, My reports, Report detail, Trends).
- `samples/`: 3 fictional reports (PNG, tilted JPG "phone photo", 2-page PDF).

Before changing anything: read the whole repo, run `npm install`, `npm run test:parser`, and
summarise the current architecture back to me in a few lines.

## Target architecture (what to build)

```
Browser (React + Vite) ── served by ──► Amplify Hosting (CI/CD from GitHub)
   │
   ├─ HTTPS (JSON + Bearer token) ─► Lambda API  (Amplify Function + Function URL)
   │                                   ├─► DynamoDB  Users table
   │                                   ├─► DynamoDB  Reports table
   │                                   ├─► S3        (presigned URLs, reads files)
   │                                   └─► Amazon Textract (TABLES + QUERIES)
   └─ PUT file via presigned URL ───► S3 bucket  reports/<username>/<uuid>-<file>
```

**Removed:** `amplify/auth` (Cognito), `amplify/data` (AppSync), `@aws-amplify/ui-react`
Authenticator, `aws-amplify/data` and `aws-amplify/storage` client calls.

**Everything must still be defined in the Amplify Gen 2 backend** (`amplify/backend.ts`), so
`npx ampx sandbox` and Amplify Hosting deploy it all. Create the S3 bucket and DynamoDB
tables as custom CDK resources in `backend.ts` (e.g. `backend.createStack('lablens')`) and
the API as an Amplify `defineFunction`. Watch for circular stack dependencies (the existing code
used `resourceGroupName` for this); verify with a synth/sandbox deploy.

Expose the API URL to the frontend with `backend.addOutput({ custom: { apiUrl } })`, so it lands
in `amplify_outputs.json`. Do not hard-code URLs.

### Region and constraints
- Region **us-east-1** for everything (Textract Queries support).
- **Do not use** Bedrock, the Amplify AI Kit, Comprehend, Rekognition, Polly, Translate or
  Transcribe (other groups registered those).
- Keep cost near zero: DynamoDB on-demand, no NAT/VPC, small Lambda, `RemovalPolicy.DESTROY`
  plus `autoDeleteObjects` on sandbox resources so cleanup is one command.

## Backend spec

### DynamoDB tables (on-demand billing)
- **Users**: PK `username` (string). Attributes: `passwordHash`, `salt`, `createdAt`.
- **Reports**: PK `username`, SK `reportId` (string). Attributes: `fileKey`, `fileName`,
  `patientName`, `labName`, `reportDate` (YYYY-MM-DD), `pages`, `mode` (sync|async),
  `status` (DONE|FAILED), `errorMessage`, `testCount`, `abnormalCount`, `createdAt`,
  `queryAnswers` (list), `tests` (list of `{testName, value, rawValue, unit, rangeText,
  rangeLow, rangeHigh, flag, confidence, page}`). Storing tests inside the report item is
  intentional: one read per report, simple to explain.

### S3 bucket
Block all public access, SSE-S3 encryption, enforce SSL. CORS allows `PUT` and `GET` from
`http://localhost:5173` and `https://*.amplifyapp.com`.

### Authentication (our own, no Cognito)
- Passwords: `crypto.scrypt` with a random 16-byte salt; compare with `crypto.timingSafeEqual`.
  Never store or log plain passwords.
- Token: compact signed token (HMAC-SHA256, JWT-style `header.payload.signature` is fine, built
  with `node:crypto`, no extra library) with `sub=username` and `exp` = 12 hours.
- Signing secret: Amplify Gen 2 **`secret('TOKEN_SECRET')`**. Tell me the exact
  `npx ampx sandbox secret set TOKEN_SECRET` command and where to set it in the Amplify Hosting
  console for the deployed branch.
- Username: 3–30 chars `[a-z0-9_]`; password at least 8 chars. Return a generic
  "invalid username or password" error on failed login.

### API routes (one Lambda, Function URL, JSON, CORS enabled)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/register` | none | create user, return token |
| POST | `/auth/login` | none | verify, return token |
| GET | `/auth/me` | token | return username |
| POST | `/reports/upload-url` | token | body `{fileName, contentType}` → presigned PUT URL (5 min) + `fileKey` under `reports/<username>/` |
| POST | `/reports/analyze` | token | body `{fileKey, fileName}` → run Textract + parser, save report, return it |
| GET | `/reports` | token | list user's reports (summary fields only) |
| GET | `/reports/{id}` | token | full report incl. tests |
| GET | `/reports/{id}/file-url` | token | presigned GET URL for the original file |
| DELETE | `/reports/{id}` | token | delete item + S3 object |

Rules:
- **Ownership check:** `/reports/analyze` must reject any `fileKey` that does not start with
  `reports/<token username>/`. (This closes a gap in the old version; we will mention it in Q&A.)
- Accept only PNG/JPG/PDF/TIFF, max 10 MB, max 50 reports per user.
- Lambda timeout 120 s, 512 MB. Log `Textract returned N blocks in X ms` (we show it in CloudWatch
  during the demo). Never log tokens or passwords.
- Lambda IAM: only `textract:AnalyzeDocument`, `textract:StartDocumentAnalysis`,
  `textract:GetDocumentAnalysis`, read/write on the two tables, read/write/delete on the bucket.
- If the public Function URL returns 403, check its resource policy (newer accounts need both
  `lambda:InvokeFunctionUrl` and `lambda:InvokeFunction`). If that becomes a fight, ask me
  before switching to an API Gateway HTTP API.

## Frontend spec
- Replace the Amplify Authenticator with our own **Login / Register** screen (same visual style).
  Store the token in `localStorage`; on 401 log the user out.
- Add `src/api.ts` (fetch wrapper that reads `apiUrl` from `amplify_outputs.json` and attaches
  `Authorization: Bearer <token>`); remove `src/client.ts` usage.
- Upload flow keeps the 3-step progress UI, relabelled:
  **Upload** (presigned URL → S3) → **Analyze** (Lambda → Textract) → **Save** (DynamoDB).
- My reports: list + **Refresh** button (no real-time any more). Report detail and Trends keep
  their current behaviour, reading from the new API.
- Header shows the logged-in username and Sign out. Footer: "Built with AWS Amplify + Amazon
  Textract · Hayyan Faisal & Ali Sajjad · Demo only, not medical advice".

## How to work with me (important)
1. **Plan first.** After reading the repo, show me a short plan and the list of files you will
   add, change and delete. Wait for my OK.
2. **Never ask me to paste AWS access keys or secrets into the chat.** I will run
   `npx ampx configure profile` (or `aws configure`) myself; just tell me what to run.
3. **Ask before** any command that deploys, deletes or costs money (`ampx sandbox`,
   `ampx sandbox delete`, AWS console actions). Explain in one line what it will do.
4. Work in small steps, run `npm run test:parser`, `npx tsc --noEmit` and `npm run build` after
   each step, and fix errors before moving on. Commit with clear messages as you go.
5. Explain things simply. We need to understand and present every part.

## Phases and checkpoints

**Phase 1: Refactor locally.** Backend + frontend per the spec. All checks pass.
Add backend unit tests for: password hash/verify, token sign/verify/expiry, ownership check.

**Phase 2: Sandbox deploy.** Guide me through: AWS account (Paid plan, credits still
apply), a **$5 budget alert**, IAM user with `AmplifyBackendDeployFullAccess`,
`npx ampx configure profile`, CDK bootstrap if prompted, setting `TOKEN_SECRET`,
`npx ampx sandbox`. Then `npm run dev` and test end-to-end with all three samples
(PNG = sync, JPG = sync, 2-page PDF = async). Fix anything that breaks.

**Phase 3: Production deploy.** Push to a GitHub repo; connect it in the **Amplify console**
(`amplify.yml` already exists, update if needed); set `TOKEN_SECRET` for the branch; confirm
the live `*.amplifyapp.com` URL works end-to-end. Then demonstrate CI/CD: change a visible
word, push, and watch it redeploy.

**Phase 4: Demo readiness.**
- Create a demo account and pre-load the March and June samples so Trends has history; keep
  the September PDF to upload live.
- Show me where to find the Lambda logs (CloudWatch), the DynamoDB items, and the S3 objects
  in the console, since we will show these live.
- Capture clean screenshots (deviceScaleFactor 2) of login, upload result, report detail,
  trends, the Amplify console build, the DynamoDB table and CloudWatch logs into
  `docs/screenshots/` for our slides.

**Phase 5: Documentation for our presentation.** Update `README.md`:
- Project summary, team names and roll numbers, live URL.
- **Service introductions** (rubric item 1): what Amplify and Textract are, their general use
  cases beyond our project, and pricing basics (link the AWS pricing pages; do not invent prices).
- Architecture diagram (Mermaid) and the 3 workflows: sign up/login, upload and analyze,
  view/trends.
- Textract features used (TABLES, QUERIES, confidence, sync vs async with NextToken paging) and
  how `parser.ts` decides LOW/NORMAL/HIGH/UNKNOWN.
- Security design (scrypt, signed tokens, ownership check, private bucket, least-privilege
  IAM) and **honest limitations** (custom auth is simpler than Cognito, no MFA or password reset,
  synthetic data only, not a medical device).
- A 10-minute demo script split between **Hayyan** and **Ali** with handover points.
- 12–15 likely Q&A questions with short, accurate answers.
- Cleanup: `npx ampx sandbox delete`, delete the Amplify app, and check that billing is empty.

## Definition of done
- The live Amplify URL works: register → login → upload PNG/JPG/PDF → flagged results → trends.
- Data persists across refresh, logout/login and devices.
- All tests, typecheck and build pass; no secrets in the repo.
- README has everything in Phase 5, and screenshots are in `docs/screenshots/`.
