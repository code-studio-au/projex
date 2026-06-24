import ExcelJS from 'exceljs';

import type { ProjectId } from '../../types';
import { asCompanyId, asProjectId } from '../../types';
import { buildCompanySummaryProjects } from '../../utils/companySummary';
import type { LoadedCompanyExportData } from './exportWorkbookData';
import {
  addAnalysisWorksheets,
  addExecutiveSummaryWorksheet,
  addExportMetadataWorksheet,
  addFullDetailWorksheets,
  addOverviewWorksheet,
  addReadmeWorksheet,
  buildExportFileName,
  buildTransactionColumns,
  centsToMajorUnits,
  flattenSummaryProjects,
  sumProjectMonths,
  toProject,
  type TransactionExportRow,
} from './exportWorkbook';
import {
  buildBudgetRows,
  buildCategoryRows,
  buildCompanyMemberRows,
  buildDefaultMappingRuleRows,
  buildImportRuleRows,
  buildProjectMembershipRows,
  buildSubCategoryRows,
} from './exportDetailRows';
import { buildProjectFinanceById, buildTaxonomyRollups } from './exportRollups';
import { addStructureWorksheets } from './exportStructureWorkbook';

export type CompanyExportResult = {
  bytes: Uint8Array;
  fileName: string;
};

