import { defineFunction, secret } from '@aws-amplify/backend';

/**
 * The whole LabLens API is ONE AWS Lambda function, reached through a
 * Lambda Function URL (a plain HTTPS endpoint, no API Gateway needed).
 * handler.ts routes each request (/auth/..., /reports/...) to the right code.
 *
 * TOKEN_SECRET is an Amplify secret (stored encrypted in SSM Parameter Store),
 * used to sign login tokens. Set it with:
 *   npx ampx sandbox secret set TOKEN_SECRET
 */
export const api = defineFunction({
  name: 'lablens-api',
  entry: './handler.ts',
  timeoutSeconds: 120, // multi-page PDFs use async Textract and need time
  memoryMB: 512,
  environment: {
    TOKEN_SECRET: secret('TOKEN_SECRET'),
  },
});
