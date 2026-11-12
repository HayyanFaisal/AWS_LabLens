import { a, defineData, type ClientSchema } from '@aws-amplify/backend';
import { processReport } from '../functions/process-report/resource';

/**
 * Data layer: Amplify builds an AWS AppSync GraphQL API with
 * Amazon DynamoDB tables from this schema.
 *
 * - Report      one uploaded lab report
 * - TestResult  one row of the report (e.g. Hemoglobin 11.2 g/dL)
 * - processReport  custom mutation -> runs the Textract Lambda
 *
 * allow.owner() means every user only ever sees their own records.
 */
const schema = a.schema({
  Report: a
    .model({
      fileKey: a.string().required(),
      fileName: a.string(),
      patientName: a.string(),
      labName: a.string(),
      reportDate: a.string(), // normalised to YYYY-MM-DD when possible
      pages: a.integer(),
      mode: a.string(), // "sync" (image) or "async" (PDF)
      status: a.enum(['PROCESSING', 'DONE', 'FAILED']),
      errorMessage: a.string(),
      testCount: a.integer(),
      abnormalCount: a.integer(),
      results: a.hasMany('TestResult', 'reportId'),
    })
    .authorization((allow) => [allow.owner()]),

  TestResult: a
    .model({
      reportId: a.id().required(),
      report: a.belongsTo('Report', 'reportId'),
      reportDate: a.string(), // copied from Report so trends are easy to chart
      testName: a.string().required(),
      value: a.float(),
      rawValue: a.string(),
      unit: a.string(),
      rangeText: a.string(),
      rangeLow: a.float(),
      rangeHigh: a.float(),
      flag: a.enum(['LOW', 'NORMAL', 'HIGH', 'UNKNOWN']),
      confidence: a.float(),
      page: a.integer(),
    })
    .authorization((allow) => [allow.owner()]),

  // Shapes returned by the Lambda (not stored directly)
  ExtractedTest: a.customType({
    testName: a.string().required(),
    value: a.float(),
    rawValue: a.string(),
    unit: a.string(),
    rangeText: a.string(),
    rangeLow: a.float(),
    rangeHigh: a.float(),
    flag: a.string(),
    confidence: a.float(),
    page: a.integer(),
  }),

  QueryAnswer: a.customType({
    question: a.string(),
    answer: a.string(),
    confidence: a.float(),
  }),

  ExtractionResult: a.customType({
    patientName: a.string(),
    labName: a.string(),
    reportDate: a.string(),
    pages: a.integer(),
    mode: a.string(),
    tables: a.integer(),
    queryAnswers: a.ref('QueryAnswer').array(),
    tests: a.ref('ExtractedTest').array(),
  }),

  processReport: a
    .mutation()
    .arguments({ fileKey: a.string().required() })
    .returns(a.ref('ExtractionResult'))
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(processReport)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
