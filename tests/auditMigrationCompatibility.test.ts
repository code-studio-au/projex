import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from 'vitest';

test('the logger release preserves the legacy audit contract for N-1 rollback', async () => {
  const [compatibilityMarker, forwardRepair, deployScript] = await Promise.all([
    readFile(
      path.resolve('src/server/db/migrations/0036_drop_audit_events.sql'),
      'utf8'
    ),
    readFile(
      path.resolve(
        'src/server/db/migrations/0037_restore_audit_n1_compatibility.sql'
      ),
      'utf8'
    ),
    readFile(path.resolve('scripts/deploy-artifact-ec2.sh'), 'utf8'),
  ]);

  expect(compatibilityMarker).not.toMatch(/^\s*drop\s+(?:table|function)\b/imu);
  expect(compatibilityMarker).toContain('rollback to N-1 remains');
  expect(forwardRepair).toMatch(/create table if not exists audit_events/iu);
  expect(forwardRepair).toMatch(
    /create or replace function prevent_audit_event_mutation\(\)/iu
  );
  expect(forwardRepair).toMatch(/create trigger trg_audit_events_immutable/iu);
  expect(deployScript.indexOf('Running database migrations')).toBeLessThan(
    deployScript.indexOf('Activating release')
  );
  expect(deployScript).toContain('rollback_release');
});
