import type { CompanyExportOptions, CompanyId, UserId } from '../../types';
import { getDb } from '../db/db';
import {
  assembleCompanyWorkbook,
  type CompanyExportResult,
} from './exportWorkbookAssembler';
import { loadCompanyExportData } from './exportWorkbookData';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';

export async function exportCompanyWorkbookForUser(args: {
  db: ReturnType<typeof getDb>;
  userId: UserId;
  companyId: CompanyId;
  options: CompanyExportOptions;
}): Promise<CompanyExportResult> {
  const exportData = await loadCompanyExportData(args);
  return assembleCompanyWorkbook(exportData);
}

export async function exportCompanyWorkbookServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
  options: CompanyExportOptions;
}): Promise<CompanyExportResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const db = getDb();
    const userId = await requireServerUserId(args.context);

    return exportCompanyWorkbookForUser({
      db,
      userId,
      companyId: args.companyId,
      options: args.options,
    });
  });
}
