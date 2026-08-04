import { AppError } from '../../api/errors';
import type { CompanyUserInviteResult } from '../../api/types';
import type { CompanyId, CompanyRole, UserId } from '../../types';
import { asUserId } from '../../types';
import { emailSchema, userNameSchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { requireAuthorized } from '../auth/authorize';
import { executeAuditedTransaction } from '../db/auditedTransaction';
import { recordAuditLogEvent } from '../logging/auditLogger';
import { getDb } from '../db/db';
import { enforceRateLimit } from '../rateLimit';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import {
  createBetterAuthUser,
  findBetterAuthUserByEmail,
  reconcileAppUserToAuthIdentity,
  requestPasswordSetupEmail,
} from './companyUserAuth';
import type { DbLike } from './companyCore';

const COMPANY_INVITE_RATE_LIMIT = {
  limit: 10,
  windowMs: 10 * 60 * 1000,
} as const;

export async function ensureCompanyUserMembership(args: {
  db: DbLike;
  companyId: CompanyId;
  name: string;
  email: string;
  role: CompanyRole;
}) {
  validateOrThrow(userNameSchema, args.name);
  validateOrThrow(emailSchema, args.email);

  const emailNorm = args.email.trim().toLowerCase();
  const trimmedName = args.name.trim();
  const trimmedEmail = args.email.trim();

  let authUser = await findBetterAuthUserByEmail(args.db, emailNorm);
  let createdAuthUser = false;
  if (!authUser) {
    authUser = await createBetterAuthUser(args.db, trimmedEmail, trimmedName);
    createdAuthUser = true;
  }

  const user = await reconcileAppUserToAuthIdentity({
    db: args.db,
    authUser,
    preferredName: trimmedName,
  });

  const existingMembership = await args.db
    .selectFrom('company_memberships')
    .select(['user_id', 'role'])
    .where('company_id', '=', args.companyId)
    .where('user_id', '=', user.id)
    .executeTakeFirst();

  if (existingMembership && existingMembership.role !== args.role) {
    throw new AppError(
      'VALIDATION_ERROR',
      'This user is already a company member. Review role changes in Current members.'
    );
  }

  if (!existingMembership) {
    await args.db
      .insertInto('company_memberships')
      .values({
        company_id: args.companyId,
        user_id: user.id,
        role: args.role,
      })
      .execute();
  }

  return {
    user,
    createdAuthUser,
    membershipCreated: !existingMembership,
    previousRole: existingMembership?.role ?? null,
    trimmedEmail,
  };
}

export async function createUserInCompanyServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  name: string;
  email: string;
  role: CompanyRole;
  sendOnboardingEmail?: boolean;
}): Promise<CompanyUserInviteResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();

    const sessionUserId = await requireServerUserId(args.context);
    await requireAuthorized({
      db,
      userId: sessionUserId,
      action: 'company:manage_members',
      companyId: args.companyId,
    });
    await enforceRateLimit({
      db,
      bucket: `company-membership-create:${args.companyId}:${sessionUserId}`,
      limit: COMPANY_INVITE_RATE_LIMIT.limit,
      windowMs: COMPANY_INVITE_RATE_LIMIT.windowMs,
      message:
        'Too many company invite actions. Please wait a few minutes and try again.',
    });

    const membership = await executeAuditedTransaction(db, async (trx) => {
      const result = await ensureCompanyUserMembership({
        db: trx,
        companyId: args.companyId,
        name: args.name,
        email: args.email,
        role: args.role,
      });
      if (result.membershipCreated) {
        await recordAuditLogEvent({
          companyId: args.companyId,
          actorUserId: sessionUserId,
          eventClass: 'membership',
          eventType: 'company_membership.created',
          entityType: 'company_membership',
          entityId: `${args.companyId}:${result.user.id}`,
          reasonCode: `assigned_${args.role}`,
        });
      }
      return result;
    });

    const shouldSendOnboardingEmail =
      membership.createdAuthUser || !!args.sendOnboardingEmail;
    const onboardingDelivery = shouldSendOnboardingEmail
      ? await requestPasswordSetupEmail(membership.trimmedEmail)
      : 'none';

    return {
      user: membership.user,
      createdAuthUser: membership.createdAuthUser,
      membershipCreated: membership.membershipCreated,
      onboardingEmailSent: shouldSendOnboardingEmail,
      onboardingDelivery,
    };
  });
}

export async function sendCompanyUserInviteEmailServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  userId: UserId;
}): Promise<CompanyUserInviteResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();

    const sessionUserId = await requireServerUserId(args.context);
    await requireAuthorized({
      db,
      userId: sessionUserId,
      action: 'company:manage_members',
      companyId: args.companyId,
    });
    await enforceRateLimit({
      db,
      bucket: `company-invite-email:${args.companyId}:${sessionUserId}`,
      limit: COMPANY_INVITE_RATE_LIMIT.limit,
      windowMs: COMPANY_INVITE_RATE_LIMIT.windowMs,
      message:
        'Too many invite emails. Please wait a few minutes and try again.',
    });

    const membership = await db
      .selectFrom('company_memberships')
      .select(['company_id', 'user_id'])
      .where('company_id', '=', args.companyId)
      .where('user_id', '=', args.userId)
      .executeTakeFirst();
    if (!membership) {
      throw new AppError('NOT_FOUND', 'User is not a member of this company');
    }

    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'name', 'disabled'])
      .where('id', '=', args.userId)
      .executeTakeFirst();
    if (!user) {
      throw new AppError('NOT_FOUND', 'User not found');
    }

    const onboardingDelivery = await requestPasswordSetupEmail(
      user.email.trim()
    );
    return {
      user: {
        id: asUserId(user.id),
        email: user.email,
        name: user.name,
        disabled: user.disabled,
      },
      createdAuthUser: false,
      membershipCreated: false,
      onboardingEmailSent: true,
      onboardingDelivery,
    };
  });
}
