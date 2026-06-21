import { AppError } from '../../../api/errors';
import type { CompanyId, ImportRule, ProjectId } from '../../../types';
import { getDb } from '../../db/db';
import { requireAuthorized } from '../../auth/authorize';
import { requireOperationalProjectForAction } from '../resourceGuards';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import { importRuleSelectColumns, toImportRule } from './shared';
import { compareProjectStandards } from '../../sync/projectStandards';

export async function requireCompanyContext(
  context: ServerFnContextInput,
  companyId: CompanyId
) {
  const db = getDb();
  const userId = await requireServerUserId(context);
  const company = await db
    .selectFrom('companies')
    .select('id')
    .where('id', '=', companyId)
    .executeTakeFirst();
  if (!company) throw new AppError('NOT_FOUND', 'Unknown company');
  return { db, userId };
}

export async function listImportRulesServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<ImportRule[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, userId } = await requireCompanyContext(
      args.context,
      args.companyId
    );
    await requireAuthorized({
      db,
      userId,
      action: 'company:view',
      companyId: args.companyId,
    });
    const rows = await db
      .selectFrom('import_rules')
      .select(importRuleSelectColumns())
      .where('company_id', '=', args.companyId)
      .where('project_id', 'is', null)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map(toImportRule);
  });
}

export async function listProjectImportRulesServer(args: {
  context: ServerFnContextInput;
  projectId: ProjectId;
}): Promise<ImportRule[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireOperationalProjectForAction(
      args.context,
      args.projectId,
      'project:import'
    );

    const rows = await db
      .selectFrom('import_rules')
      .select(importRuleSelectColumns())
      .where('project_id', '=', args.projectId)
      .execute();
    return rows.sort(compareProjectStandards).map(toImportRule);
  });
}
