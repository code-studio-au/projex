import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

test('the root document provides a non-empty accessible title', async () => {
  const source = await readFile(
    resolve('src/components/rootRoute/Document.tsx'),
    'utf8'
  );

  expect(source).toContain('<title>Projex</title>');
});
