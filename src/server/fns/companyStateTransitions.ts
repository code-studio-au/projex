import { AppError } from '../../api/errors';
import type { CompanyId } from '../../types';
import { isGlobalSuperadminUser } from '../auth/globalSuperadmin';
import { recordAuditEvent } from '../audit/auditEvents';
import { getDb } from '../db/db';
import { deleteCompanyExportObject } from '../storage/exportObjectStore.ts';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';

export async function deactivateCompanyServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const sessionUserId = await requireServerUserId(args.context);
    const isSuperadmin = await isGlobalSuperadminUser(sessionUserId, db);
    if (!isSuperadmin) throw new AppError('FORBIDDEN', 'Forbidden');

    const company = await db
      .selectFrom('companies')
      .select(['id', 'status'])
      .where('id', '=', args.companyId)
      .executeTakeFirst();
    if (!company) throw new AppError('NOT_FOUND', 'Company not found');
    if (company.status === 'deactivated') return;

    const now = new Date().toISOString();
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('companies')
        .set({ status: 'deactivated', deactivated_at: now })
        .where('id', '=', args.companyId)
        .execute();

      await recordAuditEvent({
        db: trx,
        companyId: args.companyId,
        actorUserId: sessionUserId,
        eventClass: 'lifecycle',
        eventType: 'company.deactivated',
        entityType: 'company',
        entityId: args.companyId,
        reason: 'Deactivated company and archived active projects',
        previousState: { status: company.status },
        resultingState: { status: 'deactivated' },
        nowIso: now,
      });

      await trx
        .updateTable('projects')
        .set({ status: 'archived', deactivated_at: now })
        .where('company_id', '=', args.companyId)
        .where('status', '=', 'active')
        .execute();

      const memberRows = await trx
        .selectFrom('company_memberships as memberships')
        .innerJoin('users', 'users.id', 'memberships.user_id')
        .select([
          'memberships.user_id as user_id',
          'users.disabled as disabled',
          'users.disabled_reason as disabled_reason',
          'users.is_global_superadmin as is_global_superadmin',
        ])
        .where('memberships.company_id', '=', args.companyId)
        .execute();
      const memberIds = memberRows.map((row) => row.user_id);
      if (!memberIds.length) return;

      const otherActiveMembershipRows = await trx
        .selectFrom('company_memberships as memberships')
        .innerJoin('companies', 'companies.id', 'memberships.company_id')
        .select('memberships.user_id')
        .where('memberships.user_id', 'in', memberIds)
        .where('memberships.company_id', '!=', args.companyId)
        .where('companies.status', '=', 'active')
        .execute();
      const usersWithOtherActiveCompanies = new Set(
        otherActiveMembershipRows.map((row) => row.user_id)
      );
      const disableIds = memberRows
        .filter((row) => !row.is_global_superadmin)
        .filter((row) => !usersWithOtherActiveCompanies.has(row.user_id))
        .filter(
          (row) =>
            !row.disabled || row.disabled_reason === 'company_deactivated'
        )
        .map((row) => row.user_id);
      if (!disableIds.length) return;

      await trx
        .updateTable('users')
        .set({
          disabled: true,
          disabled_reason: 'company_deactivated',
        })
        .where('id', 'in', disableIds)
        .execute();
    });
  });
}

export async function reactivateCompanyServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const sessionUserId = await requireServerUserId(args.context);
    const isSuperadmin = await isGlobalSuperadminUser(sessionUserId, db);
    if (!isSuperadmin) throw new AppError('FORBIDDEN', 'Forbidden');

    const company = await db
      .selectFrom('companies')
      .select(['id', 'status'])
      .where('id', '=', args.companyId)
      .executeTakeFirst();
    if (!company) throw new AppError('NOT_FOUND', 'Company not found');
    if (company.status === 'active') return;

    await db.transaction().execute(async (trx) => {
      const now = new Date().toISOString();
      await trx
        .updateTable('companies')
        .set({ status: 'active', deactivated_at: null })
        .where('id', '=', args.companyId)
        .execute();

      await recordAuditEvent({
        db: trx,
        companyId: args.companyId,
        actorUserId: sessionUserId,
        eventClass: 'lifecycle',
        eventType: 'company.reactivated',
        entityType: 'company',
        entityId: args.companyId,
        reason: 'Reactivated company and archived projects',
        previousState: { status: company.status },
        resultingState: { status: 'active' },
        nowIso: now,
      });

      await trx
        .updateTable('projects')
        .set({ status: 'active', deactivated_at: null })
        .where('company_id', '=', args.companyId)
        .where('status', '=', 'archived')
        .execute();

      const memberRows = await trx
        .selectFrom('company_memberships as memberships')
        .innerJoin('users', 'users.id', 'memberships.user_id')
        .select([
          'memberships.user_id as user_id',
          'users.disabled_reason as disabled_reason',
        ])
        .where('memberships.company_id', '=', args.companyId)
        .execute();
      const reenableIds = memberRows
        .filter((row) => row.disabled_reason === 'company_deactivated')
        .map((row) => row.user_id);
      if (!reenableIds.length) return;

      await trx
        .updateTable('users')
        .set({ disabled: false, disabled_reason: null })
        .where('id', 'in', reenableIds)
        .execute();
    });
  });
}

export async function deleteCompanyServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  confirmation: string;
}): Promise<void> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const sessionUserId = await requireServerUserId(args.context);
    const isSuperadmin = await isGlobalSuperadminUser(sessionUserId, db);
    if (!isSuperadmin) throw new AppError('FORBIDDEN', 'Forbidden');

    const company = await db
      .selectFrom('companies')
      .select(['id', 'name', 'status'])
      .where('id', '=', args.companyId)
      .executeTakeFirst();
    if (!company) throw new AppError('NOT_FOUND', 'Company not found');
    if (args.confirmation.trim() !== `DELETE ${company.name}`) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Confirmation text does not match the company name'
      );
    }
    if (company.status !== 'deactivated') {
      throw new AppError(
        'VALIDATION_ERROR',
        'Company must be deactivated before deletion'
      );
    }

    const exportObjects = await db
      .selectFrom('company_export_jobs')
      .select(['storage_bucket', 'storage_key'])
      .where('company_id', '=', args.companyId)
      .where('storage_bucket', 'is not', null)
      .where('storage_key', 'is not', null)
      .execute();

    for (const row of exportObjects) {
      await deleteCompanyExportObject({
        bucket: row.storage_bucket!,
        key: row.storage_key!,
      });
    }

    await db.transaction().execute(async (trx) => {
      const affectedUserIds = (
        await trx
          .selectFrom('company_memberships')
          .select('user_id')
          .where('company_id', '=', args.companyId)
          .distinct()
          .execute()
      ).map((row) => row.user_id);

      await recordAuditEvent({
        db: trx,
        companyId: args.companyId,
        actorUserId: sessionUserId,
        eventClass: 'lifecycle',
        eventType: 'company.deleted',
        entityType: 'company',
        entityId: args.companyId,
        reason: 'Permanently deleted deactivated company',
        previousState: { name: company.name, status: company.status },
        resultingState: { deleted: true },
      });

      await trx
        .deleteFrom('companies')
        .where('id', '=', args.companyId)
        .execute();

      if (!affectedUserIds.length) return;

      await trx
        .deleteFrom('users')
        .where('id', 'in', affectedUserIds)
        .where('is_global_superadmin', '=', false)
        .where(
          'id',
          'not in',
          trx
            .selectFrom('company_memberships')
            .select('company_memberships.user_id')
            .distinct()
        )
        .execute();
    });
  });
}
