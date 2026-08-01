import { sql } from 'kysely';

import { AppError } from '../../api/errors';
import type { ProfileUpdateInput } from '../../api/types';
import type {
  Company,
  CompanyId,
  CompanySummary,
  CompanyWorkQueue,
  ProjectId,
  User,
} from '../../types';
import { asCompanyId, asProjectId, asUserId } from '../../types';
import { buildCompanySummaryProjects } from '../../utils/companySummary';
import { MIN_RULE_SUGGESTION_SAMPLE_COUNT } from '../../utils/ruleSuggestions';
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
import {
  reversalReviewTxnSql,
  txnValidSubCategorySql,
} from './transactions/shared';

type CompanyReportingContext = {
  db: ReturnType<typeof getDb>;
  userId: string;
  isSuperadmin: boolean;
  company:
    | {
        id: string;
        status: 'active' | 'deactivated';
      }
    | undefined;
  companyRole: string | null;
};

function toIsoTimestamp(value: Date | string | null | undefined) {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : value;
}

async function requireCompanyReportingContext(
  context: ServerFnContextInput,
  companyId: CompanyId
): Promise<CompanyReportingContext> {
  const db = getDb();
  const userId = await requireServerUserId(context);
  const [isSuperadmin, company, membership] = await Promise.all([
    isGlobalSuperadminUser(userId, db),
    db
      .selectFrom('companies')
      .select(['id', 'status'])
      .where('id', '=', companyId)
      .executeTakeFirst(),
    db
      .selectFrom('company_memberships')
      .select('role')
      .where('company_id', '=', companyId)
      .where('user_id', '=', userId)
      .executeTakeFirst(),
  ]);
  const companyRole = membership?.role ?? null;

  if (!isSuperadmin && companyRole !== 'admin' && companyRole !== 'executive') {
    throw new AppError(
      'FORBIDDEN',
      'Company reporting access requires admin or executive role'
    );
  }

  return { db, userId, isSuperadmin, company, companyRole };
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
    const { db, userId, isSuperadmin, company, companyRole } =
      await requireCompanyReportingContext(args.context, args.companyId);

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
              and tr.status in (
                'pending_reversal',
                'auto_matched_pending_approval',
                'auto_matched_ambiguous_pending_approval',
                'reversal_exception'
              )
          )`.as('pending_reversal'),
          sql<boolean>`exists (
            select 1
            from txn_reversals tr
            where tr.project_id = txns.project_id
              and tr.source_txn_public_id = txns.public_id
              and tr.matched_reversal_txn_public_id is null
              and tr.status in ('pending_reversal', 'reversal_exception')
          )`.as('pending_reversal_expected'),
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
          pendingReversalExpected: row.pending_reversal_expected,
          subCategoryId: row.sub_category_id,
        })),
        validSubCategoryIdsByProject: validSubIdsByProject,
      }),
    };
  });
}

export async function getCompanyWorkQueueServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<CompanyWorkQueue> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, userId, isSuperadmin, company, companyRole } =
      await requireCompanyReportingContext(args.context, args.companyId);

    if (!company || company.status !== 'active') {
      return { projects: [], ruleSuggestionCount: 0 };
    }

    const visibleProjects = (
      await listVisibleProjectsForCompany({
        db,
        userId,
        companyId: args.companyId,
        companyStatus: company.status,
        isSuperadmin,
        companyRole,
      })
    ).filter(
      (project) =>
        project.projectType === 'project' && project.status === 'active'
    );
    const projectIds = visibleProjects.map((project) => project.id);

    const validSubCategory = txnValidSubCategorySql();
    const needsCoding = sql<boolean>`t.categorisable and (t.sub_category_id is null or not (${validSubCategory}))`;
    const codingApproval = sql<boolean>`t.categorisable and t.coding_pending_approval and t.sub_category_id is not null and ${validSubCategory}`;
    const reversalReview = reversalReviewTxnSql();

    const [transactionRows, unlockRows, ruleSuggestionRow] = await Promise.all([
      projectIds.length
        ? db
            .selectFrom('txns as t')
            .select([
              't.project_id',
              sql<number>`count(*) filter (where ${needsCoding})`.as(
                'needs_coding_count'
              ),
              sql<
                string | null
              >`min(case when ${needsCoding} then t.txn_date end)`.as(
                'oldest_needs_coding_date'
              ),
              sql<number>`count(*) filter (where ${codingApproval})`.as(
                'coding_approval_count'
              ),
              sql<
                string | null
              >`min(case when ${codingApproval} then t.txn_date end)`.as(
                'oldest_coding_approval_date'
              ),
              sql<number>`count(*) filter (where ${reversalReview})`.as(
                'reversal_review_count'
              ),
              sql<
                string | null
              >`min(case when ${reversalReview} then t.txn_date end)`.as(
                'oldest_reversal_review_date'
              ),
            ])
            .where('t.project_id', 'in', projectIds)
            .groupBy('t.project_id')
            .execute()
        : Promise.resolve([]),
      projectIds.length
        ? db
            .selectFrom('txn_unlock_requests')
            .select([
              'project_id',
              sql<number>`count(*)`.as('unlock_request_count'),
              sql<Date | string | null>`min(requested_at)`.as(
                'oldest_unlock_request_at'
              ),
            ])
            .where('project_id', 'in', projectIds)
            .where('status', '=', 'pending')
            .groupBy('project_id')
            .execute()
        : Promise.resolve([]),
      db
        .selectFrom('rule_suggestions')
        .select(sql<number>`count(*)`.as('rule_suggestion_count'))
        .where('company_id', '=', args.companyId)
        .where('status', '=', 'open')
        .where('sample_count', '>=', MIN_RULE_SUGGESTION_SAMPLE_COUNT)
        .executeTakeFirstOrThrow(),
    ]);

    const transactionByProject = new Map(
      transactionRows.map((row) => [row.project_id, row])
    );
    const unlockByProject = new Map(
      unlockRows.map((row) => [row.project_id, row])
    );
    const projects = visibleProjects.flatMap((project) => {
      const transactions = transactionByProject.get(project.id);
      const unlocks = unlockByProject.get(project.id);
      const needsCodingCount = Number(transactions?.needs_coding_count ?? 0);
      const codingApprovalCount = Number(
        transactions?.coding_approval_count ?? 0
      );
      const reversalReviewCount = Number(
        transactions?.reversal_review_count ?? 0
      );
      const unlockRequestCount = Number(unlocks?.unlock_request_count ?? 0);

      if (
        needsCodingCount === 0 &&
        codingApprovalCount === 0 &&
        reversalReviewCount === 0 &&
        unlockRequestCount === 0
      ) {
        return [];
      }

      return [
        {
          projectId: project.id,
          projectName: project.name,
          needsCodingCount,
          oldestNeedsCodingDate:
            transactions?.oldest_needs_coding_date ?? undefined,
          codingApprovalCount,
          oldestCodingApprovalDate:
            transactions?.oldest_coding_approval_date ?? undefined,
          reversalReviewCount,
          oldestReversalReviewDate:
            transactions?.oldest_reversal_review_date ?? undefined,
          unlockRequestCount,
          oldestUnlockRequestAt: toIsoTimestamp(
            unlocks?.oldest_unlock_request_at
          ),
        },
      ];
    });

    return {
      projects,
      ruleSuggestionCount: Number(ruleSuggestionRow.rule_suggestion_count),
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

    const primary = ranked[0];
    return primary ? asCompanyId(primary.company_id) : null;
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
