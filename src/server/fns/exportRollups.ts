import type { CompanySummaryProject } from '../../types';

import type {
  ProjectExportRow,
  ProjectFinanceRollup,
  TaxonomyRollup,
  TransactionExportRow,
} from './exportWorkbookShared';
import { sumProjectMonths } from './exportWorkbookShared';

export function buildProjectFinanceById(
  flatSummaryProjects: CompanySummaryProject[]
): Map<string, ProjectFinanceRollup> {
  const projectFinanceById = new Map<string, ProjectFinanceRollup>();
  for (const project of flatSummaryProjects) {
    projectFinanceById.set(project.id, {
      budgetCents: project.budgetCents,
      actualCodedCents: sumProjectMonths(
        project,
        (month) => month.actualCodedCents
      ),
      pendingReversalCents: sumProjectMonths(
        project,
        (month) => month.pendingReversalCents
      ),
      adjustedActualCodedCents: sumProjectMonths(
        project,
        (month) => month.adjustedActualCodedCents
      ),
      uncodedAmountCents: sumProjectMonths(
        project,
        (month) => month.uncodedAmountCents
      ),
    });
  }
  return projectFinanceById;
}

export function buildTaxonomyRollups(args: {
  budgetLines: Array<{
    project_id: string;
    category_id: string | null;
    sub_category_id: string | null;
    allocated_cents: number | string | bigint;
  }>;
  transactionRows: TransactionExportRow[];
  projectById: Map<string, ProjectExportRow>;
  categoryById: Map<string, { name: string }>;
  subCategoryById: Map<string, { name: string }>;
}) {
  const taxonomyRollups = new Map<string, TaxonomyRollup>();

  const ensureTaxonomyRollup = (rollupArgs: {
    projectId: string;
    categoryId: string;
    categoryName: string;
    subCategoryId: string;
    subCategoryName: string;
  }) => {
    const key = [
      rollupArgs.projectId,
      rollupArgs.categoryId,
      rollupArgs.subCategoryId || 'none',
    ].join(':');
    const existing = taxonomyRollups.get(key);
    if (existing) return existing;
    const project = args.projectById.get(rollupArgs.projectId);
    const parentProgramme = project?.parent_project_id
      ? args.projectById.get(project.parent_project_id)
      : null;
    const created: TaxonomyRollup = {
      projectId: rollupArgs.projectId,
      projectName: project?.name ?? '',
      projectType: project?.project_type ?? 'project',
      programmeId: parentProgramme?.id ?? '',
      programmeName: parentProgramme?.name ?? '',
      currency: project?.currency ?? '',
      categoryId: rollupArgs.categoryId,
      categoryName: rollupArgs.categoryName,
      subCategoryId: rollupArgs.subCategoryId,
      subCategoryName: rollupArgs.subCategoryName,
      budgetCents: 0,
      actualCodedCents: 0,
      pendingReversalCents: 0,
      adjustedActualCodedCents: 0,
      uncodedAmountCents: 0,
      transactionCount: 0,
    };
    taxonomyRollups.set(key, created);
    return created;
  };

  for (const line of args.budgetLines) {
    const category = line.category_id
      ? args.categoryById.get(line.category_id)
      : null;
    const subCategory = line.sub_category_id
      ? args.subCategoryById.get(line.sub_category_id)
      : null;
    const rollup = ensureTaxonomyRollup({
      projectId: line.project_id,
      categoryId: line.category_id ?? '',
      categoryName: category?.name ?? 'Unassigned',
      subCategoryId: line.sub_category_id ?? '',
      subCategoryName: subCategory?.name ?? '',
    });
    rollup.budgetCents += Number(line.allocated_cents);
  }

  for (const row of args.transactionRows) {
    if (!row.budgetImpact) continue;
    const rollup = ensureTaxonomyRollup({
      projectId: row.projectId,
      categoryId: row.categoryId,
      categoryName: row.categoryName || 'Unassigned',
      subCategoryId: row.subCategoryId,
      subCategoryName: row.subCategoryName,
    });
    if (row.subCategoryId) {
      rollup.actualCodedCents += row.amountCents;
      if (row.pendingReversalOpen) {
        rollup.pendingReversalCents += row.amountCents;
      }
      rollup.adjustedActualCodedCents =
        rollup.actualCodedCents - rollup.pendingReversalCents;
    } else {
      rollup.uncodedAmountCents += row.amountCents;
    }
    rollup.transactionCount += 1;
  }

  const taxonomyRollupRows = [...taxonomyRollups.values()].sort((a, b) => {
    const projectCompare = a.projectName.localeCompare(b.projectName);
    if (projectCompare !== 0) return projectCompare;
    const categoryCompare = a.categoryName.localeCompare(b.categoryName);
    if (categoryCompare !== 0) return categoryCompare;
    return a.subCategoryName.localeCompare(b.subCategoryName);
  });

  const categoryRollupMap = new Map<string, TaxonomyRollup>();
  for (const row of taxonomyRollupRows) {
    const key = [row.projectId, row.categoryId || 'none'].join(':');
    const existing = categoryRollupMap.get(key);
    if (existing) {
      existing.budgetCents += row.budgetCents;
      existing.actualCodedCents += row.actualCodedCents;
      existing.pendingReversalCents += row.pendingReversalCents;
      existing.adjustedActualCodedCents += row.adjustedActualCodedCents;
      existing.uncodedAmountCents += row.uncodedAmountCents;
      existing.transactionCount += row.transactionCount;
      continue;
    }
    categoryRollupMap.set(key, {
      ...row,
      subCategoryId: '',
      subCategoryName: '',
    });
  }

  return {
    taxonomyRollupRows,
    categoryRollupRows: [...categoryRollupMap.values()],
  };
}
