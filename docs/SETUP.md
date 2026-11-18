# How LabLens configures AWS Amplify and Amazon Textract

Everything runs in **us-east-1 (N. Virginia)**. Live app: https://main.d2jc5ol5znqp3n.amplifyapp.com
(Amplify app `AWS_LabLens`, id `d2jc5ol5znqp3n`, branch `main`).

---

## 0. One-time account setup

| Step | What we did | Why |
|---|---|---|
| Account plan | Upgraded the AWS account from the **Free plan to the Paid plan** (credits still apply first) | The Free plan blocks Textract: every call failed with `SubscriptionRequiredException` |
| Budgets | A **$5 monthly cost budget** and a **$2 alert** in Billing → Budgets | An email before any surprise charge |
| Deploy user | IAM user `lablens-deployer`, no console access, policy **`AmplifyBackendDeployFullAccess`**, one CLI access key | Never deploy with the root user |
| CLI profile | `npx ampx configure profile --name lablens` (keys typed into the terminal, never into code or chat) | The sandbox deploys with this profile |
| CDK bootstrap | Amplify console bootstrap page → **Initialize setup** (once per account and region) | Amplify Gen 2 deploys through AWS CDK, which needs a `CDKToolkit` stack |

---

## 1. AWS Amplify

### 1.1 Backend as code (Amplify Gen 2)

All of the backend lives in two TypeScript files:

**`amplify/functions/api/resource.ts`**: one Lambda function

```ts
defineFunction({
  name: 'lablens-api', entry: './handler.ts',
  timeoutSeconds: 120, memoryMB: 512,                 // Node.js 22
  environment: { TOKEN_SECRET: secret('TOKEN_SECRET') }, // signing key from SSM, never in Git
});
```

**`amplify/backend.ts`**: everything else

- `defineBackend({ api })` registers the function.
- `backend.createStack('lablens-data')` holds plain AWS CDK resources:
  - **S3 bucket**: blocks all public access, SSE-S3 encryption, HTTPS only, CORS for
    `http://localhost:5173` and `https://*.amplifyapp.com` (browser PUT/GET with presigned URLs),
    a lifecycle rule that deletes anything under `ids/` after 1 day, and a destroy policy.
  - **DynamoDB `UsersTable`**: partition key `username`, on-demand billing.
  - **DynamoDB `ReportsTable`**: partition key `username`, sort key `reportId`, on-demand billing.
- **Least-privilege permissions** for the function:
  bucket read/put/delete; Users `GetItem`/`PutItem`/`UpdateItem`; Reports `GetItem`/`PutItem`/`Query`/`DeleteItem`;
  Textract `AnalyzeDocument`, `StartDocumentAnalysis`, `GetDocumentAnalysis`.
- **Function URL**: `authType: NONE` (our own signed-token check protects every route but sign-in),
  CORS for `GET POST PUT DELETE` with `authorization` and `content-type` headers.
- `backend.addOutput({ custom: { apiUrl } })` writes the API address into `amplify_outputs.json`,
  which the React app reads in `src/api.ts`, so no URL is hard-coded.

We deliberately did **not** use `defineAuth` (Cognito) or `defineData` (AppSync): one function with our own
token auth is smaller and fully explainable. The trade-off is no MFA or password reset.

### 1.2 Development: the sandbox

```bash
npx ampx sandbox secret set TOKEN_SECRET --profile lablens   # paste a random 32-byte value
npx ampx sandbox --once --profile lablens                     # deploy a private copy (about 2 min first time)
npm run dev                                                   # React app on http://localhost:5173
```

The sandbox is a personal set of CloudFormation stacks (`amplify-labreportdigitizer-<user>-sandbox-…`).

### 1.3 Production: Amplify Hosting with CI/CD

Console steps (Amplify → **Create new app**):

1. **Choose source code provider**: GitHub. Grant the **Amplify GitHub App** access to `HayyanFaisal/AWS_LabLens`.
2. **Repository and branch**: `AWS_LabLens`, branch `main`.
3. **App settings**: framework auto-detected as **Amplify Gen 2**; build command `npm run build`, output `dist`;
   service role **Create and use a new service role**.
4. **Review → Save and deploy**.
5. **Hosting → Secrets → Manage secrets**: add `TOKEN_SECRET` for the branch (a different random value from the sandbox).

What each build runs (`amplify.yml`):

```yaml
backend:  npm ci  →  npx ampx pipeline-deploy --branch $AWS_BRANCH --app-id $AWS_APP_ID
frontend: npm run build  →  publish dist/ to the CDN
```

