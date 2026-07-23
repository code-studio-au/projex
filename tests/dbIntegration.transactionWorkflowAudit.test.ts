import assert from 'node:assert/strict';
import test from 'node:test';

import {
  listTransactionsPageServer,
  requestTxnUnlockServer,
  resolveTxnUnlockRequestServer,
  updateTxnWorkflowStateServer,
} from '../src/server/fns/transactions';
import { asCompanyId, asProjectId, asTxnId, asUserId } from '../src/types';
import {
  createIntegrationDb,
  integrationDatabaseUrl,
} from './dbIntegration.helpers';

test(
  'unlock requests separate editor and reviewer permissions with immutable versioned audit events',
  { skip: !integrationDatabaseUrl },
  async () => {
    const db = createIntegrationDb();
    const companyId = asCompanyId('itest_workflow_audit_co_1');
    const projectId = asProjectId('itest_workflow_audit_prj_1');
    const memberUserId = asUserId('itest_workflow_audit_member_1');
    const reviewerUserId = asUserId('itest_workflow_audit_reviewer_1');
    const txnId = asTxnId('itest_workflow_audit_txn_1');
    const startedAt = new Date().toISOString();

    try {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [memberUserId, reviewerUserId])
        .execute();
      await db
        .insertInto('companies')
        .values({
          id: companyId,
          name: 'Workflow Audit Co',
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await db
        .insertInto('users')
        .values([
          {
            id: memberUserId,
            email: 'workflow-audit-member@example.com',
            name: 'Workflow member',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
          {
            id: reviewerUserId,
            email: 'workflow-audit-reviewer@example.com',
            name: 'Workflow reviewer',
            disabled: false,
            disabled_reason: null,
            is_global_superadmin: false,
          },
        ])
        .execute();
      await db
        .insertInto('company_memberships')
        .values([
          { company_id: companyId, user_id: memberUserId, role: 'member' },
          { company_id: companyId, user_id: reviewerUserId, role: 'admin' },
        ])
        .execute();
      await db
        .insertInto('projects')
        .values({
          id: projectId,
          company_id: companyId,
          name: 'Workflow Audit Project',
          project_type: 'project',
          parent_project_id: null,
          budget_total_cents: 0,
          currency: 'AUD',
          status: 'active',
          deactivated_at: null,
          visibility: 'private',
          allow_superadmin_access: true,
          sync_company_defaults: false,
          allow_txn_transfers: false,
        })
        .execute();
      await db
        .insertInto('project_memberships')
        .values({
          project_id: projectId,
          user_id: memberUserId,
          role: 'member',
        })
        .execute();
      await db
        .insertInto('txns')
        .values({
          public_id: txnId,
          external_id: 'workflow-audit-external-1',
          company_id: companyId,
          project_id: projectId,
          txn_date: '2026-07-01',
          item: 'Workflow audit transaction',
          description: 'Lock and unlock lifecycle',
          amount_cents: 1500,
          txn_type: 'standard',
          parent_public_id: null,
          source_public_id: null,
          transfer_project_id: null,
          budget_impact: true,
          categorisable: true,
          import_batch_id: null,
          import_source_type: null,
          import_source_meta: null,
          category_id: null,
          sub_category_id: null,
          company_default_mapping_rule_id: null,
          coding_source: null,
          coding_pending_approval: false,
          reviewed_at: null,
          reviewed_by_user_id: null,
          locked_at: null,
          locked_by_user_id: null,
          created_at: startedAt,
          updated_at: startedAt,
        })
        .execute();

      const locked = await updateTxnWorkflowStateServer({
        context: { session: { userId: memberUserId } },
        projectId,
        input: { txnId, expectedWorkflowVersion: 0, locked: true },
      });
      assert.equal(locked.workflowVersion, 1);
      assert.ok(locked.reviewedAt);
      assert.ok(locked.lockedAt);

      const request = await requestTxnUnlockServer({
        context: { session: { userId: memberUserId } },
        projectId,
        input: {
          txnId,
          expectedWorkflowVersion: 1,
          reason: 'Coding needs to be corrected',
        },
      });
      assert.equal(request.status, 'pending');

      const reviewPage = await listTransactionsPageServer({
        context: { session: { userId: reviewerUserId } },
        projectId,
        input: {
          pageIndex: 0,
          pageSize: 20,
          transactionView: 'needs-review',
        },
      });
      assert.equal(reviewPage.rows[0]?.pendingUnlockRequest?.id, request.id);

      await assert.rejects(
        resolveTxnUnlockRequestServer({
          context: { session: { userId: memberUserId } },
          projectId,
          input: {
            requestId: request.id,
            expectedRequestVersion: request.version,
            decision: 'approve',
            reason: 'Member cannot approve their own request',
          },
        }),
        (error: unknown) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'FORBIDDEN'
      );

      const unlocked = await resolveTxnUnlockRequestServer({
        context: { session: { userId: reviewerUserId } },
        projectId,
        input: {
          requestId: request.id,
          expectedRequestVersion: request.version,
          decision: 'approve',
          reason: 'Correction is justified',
        },
      });
      assert.equal(unlocked.workflowVersion, 3);
      assert.equal(unlocked.lockedAt, undefined);
      assert.ok(unlocked.reviewedAt, 'unlock preserves review state');

      await assert.rejects(
        resolveTxnUnlockRequestServer({
          context: { session: { userId: reviewerUserId } },
          projectId,
          input: {
            requestId: request.id,
            expectedRequestVersion: request.version,
            decision: 'reject',
            reason: 'Stale second decision',
          },
        }),
        (error: unknown) =>
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'CONFLICT'
      );

      const auditRows = await db
        .selectFrom('audit_events')
        .select(['id', 'event_type', 'reason', 'retention_class'])
        .where('company_id', '=', companyId)
        .where('entity_type', '=', 'transaction')
        .where('entity_id', '=', txnId)
        .where('created_at', '>=', startedAt)
        .orderBy('created_at', 'asc')
        .execute();
      assert.deepEqual(
        auditRows.map((row) => row.event_type),
        [
          'transaction.locked',
          'transaction.unlock_requested',
          'transaction.unlock_approved',
        ]
      );
      assert.equal(auditRows[1]?.reason, 'Coding needs to be corrected');
      assert.ok(auditRows.every((row) => row.retention_class === 'financial'));

      await assert.rejects(
        db
          .updateTable('audit_events')
          .set({ reason: 'Attempted audit rewrite' })
          .where('id', '=', auditRows[0]!.id)
          .execute(),
        /audit events are immutable/
      );
    } finally {
      await db.deleteFrom('companies').where('id', '=', companyId).execute();
      await db
        .deleteFrom('users')
        .where('id', 'in', [memberUserId, reviewerUserId])
        .execute();
      await db.destroy();
    }
  }
);
