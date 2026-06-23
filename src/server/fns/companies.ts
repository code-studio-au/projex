import { sql } from 'kysely';

import { AppError } from '../../api/errors';
import type {
  CompanyCreateInput,
  CompanyCreateResult,
  CompanyUpdateInput,
  CompanyUserInviteResult,
  ProfileUpdateInput,
} from '../../api/types';
import type {
  Company,
  CompanyId,
  CompanyRole,
  CompanySummary,
  ProjectId,
  User,
  UserId,
} from '../../types';
import { asCompanyId, asProjectId, asUserId } from '../../types';
import { buildCompanySummaryProjects } from '../../utils/companySummary';
import { uid } from '../../utils/id';
import {
  companyNameSchema,
  emailSchema,
  userNameSchema,
} from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { requireAuthorized } from '../auth/authorize';
import { isGlobalSuperadminUser } from '../auth/globalSuperadmin';
import { getDb } from '../db/db';
import { deleteCompanyExportObject } from '../storage/exportObjectStore.ts';
import { listProjectsServer } from './projects';
import { seedCompanyImportRuleBaseline } from './importRules';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import { enforceRateLimit } from '../rateLimit';
import {
  createBetterAuthUser,
  findBetterAuthUserByEmail,
  reconcileAppUserToAuthIdentity,
  requestPasswordSetupEmail,
} from './companyUserAuth';

const COMPANY_INVITE_RATE_LIMIT = {
  limit: 10,
  windowMs: 10 * 60 * 1000,
} as const;

const COMPANY_ROLE_RANK: Record<CompanyRole, number> = {
  admin: 4,
  executive: 3,
  management: 2,
  member: 1,
};

type DbLike = ReturnType<typeof getDb>;

function toCompany(row: {
  id: string;
  name: string;
  status: 'active' | 'deactivated';
  deactivated_at: string | null;
}): Company {
  return {
    id: asCompanyId(row.id),
    name: row.name,
    status: row.status,
    deactivatedAt: row.deactivated_at ?? undefined,
  };
}

export async function listCompaniesServer(args: {
  context: ServerFnContextInput;
}): Promise<Company[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    const isSuperadmin = await isGlobalSuperadminUser(userId, db);

    if (isSuperadmin) {
      const rows = await db
        .selectFrom('companies')
        .select(['id', 'name', 'status', 'deactivated_at'])
        .orderBy('name', 'asc')
        .execute();
      return rows.map(toCompany);
    }

    const rows = await db
      .selectFrom('companies as c')
      .innerJoin('company_memberships as m', 'm.company_id', 'c.id')
      .select(['c.id', 'c.name', 'c.status', 'c.deactivated_at'])
      .where('m.user_id', '=', userId)
      .where('c.status', '=', 'active')
      .orderBy('c.name', 'asc')
      .execute();

    return rows.map(toCompany);
  });
}

export async function getCompanyServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<Company | null> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    const isSuperadmin = await isGlobalSuperadminUser(userId, db);

    if (!isSuperadmin) {
      const membership = await db
        .selectFrom('company_memberships')
        .select('company_id')
        .where('company_id', '=', args.companyId)
        .where('user_id', '=', userId)
        .executeTakeFirst();
      if (!membership) return null;
    }

    const company = await db
      .selectFrom('companies')
      .select(['id', 'name', 'status', 'deactivated_at'])
      .where('id', '=', args.companyId)
      .executeTakeFirst();
    if (!company) return null;
    if (!isSuperadmin && company.status === 'deactivated') return null;
    return toCompany(company);
  });
}

