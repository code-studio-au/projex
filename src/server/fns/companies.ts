import { randomBytes } from 'node:crypto';
import { sql } from 'kysely';

import { AppError } from '../../api/errors';
import type {
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
import { asCompanyId, asUserId } from '../../types';
import { buildCompanySummaryProjects } from '../../utils/companySummary';
import { uid } from '../../utils/id';
import {
  companyNameSchema,
  emailSchema,
  userNameSchema,
} from '../../validation/schemas';
import { betterAuthSignUpResponseSchema } from '../../validation/responseSchemas';
import { validateOrThrow } from '../../validation/validate';
import { requireAuthorized } from '../auth/authorize';
import { getBetterAuthInstance } from '../auth/betterAuthInstance';
import { isGlobalSuperadminUser } from '../auth/globalSuperadmin';
import { getAuthEmailDeliveryMode } from '../auth/email.ts';
import { getDb } from '../db/db';
import { listProjectsServer } from './projects';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';

const COMPANY_ROLE_RANK: Record<CompanyRole, number> = {
  admin: 4,
  executive: 3,
  management: 2,
  member: 1,
};

function toCompany(row: {
  id: string;
  name: string;
  status: 'active' | 'deactivated';
  deactivated_at: string | null;
}): Company {
  return {
    id: row.id as CompanyId,
    name: row.name,
    status: row.status,
    deactivatedAt: row.deactivated_at ?? undefined,
  };
}

type BetterAuthUserRow = {
  id: string;
  email: string;
  name: string;
};

async function findBetterAuthUserByEmail(
  emailNorm: string
): Promise<BetterAuthUserRow | null> {
  const db = getDb();
  const result = await sql<BetterAuthUserRow>`
    select id, email, name
    from ba_user
    where lower(email) = ${emailNorm}
    limit 1
  `.execute(db);
  return result.rows[0] ?? null;
}

async function createBetterAuthUser(
  email: string,
  name: string
): Promise<BetterAuthUserRow> {
  const auth = getBetterAuthInstance();
  const response = await auth.api.signUpEmail({
    body: {
      email,
      name,
      password: randomBytes(24).toString('hex'),
    },
  });
  const payload = betterAuthSignUpResponseSchema.parse(response);
  const userId = payload.user.id.trim();
  return {
    id: userId,
    email: payload.user.email?.trim() || email,
    name: payload.user.name?.trim() || name,
  };
}

function getResetPasswordRedirectUrl(): string {
  const configured = process.env.PROJEX_AUTH_RESET_REDIRECT_URL?.trim();
  if (configured) return configured;
  const base = process.env.BETTER_AUTH_URL?.trim();
  if (!base) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Missing BETTER_AUTH_URL while preparing invite password setup redirect'
    );
  }
  return new URL('/reset-password', base).toString();
}

async function requestPasswordSetupEmail(
  email: string
): Promise<'email' | 'log'> {
  const base = process.env.BETTER_AUTH_URL?.trim();
  if (!base) {
    throw new AppError(
      'INTERNAL_ERROR',
      'Missing BETTER_AUTH_URL while requesting invite password setup email'
    );
  }

  const endpoint = new URL('/api/auth/request-password-reset', base).toString();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: base,
      referer: base,
    },
    body: JSON.stringify({
      email,
      redirectTo: getResetPasswordRedirectUrl(),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AppError(
      'INTERNAL_ERROR',
      `Could not request invite password setup email (${res.status}): ${text || 'empty response'}`
    );
  }

  return getAuthEmailDeliveryMode();
}

