import { seedDatabaseToBaseline } from './seedBaseline.ts';

async function run() {
  await seedDatabaseToBaseline();
  console.log('Baseline seed complete');
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
