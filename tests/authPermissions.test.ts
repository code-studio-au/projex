import assert from 'node:assert/strict';
import test from 'node:test';

import { can } from '../src/utils/auth.ts';
import { asCompanyId, asProjectId, asUserId } from '../src/types/index.ts';

const companyId = asCompanyId('co_1');
const projectId = asProjectId('prj_1');
const viewerId = asUserId('usr_viewer');
const memberId = asUserId('usr_member');
const leadId = asUserId('usr_lead');
const managementId = asUserId('usr_management');
const executiveId = asUserId('usr_executive');

test('comment permissions allow members to create but reserve assignment and resolution for leads', () => {
  const companyMemberships = [
    { companyId, userId: viewerId, role: 'member' as const },
    { companyId, userId: memberId, role: 'member' as const },
    { companyId, userId: leadId, role: 'member' as const },
  ];
  const projectMemberships = [
    { projectId, userId: viewerId, role: 'viewer' as const },
    { projectId, userId: memberId, role: 'member' as const },
    { projectId, userId: leadId, role: 'lead' as const },
  ];

  assert.equal(
    can({
      userId: viewerId,
      companyId,
      projectId,
      action: 'comments:create',
      companyMemberships,
      projectMemberships,
    }),
    false
  );
  assert.equal(
    can({
      userId: memberId,
      companyId,
      projectId,
      action: 'comments:create',
      companyMemberships,
      projectMemberships,
    }),
    true
  );
  assert.equal(
    can({
      userId: memberId,
      companyId,
      projectId,
      action: 'comments:assign',
      companyMemberships,
      projectMemberships,
    }),
    false
  );
  assert.equal(
    can({
      userId: leadId,
      companyId,
      projectId,
      action: 'comments:assign',
      companyMemberships,
      projectMemberships,
    }),
    true
  );
  assert.equal(
    can({
      userId: leadId,
      companyId,
      projectId,
      action: 'comments:resolve',
      companyMemberships,
      projectMemberships,
    }),
    true
  );
});

test('company and project permissions split company details, defaults, creation, and lifecycle', () => {
  const companyMemberships = [
    { companyId, userId: managementId, role: 'management' as const },
    { companyId, userId: executiveId, role: 'executive' as const },
  ];
  const projectMemberships: Array<{
    projectId: typeof projectId;
    userId: typeof managementId | typeof executiveId;
    role: 'owner' | 'lead' | 'member' | 'viewer';
  }> = [];

  assert.equal(
    can({
      userId: managementId,
      companyId,
      action: 'company:update_details',
      companyMemberships,
      projectMemberships,
    }),
    true
  );
  assert.equal(
    can({
      userId: managementId,
      companyId,
      action: 'company:manage_defaults',
      companyMemberships,
      projectMemberships,
    }),
    false
  );
  assert.equal(
    can({
      userId: managementId,
      companyId,
      action: 'project:create',
      companyMemberships,
      projectMemberships,
    }),
    false
  );
  assert.equal(
    can({
      userId: executiveId,
      companyId,
      action: 'project:create',
      companyMemberships,
      projectMemberships,
    }),
    true
  );
  assert.equal(
    can({
      userId: executiveId,
      companyId,
      projectId,
      action: 'project:lifecycle',
      companyMemberships,
      projectMemberships,
    }),
    true
  );
});
