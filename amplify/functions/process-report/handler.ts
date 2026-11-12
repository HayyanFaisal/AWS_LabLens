import {
  TextractClient,
  AnalyzeDocumentCommand,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand,
  type Block,
  type FeatureType,
} from '@aws-sdk/client-textract';
import type { Schema } from '../../data/resource';
import { parseTextract, QUERIES } from './parser';

const textract = new TextractClient({});

const FEATURES: FeatureType[] = ['TABLES', 'QUERIES'];
const QUERIES_CONFIG = {
  Queries: QUERIES.map((q) => ({ Text: q.text, Alias: q.alias })),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Images (PNG/JPG) -> synchronous AnalyzeDocument: one call, instant answer. */
async function analyzeSync(bucket: string, key: string): Promise<Block[]> {
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
 * PDFs (can be multi-page) -> asynchronous job:
 * StartDocumentAnalysis returns a JobId, we poll GetDocumentAnalysis until
 * the job finishes, then page through all result blocks with NextToken.
 */
async function analyzeAsync(bucket: string, key: string): Promise<Block[]> {
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

export const handler: Schema['processReport']['functionHandler'] = async (event) => {
  const { fileKey } = event.arguments;
  const bucket = process.env.BUCKET_NAME;
  if (!bucket) throw new Error('BUCKET_NAME is not configured');

  // Only accept files from the private reports area, with supported types
  if (!fileKey.startsWith('reports/') || fileKey.includes('..')) {
    throw new Error('Invalid file key');
  }
  if (!/\.(png|jpe?g|pdf|tiff?)$/i.test(fileKey)) {
    throw new Error('Unsupported file type. Use PNG, JPG, PDF or TIFF.');
  }

  const isPdf = /\.pdf$/i.test(fileKey);
  const t0 = Date.now();
  const blocks = isPdf ? await analyzeAsync(bucket, fileKey) : await analyzeSync(bucket, fileKey);
  console.log(`Textract returned ${blocks.length} blocks in ${Date.now() - t0} ms`);

  return parseTextract(blocks, isPdf ? 'async' : 'sync');
};
