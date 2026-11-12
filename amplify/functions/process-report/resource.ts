import { defineFunction } from '@aws-amplify/backend';

/**
 * AWS Lambda function that sends a lab report to Amazon Textract
 * and turns Textract's raw output into clean test results.
 *
 * resourceGroupName 'storage' places it in the same stack as the S3 bucket,
 * which avoids a circular dependency between the function and storage.
 */
export const processReport = defineFunction({
  name: 'process-report',
  entry: './handler.ts',
  timeoutSeconds: 120, // multi-page PDFs use async Textract and need time
  memoryMB: 512,
  resourceGroupName: 'storage',
});
