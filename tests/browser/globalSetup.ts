import { sweepSmokeFixtures } from '../../src/server/smoke/fixtures';

export default async function globalSetup() {
  if (process.env.PROJEX_SMOKE_SWEEP_STALE !== 'true') return;

  await sweepSmokeFixtures({
    onStatus(message) {
      console.info(`[..] ${message}`);
    },
  });
}