export async function getCompanySummaryServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<CompanySummary> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    const isSuperadmin = await isGlobalSuperadminUser(userId, db);
    const companyRole =
      (
        await db
          .selectFrom('company_memberships')
          .select('role')
          .where('company_id', '=', args.companyId)
          .where('user_id', '=', userId)
          .executeTakeFirst()
      )?.role ?? null;

    if (
      !isSuperadmin &&
      companyRole !== 'admin' &&
      companyRole !== 'executive'
    ) {
      throw new AppError(
        'FORBIDDEN',
        'Company summary access requires admin or executive role'
      );
    }

    const projects = await listProjectsServer({
      context: args.context,
      companyId: args.companyId,
    });
    if (!projects.length) return { projects: [] };

    const projectIds = projects.map((project) => project.id);

    const subCategoryRows = await db
      .selectFrom('sub_categories')
      .select(['project_id', 'id'])
      .where('project_id', 'in', projectIds)
      .execute();

    const txnRows = await db
      .selectFrom('txns')
      .select([
        'project_id',
        'txn_date',
        'amount_cents',
        'budget_impact',
        'sub_category_id',
      ])
      .where('project_id', 'in', projectIds)
      .execute();

    const validSubIdsByProject = new Map<ProjectId, Set<string>>();
    for (const row of subCategoryRows) {
      const projectId = asProjectId(row.project_id);
      const current = validSubIdsByProject.get(projectId) ?? new Set<string>();
      current.add(row.id);
      validSubIdsByProject.set(projectId, current);
    }

    return {
      projects: buildCompanySummaryProjects({
        projects,
        transactions: txnRows.map((row) => ({
          projectId: asProjectId(row.project_id),
          date: row.txn_date,
          amountCents: Number(row.amount_cents ?? 0),
          budgetImpact: row.budget_impact,
          subCategoryId: row.sub_category_id,
        })),
        validSubCategoryIdsByProject: validSubIdsByProject,
      }),
    };
  });
}

export async function listUsersServer(args: {
  context: ServerFnContextInput;
}): Promise<User[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    const isSuperadmin = await isGlobalSuperadminUser(userId, db);

    if (isSuperadmin) {
      const rows = await db
        .selectFrom('users')
        .select(['id', 'email', 'name', 'disabled', 'is_global_superadmin'])
        .orderBy('name', 'asc')
        .execute();
      return rows.map((r) => ({
        id: asUserId(r.id),
        email: r.email,
        name: r.name,
        disabled: r.disabled || undefined,
        isGlobalSuperadmin: r.is_global_superadmin || undefined,
      }));
    }

    const companyRows = await db
      .selectFrom('company_memberships')
      .innerJoin('companies', 'companies.id', 'company_memberships.company_id')
      .select('company_memberships.company_id')
      .where('user_id', '=', userId)
      .where('companies.status', '=', 'active')
      .execute();
    const companyIds = companyRows.map((r) => r.company_id);
    if (!companyIds.length) return [];

    const rows = await db
      .selectFrom('users as u')
      .innerJoin('company_memberships as m', 'm.user_id', 'u.id')
      .select([
        'u.id',
        'u.email',
        'u.name',
        'u.disabled',
        'u.is_global_superadmin',
      ])
      .where('m.company_id', 'in', companyIds)
      .groupBy([
        'u.id',
        'u.email',
        'u.name',
        'u.disabled',
        'u.is_global_superadmin',
      ])
      .orderBy('u.name', 'asc')
      .execute();

    return rows.map((r) => ({
      id: asUserId(r.id),
      email: r.email,
      name: r.name,
      disabled: undefined,
      isGlobalSuperadmin: undefined,
    }));
  });
}

export async function getDefaultCompanyIdForUserServer(args: {
  context: ServerFnContextInput;
}): Promise<CompanyId | null> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    const isSuperadmin = await isGlobalSuperadminUser(userId, db);

    if (isSuperadmin) {
      const companies = await db
        .selectFrom('companies')
        .select(['id', 'status'])
        .orderBy('id', 'asc')
        .execute();
      const preferred =
        companies.find((c) => c.status === 'active') ?? companies[0];
      return preferred ? asCompanyId(preferred.id) : null;
    }

    const memberships = await db
      .selectFrom('company_memberships as m')
      .innerJoin('companies as c', 'c.id', 'm.company_id')
      .select(['m.company_id', 'm.role', 'c.status'])
      .where('m.user_id', '=', userId)
      .execute();
    if (!memberships.length) return null;

    const ranked = memberships
      .slice()
      .sort(
        (a, b) =>
          (COMPANY_ROLE_RANK[b.role] ?? 0) - (COMPANY_ROLE_RANK[a.role] ?? 0)
      );

    const activePrimary = ranked.find((m) => m.status === 'active');
    if (activePrimary) return asCompanyId(activePrimary.company_id);

    return asCompanyId(ranked[0].company_id);
  });
}

