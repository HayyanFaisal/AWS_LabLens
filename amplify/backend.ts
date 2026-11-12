import { defineBackend } from '@aws-amplify/backend';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { processReport } from './functions/process-report/resource';

/**
 * The whole cloud backend in one place. When you run `npx ampx sandbox`,
 * Amplify turns these definitions into real AWS resources:
 *   auth          -> Amazon Cognito (sign-up / sign-in)
 *   storage       -> Amazon S3 bucket (uploaded lab reports)
 *   data          -> AWS AppSync GraphQL API + Amazon DynamoDB tables
 *   processReport -> AWS Lambda function that calls Amazon Textract
 */
const backend = defineBackend({
  auth,
  data,
  storage,
  processReport,
});

// Tell the Lambda which bucket the reports are in.
backend.processReport.addEnvironment(
  'BUCKET_NAME',
  backend.storage.resources.bucket.bucketName,
);

// Allow the Lambda to call Textract (sync + async document analysis).
backend.processReport.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      'textract:AnalyzeDocument',
      'textract:StartDocumentAnalysis',
      'textract:GetDocumentAnalysis',
    ],
    resources: ['*'],
  }),
);