async function reconcileAppUserToAuthIdentity(args: {
  authUser: BetterAuthUserRow;
  preferredName: string;
}): Promise<User> {
  const db = getDb();
  const emailNorm = args.authUser.email.trim().toLowerCase();
  const existingByEmail = await db
    .selectFrom('users')
    .select(['id', 'email', 'name', 'disabled'])
    .where(sql<boolean>`lower(email) = ${emailNorm}`)
    .executeTakeFirst();

  if (!existingByEmail) {
    await db
      .insertInto('users')
      .values({
        id: args.authUser.id,
        email: args.authUser.email,
        name: args.preferredName,
        disabled: false,
        is_global_superadmin: false,
      })
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({
          email: args.authUser.email,
          name: args.preferredName,
        })
      )
      .execute();

    return {
      id: asUserId(args.authUser.id),
      email: args.authUser.email,
      name: args.preferredName,
    };
  }

  if (existingByEmail.id === args.authUser.id) {
    await db
      .updateTable('users')
      .set({
        email: args.authUser.email,
        name: args.preferredName,
        disabled: false,
      })
      .where('id', '=', args.authUser.id)
      .execute();

    return {
      id: asUserId(args.authUser.id),
      email: args.authUser.email,
      name: args.preferredName,
    };
  }

  const conflictingById = await db
    .selectFrom('users')
    .select(['id', 'email'])
    .where('id', '=', args.authUser.id)
    .executeTakeFirst();

  if (
    conflictingById &&
    conflictingById.email.trim().toLowerCase() !== emailNorm
  ) {
    throw new AppError(
      'CONFLICT',
      'A different app user already uses the BetterAuth account id for this email'
    );
  }

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('users')
      .values({
        id: args.authUser.id,
        email: args.authUser.email,
        name: args.preferredName,
        disabled: false,
        is_global_superadmin: false,
      })
      .onConflict((oc) =>
        oc.column('id').doUpdateSet({
          email: args.authUser.email,
          name: args.preferredName,
          disabled: false,
        })
      )
      .execute();

    await sql`
      insert into company_memberships (company_id, user_id, role)
      select company_id, ${args.authUser.id}, role
      from company_memberships
      where user_id = ${existingByEmail.id}
      on conflict (company_id, user_id) do update
      set role = excluded.role
    `.execute(trx);

    await sql`
      insert into project_memberships (project_id, user_id, role)
      select project_id, ${args.authUser.id}, role
      from project_memberships
      where user_id = ${existingByEmail.id}
      on conflict (project_id, user_id) do update
      set role = excluded.role
    `.execute(trx);

    await trx
      .deleteFrom('users')
      .where('id', '=', existingByEmail.id)
      .execute();
  });

  return {
    id: asUserId(args.authUser.id),
    email: args.authUser.email,
    name: args.preferredName,
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
      .select(['project_id', 'txn_date', 'amount_cents', 'sub_category_id'])
      .where('project_id', 'in', projectIds)
      .execute();

    const validSubIdsByProject = new Map<ProjectId, Set<string>>();
    for (const row of subCategoryRows) {
      const projectId = row.project_id as ProjectId;
      const current = validSubIdsByProject.get(projectId) ?? new Set<string>();
      current.add(row.id);
      validSubIdsByProject.set(projectId, current);
    }

    return {
      projects: buildCompanySummaryProjects({
        projects,
        transactions: txnRows.map((row) => ({
          projectId: row.project_id as ProjectId,
          date: row.txn_date,
          amountCents: Number(row.amount_cents ?? 0),
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
        id: r.id as UserId,
        email: r.email,
        name: r.name,
        disabled: r.disabled || undefined,
        isGlobalSuperadmin: r.is_global_superadmin || undefined,
      }));
    }

    const companyRows = await db
      .selectFrom('company_memberships')
      .select('company_id')
      .where('user_id', '=', userId)
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
      id: r.id as UserId,
      email: r.email,
      name: r.name,
      disabled: r.disabled || undefined,
      isGlobalSuperadmin: r.is_global_superadmin || undefined,
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
      id: row.id as UserId,
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

    const emailNorm = args.email.trim().toLowerCase();
    const trimmedName = args.name.trim();
    const trimmedEmail = args.email.trim();

    let authUser = await findBetterAuthUserByEmail(emailNorm);
    let createdAuthUser = false;
    if (!authUser) {
      authUser = await createBetterAuthUser(trimmedEmail, trimmedName);
      createdAuthUser = true;
    }

    const user = await reconcileAppUserToAuthIdentity({
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
  input: Pick<Company, 'name'> & { id?: CompanyId };
}): Promise<Company> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    validateOrThrow(companyNameSchema, args.input.name);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    const isSuperadmin = await isGlobalSuperadminUser(userId, db);
    if (!isSuperadmin) throw new AppError('FORBIDDEN', 'Forbidden');

    const companyId = args.input.id ?? asCompanyId(uid('co'));
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto('companies')
        .values({
          id: companyId,
          name: args.input.name.trim(),
          status: 'active',
          deactivated_at: null,
        })
        .execute();

      await trx
        .insertInto('company_memberships')
        .values({
          company_id: companyId,
          user_id: userId,
          role: 'admin',
        })
        .onConflict((oc) =>
          oc.columns(['company_id', 'user_id']).doUpdateSet({ role: 'admin' })
        )
        .execute();
    });

    return {
      id: companyId,
      name: args.input.name.trim(),
      status: 'active',
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
      action: 'company:edit',
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
        .selectFrom('company_memberships')
        .select('user_id')
        .where('company_id', '=', args.companyId)
        .execute();
      const memberIds = memberRows.map((r) => r.user_id);
      if (!memberIds.length) return;

      const superRows = await trx
        .selectFrom('users')
        .select('id')
        .where('is_global_superadmin', '=', true)
        .where('id', 'in', memberIds)
        .execute();
      const superIds = new Set(superRows.map((r) => r.id));
      const disableIds = memberIds.filter((id) => !superIds.has(id));
      if (!disableIds.length) return;

      await trx
        .updateTable('users')
        .set({ disabled: true })
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
        .selectFrom('company_memberships')
        .select('user_id')
        .where('company_id', '=', args.companyId)
        .execute();
      const memberIds = memberRows.map((r) => r.user_id);
      if (!memberIds.length) return;

      await trx
        .updateTable('users')
        .set({ disabled: false })
        .where('id', 'in', memberIds)
        .execute();
    });
  });
}

export async function deleteCompanyServer(args: {
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
    if (company.status !== 'deactivated') {
      throw new AppError(
        'VALIDATION_ERROR',
        'Company must be deactivated before deletion'
      );
    }

    await db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('companies')
        .where('id', '=', args.companyId)
        .execute();

      await trx
        .deleteFrom('users')
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
