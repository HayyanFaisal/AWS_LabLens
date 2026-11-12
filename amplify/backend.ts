import { defineBackend } from '@aws-amplify/backend';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda';
import { BlockPublicAccess, Bucket, BucketEncryption, HttpMethods } from 'aws-cdk-lib/aws-s3';
import { api } from './functions/api/resource';

/**
 * The whole LabLens cloud backend. `npx ampx sandbox` (or an Amplify Hosting
 * build) turns this file into CloudFormation stacks:
 *
 *   api      -> AWS Lambda function + public Function URL (our REST API)
 *   bucket   -> Amazon S3: private bucket for uploaded reports
 *   users    -> Amazon DynamoDB table: username -> salted password hash
 *   reports  -> Amazon DynamoDB table: (username, reportId) -> extracted results
 */
const backend = defineBackend({ api });

// ---------- Storage: one stack for the bucket and both tables ----------
// The function stack depends on this stack (never the other way round),
// so there is no circular dependency.
const dataStack = backend.createStack('lablens-data');

const bucket = new Bucket(dataStack, 'ReportsBucket', {
  blockPublicAccess: BlockPublicAccess.BLOCK_ALL, // nothing is ever public
  encryption: BucketEncryption.S3_MANAGED, // SSE-S3 encryption at rest
  enforceSSL: true, // HTTPS only
  cors: [
    {
      // The browser uploads (PUT) and views (GET) files with presigned URLs
      allowedMethods: [HttpMethods.PUT, HttpMethods.GET],
      allowedOrigins: ['http://localhost:5173', 'https://*.amplifyapp.com'],
      allowedHeaders: ['*'],
      maxAge: 3000,
    },
  ],
  removalPolicy: RemovalPolicy.DESTROY, // demo project: cleanup deletes everything
  autoDeleteObjects: true,
});

const usersTable = new Table(dataStack, 'UsersTable', {
  partitionKey: { name: 'username', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST, // on-demand: pay per request, ~$0 when idle
  removalPolicy: RemovalPolicy.DESTROY,
});

const reportsTable = new Table(dataStack, 'ReportsTable', {
  partitionKey: { name: 'username', type: AttributeType.STRING },
  sortKey: { name: 'reportId', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.DESTROY,
});

// ---------- API Lambda: configuration and least-privilege permissions ----------
const apiLambda = backend.api.resources.lambda;

backend.api.addEnvironment('BUCKET_NAME', bucket.bucketName);
backend.api.addEnvironment('USERS_TABLE', usersTable.tableName);
backend.api.addEnvironment('REPORTS_TABLE', reportsTable.tableName);

bucket.grantRead(apiLambda); // presigned GET, HeadObject, Textract reading the file
bucket.grantPut(apiLambda); // presigned PUT
bucket.grantDelete(apiLambda); // delete report
usersTable.grant(apiLambda, 'dynamodb:GetItem', 'dynamodb:PutItem');
reportsTable.grant(
  apiLambda,
  'dynamodb:GetItem',
  'dynamodb:PutItem',
  'dynamodb:Query',
  'dynamodb:DeleteItem',
);
apiLambda.addToRolePolicy(
  new PolicyStatement({
    actions: [
      'textract:AnalyzeDocument',
      'textract:StartDocumentAnalysis',
      'textract:GetDocumentAnalysis',
    ],
    resources: ['*'], // Textract does not support resource-level permissions
  }),
);

// ---------- Public HTTPS endpoint for the Lambda ----------
// authType NONE = anyone can call the URL; our own token check in handler.ts
// protects every route except register/login.
const functionUrl = apiLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    // "*" is safe here: the token travels in a header, never in a cookie
    allowedOrigins: ['*'],
    allowedMethods: [HttpMethod.GET, HttpMethod.POST, HttpMethod.DELETE],
    allowedHeaders: ['authorization', 'content-type'],
    maxAge: Duration.hours(1),
  },
});

// The frontend reads this from amplify_outputs.json -> custom.apiUrl
backend.addOutput({
  custom: {
    apiUrl: functionUrl.url,
  },
});