export async function updateCurrentUserProfileServer(args: {
  context: ServerFnContextInput;
  input: ProfileUpdateInput;
}): Promise<User> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    validateOrThrow(userNameSchema, args.input.name);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    const nextName = args.input.name.trim();

    await db
      .updateTable('users')
      .set({ name: nextName })
      .where('id', '=', userId)
      .execute();

    await sql`
      update ba_user
      set name = ${nextName}
      where id = ${userId}
    `.execute(db);

    const row = await db
      .selectFrom('users')
      .select(['id', 'email', 'name', 'disabled'])
      .where('id', '=', userId)
      .executeTakeFirst();

    if (!row) throw new AppError('NOT_FOUND', 'Unknown user');

    return {
      id: asUserId(row.id),
      email: row.email,
      name: row.name,
      disabled: row.disabled || undefined,
    };
  });
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
    validateOrThrow(userNameSchema, args.name);
    validateOrThrow(emailSchema, args.email);

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

    const emailNorm = args.email.trim().toLowerCase();
    const trimmedName = args.name.trim();
    const trimmedEmail = args.email.trim();

    let authUser = await findBetterAuthUserByEmail(db, emailNorm);
    let createdAuthUser = false;
    if (!authUser) {
      authUser = await createBetterAuthUser(db, trimmedEmail, trimmedName);
      createdAuthUser = true;
    }

    const user = await reconcileAppUserToAuthIdentity({
      db,
      authUser,
      preferredName: trimmedName,
    });

    const existingMembership = await db
      .selectFrom('company_memberships')
      .select('user_id')
      .where('company_id', '=', args.companyId)
      .where('user_id', '=', user.id)
      .executeTakeFirst();

    await db
      .insertInto('company_memberships')
      .values({
        company_id: args.companyId,
        user_id: user.id,
        role: args.role,
      })
      .onConflict((oc) =>
        oc.columns(['company_id', 'user_id']).doUpdateSet({
          role: args.role,
        })
      )
      .execute();

    const shouldSendOnboardingEmail =
      createdAuthUser || !!args.sendOnboardingEmail;
    const onboardingDelivery = shouldSendOnboardingEmail
      ? await requestPasswordSetupEmail(trimmedEmail)
      : 'none';
    return {
      user,
      createdAuthUser,
      membershipCreated: !existingMembership,
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
    let initialAdminResult: CompanyUserInviteResult | undefined;

    const company = await db.transaction().execute(async (trx) => {
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

      if (trimmedAdminName && trimmedAdminEmail) {
        const emailNorm = trimmedAdminEmail.toLowerCase();
        let authUser = await findBetterAuthUserByEmail(
          trx as DbLike,
          emailNorm
        );
        let createdAuthUser = false;
        if (!authUser) {
          authUser = await createBetterAuthUser(
            trx as DbLike,
            trimmedAdminEmail,
            trimmedAdminName
          );
          createdAuthUser = true;
        }

        const user = await reconcileAppUserToAuthIdentity({
          db: trx as DbLike,
          authUser,
          preferredName: trimmedAdminName,
        });

        const existingMembership = await trx
          .selectFrom('company_memberships')
          .select('user_id')
          .where('company_id', '=', companyId)
          .where('user_id', '=', user.id)
          .executeTakeFirst();

        await trx
          .insertInto('company_memberships')
          .values({
            company_id: companyId,
            user_id: user.id,
            role: 'admin',
          })
          .onConflict((oc) =>
            oc.columns(['company_id', 'user_id']).doUpdateSet({ role: 'admin' })
          )
          .execute();

        initialAdminResult = {
          user,
          createdAuthUser,
          membershipCreated: !existingMembership,
          onboardingEmailSent: false,
          onboardingDelivery: 'none',
        };
      }

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
        onboardingDelivery: await requestPasswordSetupEmail(
          trimmedAdminEmail as string
        ),
      };
    }

    return {
      company,
      initialAdmin: initialAdminResult,
    };
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
    if (typeof args.input.name === 'string')
      patch.name = args.input.name.trim();
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
      const memberIds = memberRows.map((r) => r.user_id);
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
      await trx
        .updateTable('companies')
        .set({ status: 'active', deactivated_at: null })
        .where('id', '=', args.companyId)
        .execute();

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
