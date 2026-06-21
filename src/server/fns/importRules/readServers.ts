import type { CompanyId, ImportRule, ProjectId } from '../../../types';
import { requireAuthorized } from '../../auth/authorize';
import { requireOperationalProjectForAction } from '../resourceGuards';
import {
  assertContextProvided,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';
import {
  importRuleSelectColumns,
  requireCompanyRuleContext,
  toImportRule,
} from './shared';
import { compareProjectStandards } from '../../sync/projectStandards';

export async function listImportRulesServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<ImportRule[]> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db, userId } = await requireCompanyRuleContext(
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
