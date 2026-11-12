/** Shared AWS SDK clients and the resource names that backend.ts passes in. */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
export const s3 = new S3Client({});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export const env = {
  bucket: () => required('BUCKET_NAME'),
  usersTable: () => required('USERS_TABLE'),
  reportsTable: () => required('REPORTS_TABLE'),
  tokenSecret: () => {
    const secret = required('TOKEN_SECRET');
    if (secret.length < 32) throw new Error('TOKEN_SECRET must be at least 32 characters');
    return secret;
  },
};
