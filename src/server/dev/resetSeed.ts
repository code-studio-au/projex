import { assertDevEndpointsEnabled } from './devSession';
import { seedDatabaseToBaseline } from '../db/seedBaseline.ts';

export async function resetDatabaseToSeed(): Promise<void> {
  assertDevEndpointsEnabled();
  await seedDatabaseToBaseline();
}
