import { sql } from 'kysely';

import { AppError } from '../../api/errors';
import type { CompanyUpdateInput } from '../../api/types';
import type { Company, CompanyId, CompanyRole, User, UserId } from '../../types';
import { asCompanyId, asUserId } from '../../types';
import { uid } from '../../utils/id';
import { companyNameSchema, emailSchema, userNameSchema } from '../../validation/schemas';
import { validateOrThrow } from '../../validation/validate';
import { requireAuthorized } from '../auth/authorize';
import { getDb } from '../db/db';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';

const COMPANY_ROLE_RANK: Record<CompanyRole, number> = {
  superadmin: 5,
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

async function isSuperadminUser(userId: UserId): Promise<boolean> {
  const db = getDb();
  const row = await db
    .selectFrom('company_memberships')
    .select('user_id')
    .where('user_id', '=', userId)
    .where('role', '=', 'superadmin')
    .executeTakeFirst();
  return !!row;
}

export async function listCompaniesServer(args: {
  context: ServerFnContextInput;
}): Promise<Company[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    const isSuperadmin = await isSuperadminUser(userId);

    if (isSuperadmin) {
      const rows = await db
        .selectFrom('companies')
        .select(['id', 'name', 'status', 'deactivated_at'])
        .where('id', '!=', 'co_projex')
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
    const isSuperadmin = await isSuperadminUser(userId);

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

export async function listUsersServer(args: {
  context: ServerFnContextInput;
}): Promise<User[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);
    const isSuperadmin = await isSuperadminUser(userId);

    if (isSuperadmin) {
      const rows = await db
        .selectFrom('users')
        .select(['id', 'email', 'name', 'disabled'])
        .orderBy('name', 'asc')
        .execute();
      return rows.map((r) => ({
        id: r.id as UserId,
        email: r.email,
        name: r.name,
        disabled: r.disabled || undefined,
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
      .select(['u.id', 'u.email', 'u.name', 'u.disabled'])
      .where('m.company_id', 'in', companyIds)
      .groupBy(['u.id', 'u.email', 'u.name', 'u.disabled'])
      .orderBy('u.name', 'asc')
      .execute();

    return rows.map((r) => ({
      id: r.id as UserId,
      email: r.email,
      name: r.name,
      disabled: r.disabled || undefined,
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
    const isSuperadmin = await isSuperadminUser(userId);

    if (isSuperadmin) {
      const companies = await db
        .selectFrom('companies')
        .select(['id', 'status'])
        .orderBy('id', 'asc')
        .execute();
      const preferred =
        companies.find((c) => c.status === 'active' && c.id !== 'co_projex') ??
        companies.find((c) => c.status === 'active') ??
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
      .sort((a, b) => (COMPANY_ROLE_RANK[b.role] ?? 0) - (COMPANY_ROLE_RANK[a.role] ?? 0));

    const activePrimary = ranked.find((m) => m.status === 'active');
    if (activePrimary) return asCompanyId(activePrimary.company_id);

    return asCompanyId(ranked[0].company_id);
  });
}

export async function createUserInCompanyServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  name: string;
  email: string;
  role: CompanyRole;
}): Promise<User> {
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
    const dup = await db
      .selectFrom('users')
      .select('id')
      .where(sql<boolean>`lower(email) = ${emailNorm}`)
      .executeTakeFirst();
    if (dup) {
      throw new AppError('CONFLICT', 'A user with this email already exists');
    }

    const userId = asUserId(uid('usr'));
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto('users')
        .values({
          id: userId,
          name: args.name.trim(),
          email: args.email.trim(),
          disabled: false,
        })
        .execute();

      await trx
        .insertInto('company_memberships')
        .values({
          company_id: args.companyId,
          user_id: userId,
          role: args.role,
        })
        .execute();
    });

    return {
      id: userId,
      name: args.name.trim(),
      email: args.email.trim(),
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
    const isSuperadmin = await isSuperadminUser(userId);
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
          role: 'superadmin',
        })
        .onConflict((oc) =>
          oc.columns(['company_id', 'user_id']).doUpdateSet({ role: 'superadmin' })
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
    if (typeof args.input.name === 'string') patch.name = args.input.name.trim();
    if (typeof args.input.status !== 'undefined') patch.status = args.input.status;
    if ('deactivatedAt' in args.input) patch.deactivated_at = args.input.deactivatedAt ?? null;
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
    const isSuperadmin = await isSuperadminUser(sessionUserId);
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
        .selectFrom('company_memberships')
        .select('user_id')
        .where('role', '=', 'superadmin')
        .where('user_id', 'in', memberIds)
        .execute();
      const superIds = new Set(superRows.map((r) => r.user_id));
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
    const isSuperadmin = await isSuperadminUser(sessionUserId);
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
    const isSuperadmin = await isSuperadminUser(sessionUserId);
    if (!isSuperadmin) throw new AppError('FORBIDDEN', 'Forbidden');

    const company = await db
      .selectFrom('companies')
      .select(['id', 'status'])
      .where('id', '=', args.companyId)
      .executeTakeFirst();
    if (!company) throw new AppError('NOT_FOUND', 'Company not found');
    if (company.status !== 'deactivated') {
      throw new AppError('VALIDATION_ERROR', 'Company must be deactivated before deletion');
    }

    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom('companies').where('id', '=', args.companyId).execute();

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
