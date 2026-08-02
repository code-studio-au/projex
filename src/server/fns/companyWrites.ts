import { AppError } from '../../api/errors';
import type {
  CompanyCreateInput,
  CompanyCreateResult,
  CompanyUpdateInput,
} from '../../api/types';
import type { Company } from '../../types';
import { asCompanyId } from '../../types';
import { uid } from '../../utils/id';
import { omitUndefinedProperties } from '../../utils/optionalProperties';
import {
  companyNameSchema,
  emailSchema,
  userNameSchema,
} from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { requireAuthorized } from '../auth/authorize';
import { isGlobalSuperadminUser } from '../auth/globalSuperadmin';
import { executeAuditedTransaction } from '../db/auditedTransaction';
import { recordAuditLogEvent } from '../logging/auditLogger';
import { getDb } from '../db/db';
import { seedCompanyImportRuleBaseline } from './importRules';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import { ensureCompanyUserMembership } from './companyMemberships';
import { requestPasswordSetupEmail } from './companyUserAuth';
import type { DbLike } from './companyCore';
import { toCompany } from './companyCore';

export async function createCompanyServer(args: {
  context: ServerFnContextInput;
  input: CompanyCreateInput;
}): Promise<CompanyCreateResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    validateOrThrow(companyNameSchema, args.input.name);
    const trimmedAdminName = args.input.initialAdminName?.trim();
    const trimmedAdminEmail = args.input.initialAdminEmail?.trim();
    if (!trimmedAdminName || !trimmedAdminEmail) {
      throw new AppError(
        'VALIDATION_ERROR',
        'Initial admin name and email are required when creating a company.'
      );
    }
    validateOrThrow(userNameSchema, trimmedAdminName);
    validateOrThrow(emailSchema, trimmedAdminEmail);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    const isSuperadmin = await isGlobalSuperadminUser(userId, db);
    if (!isSuperadmin) throw new AppError('FORBIDDEN', 'Forbidden');

    const companyId = args.input.id ?? asCompanyId(uid('co'));
    const trimmedCompanyName = args.input.name.trim();
    let initialAdminResult: CompanyCreateResult['initialAdmin'];

    const company = await executeAuditedTransaction(db, async (trx) => {
      await trx
        .insertInto('companies')
        .values({
          id: companyId,
          name: trimmedCompanyName,
          status: 'active',
          deactivated_at: null,
        })
        .execute();
      await seedCompanyImportRuleBaseline({
        db: trx as DbLike,
        companyId,
      });

      const membership = await ensureCompanyUserMembership({
        db: trx as DbLike,
        companyId,
        name: trimmedAdminName,
        email: trimmedAdminEmail,
        role: 'admin',
      });

      initialAdminResult = {
        user: membership.user,
        createdAuthUser: membership.createdAuthUser,
        membershipCreated: membership.membershipCreated,
        onboardingEmailSent: false,
        onboardingDelivery: 'none',
      };

      await recordAuditLogEvent({
        companyId,
        actorUserId: userId,
        eventClass: 'lifecycle',
        eventType: 'company.created',
        entityType: 'company',
        entityId: companyId,
      });

      return {
        id: companyId,
        name: trimmedCompanyName,
        status: 'active' as const,
      };
    });

    if (initialAdminResult) {
      initialAdminResult = {
        ...initialAdminResult,
        onboardingEmailSent: true,
        onboardingDelivery: await requestPasswordSetupEmail(trimmedAdminEmail),
      };
    }

    return omitUndefinedProperties({
      company,
      initialAdmin: initialAdminResult,
    });
  });
}

export async function updateCompanyServer(args: {
  context: ServerFnContextInput;
  input: CompanyUpdateInput;
}): Promise<Company> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const existing = await db
      .selectFrom('companies')
      .select(['id', 'name', 'status', 'deactivated_at'])
      .where('id', '=', args.input.id)
      .executeTakeFirst();
    if (!existing) throw new AppError('NOT_FOUND', 'Unknown company');

    const userId = await requireServerUserId(args.context);
    await requireAuthorized({
      db,
      userId,
      action: 'company:update_details',
      companyId: args.input.id,
    });

    if (typeof args.input.name === 'string') {
      validateOrThrow(companyNameSchema, args.input.name);
    }

    const patch: Record<string, unknown> = {};
    if (typeof args.input.name === 'string') {
      patch.name = args.input.name.trim();
    }
    if (!Object.keys(patch).length) return toCompany(existing);

    const updated = await db
      .updateTable('companies')
      .set(patch)
      .where('id', '=', args.input.id)
      .returning(['id', 'name', 'status', 'deactivated_at'])
      .executeTakeFirstOrThrow();

    return toCompany(updated);
  });
}