export async function assembleCompanyWorkbook(
  args: LoadedCompanyExportData
): Promise<CompanyExportResult> {
  const projectById = new Map(args.projectRows.map((row) => [row.id, row]));
  const categoryById = new Map(args.categories.map((row) => [row.id, row]));
  const subCategoryById = new Map(
    args.subCategories.map((row) => [row.id, row])
  );
  const defaultCategoryById = new Map(
    args.companyDefaultCategories.map((row) => [row.id, row])
  );
  const defaultSubCategoryById = new Map(
    args.companyDefaultSubCategories.map((row) => [row.id, row])
  );
  const userById = new Map(
    args.companyMembers.map((row) => [
      row.user_id,
      {
        name: row.user_name,
        email: row.user_email,
      },
    ])
  );
  for (const membership of args.projectMemberships) {
    if (!userById.has(membership.user_id)) {
      userById.set(membership.user_id, {
        name: membership.user_name,
        email: membership.user_email,
      });
    }
  }

  const validSubIdsByProject = new Map<ProjectId, Set<string>>();
  for (const row of args.subCategories) {
    const projectId = asProjectId(row.project_id);
    const current = validSubIdsByProject.get(projectId) ?? new Set<string>();
    current.add(row.id);
    validSubIdsByProject.set(projectId, current);
  }

  const summaryProjects = buildCompanySummaryProjects({
    projects: args.projectRows.map(toProject),
    transactions: args.txns.map((row) => ({
      projectId: asProjectId(row.project_id),
      date: row.txn_date,
      amountCents: Number(row.amount_cents),
      budgetImpact: row.budget_impact,
      subCategoryId: row.sub_category_id,
    })),
    validSubCategoryIdsByProject: validSubIdsByProject,
  });
  const flatSummaryProjects = flattenSummaryProjects(summaryProjects);
  const childCountByProgrammeId = new Map<string, number>();
  for (const row of args.projectRows.filter(
    (projectRow) => projectRow.project_type === 'project'
  )) {
    if (!row.parent_project_id) continue;
    childCountByProgrammeId.set(
      row.parent_project_id,
      (childCountByProgrammeId.get(row.parent_project_id) ?? 0) + 1
    );
  }

  const transactionsByProjectId = new Map<string, typeof args.txns>();
  for (const txn of args.txns) {
    const projectTxns = transactionsByProjectId.get(txn.project_id) ?? [];
    projectTxns.push(txn);
    transactionsByProjectId.set(txn.project_id, projectTxns);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Codex';
  workbook.company = 'Projex';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;

  const generatedAt = new Date().toISOString();
  const projectIdSet = new Set(args.projectRows.map((row) => row.id));
  const projectNameById = new Map(args.projectRows.map((row) => [row.id, row.name]));
  const programmes = args.projectRows.filter(
    (row) => row.project_type === 'programme'
  );
  const operationalProjects = args.projectRows.filter(
    (row) => row.project_type === 'project'
  );
  const totalBudgetCents = args.projectRows.reduce(
    (sum, row) => sum + Number(row.budget_total_cents),
    0
  );
  const totalTxnCents = args.txns.reduce(
    (sum, row) => sum + Number(row.amount_cents),
    0
  );
  const totalActualCodedCents = flatSummaryProjects.reduce(
    (sum, project) =>
      sum + sumProjectMonths(project, (month) => month.actualCodedCents),
    0
  );
  const totalUncodedCents = flatSummaryProjects.reduce(
    (sum, project) =>
      sum + sumProjectMonths(project, (month) => month.uncodedAmountCents),
    0
  );
  const exportFileName = buildExportFileName({
    companyName: args.company.name,
    options: args.options,
  });

  addOverviewWorksheet({
    workbook,
    companyName: args.company.name,
    generatedAt,
    options: args.options,
    isScopedForSuperadmin: args.isSuperadmin,
    projectRows: args.projectRows,
    programmeCount: programmes.length,
    operationalProjectCount: operationalProjects.length,
    budgetCount: args.budgetLines.length,
    transactionCount: args.txns.length,
    totalBudgetCents,
    totalActualCodedCents,
    totalUncodedCents,
  });

  addReadmeWorksheet({
    workbook,
    companyName: args.company.name,
    generatedAt,
    projectCount: operationalProjects.length,
    programmeCount: programmes.length,
    transactionCount: args.txns.length,
    budgetCount: args.budgetLines.length,
    isScopedForSuperadmin: args.isSuperadmin,
    options: args.options,
  });
  addExportMetadataWorksheet({
    workbook,
    companyId: asCompanyId(args.company.id),
    companyName: args.company.name,
    generatedAt,
    options: args.options,
    fileName: exportFileName,
    isScopedForSuperadmin: args.isSuperadmin,
    projectCount: operationalProjects.length,
    programmeCount: programmes.length,
    transactionCount: args.txns.length,
    budgetCount: args.budgetLines.length,
  });

  const uncodedTxnCount = args.txns.filter((row) => !row.sub_category_id).length;
  const lockedTxnCount = args.txns.filter((row) => !!row.locked_at).length;
  const reviewedTxnCount = args.txns.filter((row) => !!row.reviewed_at).length;
  const autoMappedPendingTxnCount = args.txns.filter(
    (row) => row.coding_pending_approval
  ).length;
  addExecutiveSummaryWorksheet({
    workbook,
    companyName: args.company.name,
    companyStatus: args.company.status,
    generatedAt,
    options: args.options,
    projectCount: args.projectRows.length,
    programmeCount: programmes.length,
    operationalProjectCount: operationalProjects.length,
    budgetCount: args.budgetLines.length,
    transactionCount: args.txns.length,
    totalBudgetCents,
    totalTxnCents,
    uncodedTxnCount,
    reviewedTxnCount,
    lockedTxnCount,
    autoMappedPendingTxnCount,
    flatSummaryProjects,
    projectNameById,
  });

  addStructureWorksheets({
    workbook,
    programmes,
    operationalProjects,
    projectRows: args.projectRows,
    projectById,
    projectIdSet,
    childCountByProgrammeId,
    flatSummaryProjects,
    transactionsByProjectId,
  });

  const transactionExportRows: TransactionExportRow[] = args.txns.map((row) => {
    const project = projectById.get(row.project_id);
    const parentProgramme = project?.parent_project_id
      ? projectById.get(project.parent_project_id)
      : null;
    const category = row.category_id ? categoryById.get(row.category_id) : null;
    const subCategory = row.sub_category_id
      ? subCategoryById.get(row.sub_category_id)
      : null;
    const transferProject = row.transfer_project_id
      ? projectById.get(row.transfer_project_id)
      : null;
    const reviewedBy = row.reviewed_by_user_id
      ? userById.get(row.reviewed_by_user_id)
      : null;
    const lockedBy = row.locked_by_user_id
      ? userById.get(row.locked_by_user_id)
      : null;
    return {
      transactionId: row.public_id,
      internalId: row.id,
      projectId: row.project_id,
      projectName: project?.name ?? '',
      programmeId: parentProgramme?.id ?? '',
      programmeName: parentProgramme?.name ?? '',
      currency: project?.currency ?? '',
      date: row.txn_date,
      item: row.item,
      description: row.description,
      externalId: row.external_id ?? '',
      amountCents: Number(row.amount_cents),
      amount: centsToMajorUnits(Number(row.amount_cents)),
      txnType: row.txn_type,
      budgetImpact: row.budget_impact,
      categorisable: row.categorisable,
      categoryId: row.category_id ?? '',
      categoryName: category?.name ?? '',
      subCategoryId: row.sub_category_id ?? '',
      subCategoryName: subCategory?.name ?? '',
      defaultMappingRuleId: row.company_default_mapping_rule_id ?? '',
      codingSource: row.coding_source ?? '',
      codingPendingApproval: row.coding_pending_approval,
      transferProjectId:
        row.transfer_project_id && projectIdSet.has(row.transfer_project_id)
          ? row.transfer_project_id
          : '',
      transferProjectName:
        row.transfer_project_id && projectIdSet.has(row.transfer_project_id)
          ? (transferProject?.name ?? '')
          : '',
      parentTxnId: row.parent_public_id ?? '',
      sourceTxnId: row.source_public_id ?? '',
      importBatchId: row.import_batch_id ?? '',
      importSourceType: row.import_source_type ?? '',
      reviewedAt: row.reviewed_at ?? '',
      reviewedByUserId: row.reviewed_by_user_id ?? '',
      reviewedByUserName: reviewedBy?.name ?? '',
      lockedAt: row.locked_at ?? '',
      lockedByUserId: row.locked_by_user_id ?? '',
      lockedByUserName: lockedBy?.name ?? '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  const transactionColumns = buildTransactionColumns();
  const uncodedTransactionRows = transactionExportRows.filter(
    (row) => row.budgetImpact && !row.subCategoryId
  );
  const autoMappedPendingRows = transactionExportRows.filter(
    (row) => row.codingPendingApproval
  );
  const projectFinanceById = buildProjectFinanceById(flatSummaryProjects);
  const { taxonomyRollupRows, categoryRollupRows } = buildTaxonomyRollups({
    budgetLines: args.budgetLines,
    transactionRows: transactionExportRows,
    projectById,
    categoryById,
    subCategoryById,
  });

  addAnalysisWorksheets({
    workbook,
    flatSummaryProjects,
    projectNameById,
    projectFinanceById,
    categoryRollupRows,
    taxonomyRollupRows,
    transactionColumns,
    uncodedTransactionRows,
    autoMappedPendingRows,
  });

  if (args.options.detail === 'full') {
    addFullDetailWorksheets({
      workbook,
      transactionColumns,
      budgetRows: buildBudgetRows({
        budgetLines: args.budgetLines,
        projectById,
        categoryById,
        subCategoryById,
      }),
      transactionRows: transactionExportRows,
      categoryRows: buildCategoryRows({
        categories: args.categories,
        projectById,
      }),
      subCategoryRows: buildSubCategoryRows({
        subCategories: args.subCategories,
        projectById,
        categoryById,
      }),
      companyDefaultCategoryRows: args.companyDefaultCategories.map((row) => ({
        categoryId: row.id,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      companyDefaultSubCategoryRows: args.companyDefaultSubCategories.map(
        (row) => ({
          subCategoryId: row.id,
          categoryId: row.company_default_category_id,
          categoryName:
            defaultCategoryById.get(row.company_default_category_id)?.name ?? '',
          name: row.name,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        })
      ),
      defaultMappingRuleRows: buildDefaultMappingRuleRows({
        companyDefaultMappingRules: args.companyDefaultMappingRules,
        defaultCategoryById,
        defaultSubCategoryById,
      }),
      importRuleRows: buildImportRuleRows({ importRules: args.importRules }),
      companyMemberRows: buildCompanyMemberRows({
        companyMembers: args.companyMembers,
      }),
      projectMembershipRows: buildProjectMembershipRows({
        projectMemberships: args.projectMemberships,
        projectById,
      }),
    });
  }

  const writeBufferResult = await workbook.xlsx.writeBuffer();
  const bytes =
    writeBufferResult instanceof Uint8Array
      ? writeBufferResult
      : new Uint8Array(writeBufferResult);

  return {
    bytes,
    fileName: exportFileName,
  };
}
