import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'projex-contract-tests-'));
const outFile = path.join(tmpDir, 'adapter-contract.test.mjs');

execSync(
  `node_modules/.bin/esbuild tests/adapter-contract.test.ts --bundle --platform=node --format=esm --outfile=${outFile}`,
  { stdio: 'inherit' }
);

execSync(`node --test ${outFile}`, { stdio: 'inherit' });
