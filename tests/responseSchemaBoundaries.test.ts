import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const featureConsumers = [
  {
    sourcePath: 'src/api/errorResponses.ts',
    schemaModule: '../validation/apiResponseSchemas',
  },
  {
    sourcePath: 'src/queries/transactions.ts',
    schemaModule: '../validation/transactionResponseSchemas',
  },
  {
    sourcePath: 'src/pages/VerifyEmailChangePage.tsx',
    schemaModule: '../validation/accountResponseSchemas',
  },
  {
    sourcePath: 'src/server/auth/betterAuthInstance.ts',
    schemaModule: '../../validation/authResponseSchemas.ts',
  },
];

describe('response schema feature boundaries', () => {
  for (const consumer of featureConsumers) {
    test(`${consumer.sourcePath} imports its narrow schema module`, async () => {
      const source = await readFile(
        path.resolve(process.cwd(), consumer.sourcePath),
        'utf8'
      );

      expect(source).toContain(`from '${consumer.schemaModule}'`);
      expect(source).not.toMatch(
        /from ['"][^'"]*\/validation\/responseSchemas(?:\.ts)?['"]/
      );
    });
  }
});
