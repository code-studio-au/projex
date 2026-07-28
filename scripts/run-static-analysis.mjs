import { spawnSync } from 'node:child_process';
import { globSync } from 'node:fs';

const analyzer = process.argv[2];
const repositoryRoot = process.cwd();
const analyzers = {
  actionlint: {
    image:
      'rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667',
    args: [],
  },
  shellcheck: {
    image:
      'koalaman/shellcheck:v0.11.0@sha256:61862eba1fcf09a484ebcc6feea46f1782532571a34ed51fedf90dd25f925a8d',
    args: globSync('scripts/**/*.sh').sort(),
  },
};

const configuration = analyzers[analyzer];
if (!configuration) {
  throw new Error('Expected analyzer to be shellcheck or actionlint.');
}

const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--volume',
    `${repositoryRoot}:/repo`,
    '--workdir',
    '/repo',
    configuration.image,
    ...configuration.args,
  ],
  { stdio: 'inherit' }
);

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
