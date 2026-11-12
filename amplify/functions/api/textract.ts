/**
 * Calls Amazon Textract with two features:
 *   TABLES  - rebuilds the results table as rows and cells
 *   QUERIES - answers questions like "What is the patient name?"
 * Images use the synchronous API; PDFs (possibly multi-page) use the async job API.
 */
import {
  AnalyzeDocumentCommand,
  GetDocumentAnalysisCommand,
  StartDocumentAnalysisCommand,
  TextractClient,
  type Block,
  type FeatureType,
} from '@aws-sdk/client-textract';
import { QUERIES } from './parser';

const textract = new TextractClient({});

const FEATURES: FeatureType[] = ['TABLES', 'QUERIES'];
const QUERIES_CONFIG = {
  Queries: QUERIES.map((q) => ({ Text: q.text, Alias: q.alias })),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Images (PNG/JPG/TIFF) -> synchronous AnalyzeDocument: one call, instant answer. */
export async function analyzeSync(bucket: string, key: string): Promise<Block[]> {
  const res = await textract.send(
    new AnalyzeDocumentCommand({
      Document: { S3Object: { Bucket: bucket, Name: key } },
      FeatureTypes: FEATURES,
      QueriesConfig: QUERIES_CONFIG,
    }),
  );
  return res.Blocks ?? [];
}

/**
 * PDFs -> asynchronous job:
 * StartDocumentAnalysis returns a JobId, we poll GetDocumentAnalysis until
 * the job finishes, then page through all result blocks with NextToken.
 */
export async function analyzeAsync(bucket: string, key: string): Promise<Block[]> {
  const start = await textract.send(
    new StartDocumentAnalysisCommand({
      DocumentLocation: { S3Object: { Bucket: bucket, Name: key } },
      FeatureTypes: FEATURES,
      QueriesConfig: QUERIES_CONFIG,
    }),
  );
  const JobId = start.JobId!;
  console.log('Started Textract job', JobId);

  const deadline = Date.now() + 100_000;
  let first;
  do {
    await sleep(2000);
    first = await textract.send(new GetDocumentAnalysisCommand({ JobId, MaxResults: 1000 }));
    console.log('Job status', first.JobStatus);
    if (Date.now() > deadline) throw new Error('Textract job timed out');
  } while (first.JobStatus === 'IN_PROGRESS');

  if (first.JobStatus !== 'SUCCEEDED' && first.JobStatus !== 'PARTIAL_SUCCESS') {
    throw new Error(`Textract job ${first.JobStatus}: ${first.StatusMessage ?? ''}`);
  }

  const blocks: Block[] = [...(first.Blocks ?? [])];
  let NextToken = first.NextToken;
  while (NextToken) {
    const page = await textract.send(
      new GetDocumentAnalysisCommand({ JobId, MaxResults: 1000, NextToken }),
    );
    blocks.push(...(page.Blocks ?? []));
    NextToken = page.NextToken;
  }
  return blocks;
}

/** Turns Textract error names into messages a user can act on. */
export function friendlyTextractError(err: unknown): string {
  const name = (err as { name?: string })?.name ?? '';
  const map: Record<string, string> = {
    UnsupportedDocumentException: 'Textract cannot read this file format or the file is damaged.',
    BadDocumentException: 'Textract could not open this document. Try a clearer scan or a PNG/JPG.',
    DocumentTooLargeException: 'The document is too large for Textract (images must be under 10 MB).',
    InvalidS3ObjectException: 'Textract could not find the uploaded file in S3.',
    ProvisionedThroughputExceededException: 'Textract is busy right now. Please try again in a moment.',
    ThrottlingException: 'Textract is busy right now. Please try again in a moment.',
    AccessDeniedException: 'The API is not allowed to call Textract (check the Lambda IAM role).',
  };
  return map[name] ?? (err instanceof Error ? err.message : 'Textract failed');
}
