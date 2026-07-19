import { sql } from 'kysely';

import { AppError } from '../../api/errors';
import type { ProfileUpdateInput } from '../../api/types';
import type {
  Company,
  CompanyId,
  CompanySummary,
  ProjectId,
  User,
} from '../../types';
import { asCompanyId, asProjectId, asUserId } from '../../types';
import { buildCompanySummaryProjects } from '../../utils/companySummary';
import { userNameSchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { isGlobalSuperadminUser } from '../auth/globalSuperadmin';
import { getDb } from '../db/db';
import { listVisibleProjectsForCompany } from './projectReads';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
import { COMPANY_ROLE_RANK, toCompany } from './companyCore';

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
    const company = await db
      .selectFrom('companies')
      .select(['id', 'status'])
      .where('id', '=', args.companyId)
      .executeTakeFirst();
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

    if (!company) return { projects: [] };

    const projects = await listVisibleProjectsForCompany({
      db,
      userId,
      companyId: args.companyId,
      companyStatus: company.status,
      isSuperadmin,
      companyRole,
    });
    if (!projects.length) return { projects: [] };

    const projectIds = projects.map((project) => project.id);

    const [subCategoryRows, txnRows] = await Promise.all([
      db
        .selectFrom('sub_categories')
        .select(['project_id', 'id'])
        .where('project_id', 'in', projectIds)
        .execute(),
      db
        .selectFrom('txns')
        .select([
          'project_id',
          'txn_date',
          'amount_cents',
          'budget_impact',
          'sub_category_id',
          sql<boolean>`exists (
            select 1
            from txn_reversals tr
            where tr.project_id = txns.project_id
              and tr.source_txn_public_id = txns.public_id
              and tr.status in ('pending_reversal', 'reversal_exception')
          )`.as('pending_reversal'),
        ])
        .where('project_id', 'in', projectIds)
        .execute(),
    ]);

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
          pendingReversal: row.pending_reversal,
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
      return rows.map((row) => ({
        id: asUserId(row.id),
        email: row.email,
        name: row.name,
        disabled: row.disabled || undefined,
        isGlobalSuperadmin: row.is_global_superadmin || undefined,
      }));
    }

    const companyRows = await db
      .selectFrom('company_memberships')
      .innerJoin('companies', 'companies.id', 'company_memberships.company_id')
      .select('company_memberships.company_id')
      .where('user_id', '=', userId)
      .where('companies.status', '=', 'active')
      .execute();
    const companyIds = companyRows.map((row) => row.company_id);
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

    return rows.map((row) => ({
      id: asUserId(row.id),
      email: row.email,
      name: row.name,
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
        companies.find((company) => company.status === 'active') ??
        companies[0];
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

    const activePrimary = ranked.find(
      (membership) => membership.status === 'active'
    );
    if (activePrimary) return asCompanyId(activePrimary.company_id);

    return asCompanyId(ranked[0].company_id);
  });
}

export async function getPostLoginTargetServer(args: {
  context: ServerFnContextInput;
}): Promise<
  | { to: '/companies' }
  | { to: '/c/$companyId'; params: { companyId: CompanyId } }
> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    const isSuperadmin = await isGlobalSuperadminUser(userId, db);

    if (isSuperadmin) return { to: '/companies' };

    const memberships = await db
      .selectFrom('company_memberships as m')
      .innerJoin('companies as c', 'c.id', 'm.company_id')
      .select(['m.company_id', 'm.role', 'c.status'])
      .where('m.user_id', '=', userId)
      .execute();
    if (!memberships.length) return { to: '/companies' };

    const activeMemberships = memberships.filter(
      (membership) => membership.status === 'active'
    );
    if (activeMemberships.length > 1) return { to: '/companies' };

    const ranked = memberships
      .slice()
      .sort(
        (a, b) =>
          (COMPANY_ROLE_RANK[b.role] ?? 0) - (COMPANY_ROLE_RANK[a.role] ?? 0)
      );
    const preferred =
      ranked.find((membership) => membership.status === 'active') ?? ranked[0];

    if (!preferred) return { to: '/companies' };
    return {
      to: '/c/$companyId',
      params: { companyId: asCompanyId(preferred.company_id) },
    };
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