From then on, **every `git push` to `main` deploys the backend and the website** (production has its own
Lambda, tables and bucket, separate from the sandbox).

Lesson learned: the first build failed because `npm ci` rejected `package-lock.json`. Locks written by npm 11
can be rejected by the npm 10 in the build image; regenerate with `npx npm@10 install --package-lock-only`.

---

## 2. Amazon Textract

Textract has **nothing to create**: no instance, no model, no console setup. It is an API that our Lambda calls,
allowed by the account plan (Paid) and by the three IAM actions above. Textract reads the file **directly from our
S3 bucket** with the Lambda's permissions, so documents never pass through Lambda memory as uploads.

How we call it (`amplify/functions/api/textract.ts`):

| Document | API | Settings |
|---|---|---|
| Lab report image (PNG/JPG/TIFF) | `AnalyzeDocument` (synchronous) | `FeatureTypes: [TABLES, QUERIES]` + 4 queries |
| Lab report PDF (multi-page) | `StartDocumentAnalysis` → `GetDocumentAnalysis` (asynchronous) | same features; poll every 2 s (up to 100 s), then page through results with `NextToken`, 1000 blocks per page |
| ID card at sign-up | `AnalyzeDocument` (synchronous) | `FeatureTypes: [QUERIES]` only |

The queries we send:

- Lab report: *What is the patient name? · What is the report date? · What is the sample collection date? · What is the name of the laboratory?*
- ID card: *What is the name of the card holder? · What is the date of birth? · What is the gender? · What is the identity card number?*

What we do with the response (`parser.ts`, `rules.ts`):

- TABLE and CELL blocks are rebuilt into rows; the header row tells us which column is the test, result, unit and range.
- Range text (`70 - 99`, `< 200`, `> 40`, `Up to 7.0`) becomes low/high limits; values are flagged LOW / NORMAL / HIGH.
- Each cell's **Confidence** is kept; values under **80%** get a warning.
- Each row's **Geometry.BoundingBox** is kept, so the app can draw the row over the original image.
- A document with no table, fewer than 3 numeric results, or no reference ranges is saved as "Not accepted".
- ID card answers are normalised (dates, sex); only the **last 4 digits** of the ID number are stored, and the photo is deleted.

### Measured on real Textract (sandbox, 2026-11-18)

| Document | Mode | Textract time | Blocks | Result |
|---|---|---|---|---|
| 1-page report image | sync | 1.6–2.1 s | 314 | 6 tests, 6 out of range, patient/lab/date correct |
| 2-page report PDF | async | about 6.5 s | 629 | 16 tests, 1 out of range |
| Pharmacy receipt | sync | about 1.1 s | 98 | correctly rejected |
| CNIC-style specimen card | sync, Queries | about 0.9 s | 66 | name 96%, date of birth 98%, sex 100%, ID 98% |

Fixes made after the first real runs: Textract sometimes drops a thin dash in ranges (`13.0 17.0`), so the parser
accepts two rising numbers as a range; the warning threshold moved from 90% to 80% because correct cells often
come back at 85–92%; the ID card watermark was moved off the data fields.

---

## 3. Pricing (us-east-1)

Textract per-page prices, first 1,000,000 pages a month, as reported by the AWS console assistant on 2026-11-18
(check https://aws.amazon.com/textract/pricing before quoting):

| Feature | Price per page |
|---|---|
| Detect Document Text (plain OCR) | $0.0015 |
| Analyze Document: Tables + Queries | $0.02 |
| Analyze Document: Forms | $0.05 |
| Analyze Expense (invoices, receipts) | $0.01 |

What LabLens uses: **Tables + Queries** for every report page, **Queries** for each ID card.
Example: 100 one-page reports ≈ 100 × $0.02 = **about $2**. New accounts also get a 3-month Textract free tier
(100 pages a month for the Analyze Document features).

Amplify Hosting is billed for build minutes, storage and data served, with a free tier
(https://aws.amazon.com/amplify/pricing). Lambda, DynamoDB on-demand and S3 are billed per request and per GB,
which is close to nothing while the app is idle.

Guard rails: the $5 monthly budget and the $2 alert.

---

## 4. Cleanup after the course

```bash
npx ampx sandbox delete --profile lablens     # removes the sandbox stacks, tables and bucket
```

Then in the Amplify console delete the `AWS_LabLens` app (removes hosting and the production backend), delete the
`lablens-deployer` access key, and confirm in Billing that charges return to zero.
