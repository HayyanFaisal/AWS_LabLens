import { defineStorage } from '@aws-amplify/backend';
import { processReport } from '../functions/process-report/resource';

/**
 * Amazon S3 bucket for uploaded lab reports.
 * Each user gets a private folder: reports/<their identity id>/...
 * Only the owner can read/write their folder; the Textract Lambda can read.
 */
export const storage = defineStorage({
  name: 'labReports',
  access: (allow) => ({
    'reports/{entity_id}/*': [
      allow.entity('identity').to(['read', 'write', 'delete']),
      allow.resource(processReport).to(['read']),
    ],
  }),
});
