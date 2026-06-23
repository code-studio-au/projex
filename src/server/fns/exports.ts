import ExcelJS from 'exceljs';
import type { Kysely } from 'kysely';

import { AppError } from '../../api/errors';
import type {
  CompanyExportOptions,
  CompanyId,
  ProjectId,
  UserId,
} from '../../types';
import { asProjectId } from '../../types';
import { buildCompanySummaryProjects } from '../../utils/companySummary';
import { requireAuthorized } from '../auth/authorize';
import { isGlobalSuperadminUser } from '../auth/globalSuperadmin';
import { getDb } from '../db/db';
import type { DB } from '../db/schema';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from './runtime';
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
  type ProjectFinanceRollup,
  sumProjectMonths,
  type TaxonomyRollup,
  type TransactionExportRow,
  toProject,
} from './exportWorkbook';
import { addStructureWorksheets } from './exportStructureWorkbook';

type CompanyExportResult = {
  bytes: Uint8Array;
  fileName: string;
};

export async function exportCompanyWorkbookForUser(args: {
  db: Kysely<DB>;
  userId: UserId;
  companyId: CompanyId;
  options: CompanyExportOptions;
}): Promise<CompanyExportResult> {
  const db = args.db;
  const userId = args.userId;

  const company = await db
    .selectFrom('companies')
    .select(['id', 'name', 'status', 'deactivated_at'])
    .where('id', '=', args.companyId)
    .executeTakeFirst();
  if (!company) throw new AppError('NOT_FOUND', 'Unknown company');

  await requireAuthorized({
    db,
    userId,
    action: 'company:export',
    companyId: args.companyId,
  });

  const isSuperadmin = await isGlobalSuperadminUser(userId, db);

  const allProjectRows = await db
    .selectFrom('projects')
    .select([
      'id',
      'company_id',
      'name',
      'project_type',
      'parent_project_id',
      'budget_total_cents',
      'currency',
      'status',
      'deactivated_at',
      'visibility',
      'allow_superadmin_access',
      'sync_company_defaults',
      'allow_txn_transfers',
    ])
    .where('company_id', '=', args.companyId)
    .orderBy('project_type', 'asc')
    .orderBy('name', 'asc')
    .execute();

  const visibleProjectRows = isSuperadmin
    ? allProjectRows.filter((row) => row.allow_superadmin_access)
    : allProjectRows;
  const projectRows =
    args.options.scope === 'active'
      ? visibleProjectRows.filter((row) => row.status === 'active')
      : visibleProjectRows;
  const projectIds = projectRows.map((row) => row.id);
  const projectIdSet = new Set(projectIds);

  const [
    companyMembers,
    projectMemberships,
    categories,
    subCategories,
    budgetLines,
    txns,
    companyDefaultCategories,
    companyDefaultSubCategories,
    companyDefaultMappingRules,
    importRules,
  ] = await Promise.all([
    db
      .selectFrom('company_memberships as cm')
      .innerJoin('users as u', 'u.id', 'cm.user_id')
      .select([
        'cm.company_id as company_id',
        'cm.user_id as user_id',
        'cm.role as role',
        'u.name as user_name',
        'u.email as user_email',
        'u.disabled as user_disabled',
        'u.is_global_superadmin as is_global_superadmin',
      ])
      .where('cm.company_id', '=', args.companyId)
      .orderBy('u.name', 'asc')
      .execute(),
    projectIds.length
      ? db
          .selectFrom('project_memberships as pm')
          .innerJoin('users as u', 'u.id', 'pm.user_id')
          .select([
            'pm.project_id as project_id',
            'pm.user_id as user_id',
            'pm.role as role',
            'u.name as user_name',
            'u.email as user_email',
          ])
          .where('pm.project_id', 'in', projectIds)
          .orderBy('pm.project_id', 'asc')
          .orderBy('u.name', 'asc')
          .execute()
      : Promise.resolve([]),
    projectIds.length
      ? db
          .selectFrom('categories')
          .select([
            'id',
            'company_id',
            'project_id',
            'name',
            'created_at',
            'updated_at',
          ])
          .where('project_id', 'in', projectIds)
          .orderBy('project_id', 'asc')
          .orderBy('name', 'asc')
          .execute()
      : Promise.resolve([]),
    projectIds.length
      ? db
          .selectFrom('sub_categories')
          .select([
            'id',
            'company_id',
            'project_id',
            'category_id',
            'name',
            'created_at',
            'updated_at',
          ])
          .where('project_id', 'in', projectIds)
          .orderBy('project_id', 'asc')
          .orderBy('name', 'asc')
          .execute()
      : Promise.resolve([]),
    projectIds.length
      ? db
          .selectFrom('budget_lines')
          .select([
            'id',
            'company_id',
            'project_id',
            'category_id',
            'sub_category_id',
            'allocated_cents',
            'created_at',
            'updated_at',
          ])
          .where('project_id', 'in', projectIds)
          .orderBy('project_id', 'asc')
          .orderBy('created_at', 'asc')
          .execute()
      : Promise.resolve([]),
    projectIds.length
      ? (async () => {
          let query = db
            .selectFrom('txns')
            .select([
              'id',
              'public_id',
              'external_id',
              'company_id',
              'project_id',
              'txn_date',
              'item',
              'description',
              'amount_cents',
              'txn_type',
              'parent_public_id',
              'source_public_id',
              'transfer_project_id',
              'budget_impact',
              'categorisable',
              'import_batch_id',
              'import_source_type',
              'import_source_meta',
              'category_id',
              'sub_category_id',
              'company_default_mapping_rule_id',
              'coding_source',
              'coding_pending_approval',
              'reviewed_at',
              'reviewed_by_user_id',
              'locked_at',
              'locked_by_user_id',
              'created_at',
              'updated_at',
            ])
            .where('project_id', 'in', projectIds);
          if (args.options.fromDate) {
            query = query.where('txn_date', '>=', args.options.fromDate);
          }
          if (args.options.toDate) {
            query = query.where('txn_date', '<=', args.options.toDate);
          }
          return query
            .orderBy('project_id', 'asc')
            .orderBy('txn_date', 'asc')
            .orderBy('id', 'asc')
            .execute();
        })()
      : Promise.resolve([]),
    db
      .selectFrom('company_default_categories')
      .select(['id', 'company_id', 'name', 'created_at', 'updated_at'])
      .where('company_id', '=', args.companyId)
      .orderBy('name', 'asc')
      .execute(),
    db
      .selectFrom('company_default_sub_categories')
      .select([
        'id',
        'company_id',
        'company_default_category_id',
        'name',
        'created_at',
        'updated_at',
      ])
      .where('company_id', '=', args.companyId)
      .orderBy('name', 'asc')
      .execute(),
    db
      .selectFrom('company_default_mapping_rules')
      .select([
        'id',
        'company_id',
        'match_text',
        'company_default_category_id',
        'company_default_sub_category_id',
        'sort_order',
        'created_at',
        'updated_at',
      ])
      .where('company_id', '=', args.companyId)
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute(),
    db
      .selectFrom('import_rules')
      .select([
        'id',
        'company_id',
        'project_id',
        'name',
        'action',
        'field',
        'operator',
        'value',
        'sort_order',
        'enabled',
        'created_at',
        'updated_at',
      ])
      .where('company_id', '=', args.companyId)
      .orderBy('project_id', 'asc')
      .orderBy('sort_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute(),
  ]);

  const projectById = new Map(projectRows.map((row) => [row.id, row]));
  const categoryById = new Map(categories.map((row) => [row.id, row]));
  const subCategoryById = new Map(subCategories.map((row) => [row.id, row]));
  const defaultCategoryById = new Map(
    companyDefaultCategories.map((row) => [row.id, row])
  );
  const defaultSubCategoryById = new Map(
    companyDefaultSubCategories.map((row) => [row.id, row])
  );
  const userById = new Map(
    companyMembers.map((row) => [
      row.user_id,
      {
        name: row.user_name,
        email: row.user_email,
      },
    ])
  );
  for (const membership of projectMemberships) {
    if (!userById.has(membership.user_id)) {
      userById.set(membership.user_id, {
        name: membership.user_name,
        email: membership.user_email,
      });
    }
  }

  const validSubIdsByProject = new Map<ProjectId, Set<string>>();
  for (const row of subCategories) {
    const projectId = asProjectId(row.project_id);
    const current = validSubIdsByProject.get(projectId) ?? new Set<string>();
    current.add(row.id);
    validSubIdsByProject.set(projectId, current);
  }

  const summaryProjects = buildCompanySummaryProjects({
    projects: projectRows.map(toProject),
    transactions: txns.map((row) => ({
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
  for (const row of projectRows.filter(
    (projectRow) => projectRow.project_type === 'project'
  )) {
    if (!row.parent_project_id) continue;
    childCountByProgrammeId.set(
      row.parent_project_id,
      (childCountByProgrammeId.get(row.parent_project_id) ?? 0) + 1
    );
  }

  const transactionsByProjectId = new Map<string, typeof txns>();
  for (const txn of txns) {
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
  const programmes = projectRows.filter(
    (row) => row.project_type === 'programme'
  );
  const operationalProjects = projectRows.filter(
    (row) => row.project_type === 'project'
  );
  const totalBudgetCents = projectRows.reduce(
    (sum, row) => sum + Number(row.budget_total_cents),
    0
  );
  const totalTxnCents = txns.reduce(
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
    companyName: company.name,
    options: args.options,
  });

  addOverviewWorksheet({
    workbook,
    companyName: company.name,
    generatedAt,
    options: args.options,
    isScopedForSuperadmin: isSuperadmin,
    projectRows,
    programmeCount: programmes.length,
    operationalProjectCount: operationalProjects.length,
    budgetCount: budgetLines.length,
    transactionCount: txns.length,
    totalBudgetCents,
    totalActualCodedCents,
    totalUncodedCents,
  });

  addReadmeWorksheet({
    workbook,
    companyName: company.name,
    generatedAt,
    projectCount: operationalProjects.length,
    programmeCount: programmes.length,
    transactionCount: txns.length,
    budgetCount: budgetLines.length,
    isScopedForSuperadmin: isSuperadmin,
    options: args.options,
  });
  addExportMetadataWorksheet({
    workbook,
    companyId: args.companyId,
    companyName: company.name,
    generatedAt,
    options: args.options,
    fileName: exportFileName,
    isScopedForSuperadmin: isSuperadmin,
    projectCount: operationalProjects.length,
    programmeCount: programmes.length,
    transactionCount: txns.length,
    budgetCount: budgetLines.length,
  });

  const uncodedTxnCount = txns.filter((row) => !row.sub_category_id).length;
  const lockedTxnCount = txns.filter((row) => !!row.locked_at).length;
  const reviewedTxnCount = txns.filter((row) => !!row.reviewed_at).length;
  const autoMappedPendingTxnCount = txns.filter(
    (row) => row.coding_pending_approval
  ).length;
  addExecutiveSummaryWorksheet({
    workbook,
    companyName: company.name,
    companyStatus: company.status,
    generatedAt,
    options: args.options,
    projectCount: projectRows.length,
    programmeCount: programmes.length,
    operationalProjectCount: operationalProjects.length,
    budgetCount: budgetLines.length,
    transactionCount: txns.length,
    totalBudgetCents,
    totalTxnCents,
    uncodedTxnCount,
    reviewedTxnCount,
    lockedTxnCount,
    autoMappedPendingTxnCount,
    flatSummaryProjects,
    projectNameById: new Map(projectRows.map((row) => [row.id, row.name])),
  });

  addStructureWorksheets({
    workbook,
    programmes,
    operationalProjects,
    projectRows,
    projectById,
    projectIdSet,
    childCountByProgrammeId,
    flatSummaryProjects,
    transactionsByProjectId,
  });

  const transactionExportRows: TransactionExportRow[] = txns.map((row) => {
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

  const projectFinanceById = new Map<string, ProjectFinanceRollup>();
  for (const project of flatSummaryProjects) {
    projectFinanceById.set(project.id, {
      budgetCents: project.budgetCents,
      actualCodedCents: sumProjectMonths(
        project,
        (month) => month.actualCodedCents
      ),
      uncodedAmountCents: sumProjectMonths(
        project,
        (month) => month.uncodedAmountCents
      ),
    });
  }

  const taxonomyRollups = new Map<string, TaxonomyRollup>();
  const ensureTaxonomyRollup = (args: {
    projectId: string;
    categoryId: string;
    categoryName: string;
    subCategoryId: string;
    subCategoryName: string;
  }) => {
    const key = [
      args.projectId,
      args.categoryId,
      args.subCategoryId || 'none',
    ].join(':');
    const existing = taxonomyRollups.get(key);
    if (existing) return existing;
    const project = projectById.get(args.projectId);
    const parentProgramme = project?.parent_project_id
      ? projectById.get(project.parent_project_id)
      : null;
    const created: TaxonomyRollup = {
      projectId: args.projectId,
      projectName: project?.name ?? '',
      projectType: project?.project_type ?? 'project',
      programmeId: parentProgramme?.id ?? '',
      programmeName: parentProgramme?.name ?? '',
      currency: project?.currency ?? '',
      categoryId: args.categoryId,
      categoryName: args.categoryName,
      subCategoryId: args.subCategoryId,
      subCategoryName: args.subCategoryName,
      budgetCents: 0,
      actualCodedCents: 0,
      uncodedAmountCents: 0,
      transactionCount: 0,
    };
    taxonomyRollups.set(key, created);
    return created;
  };

  for (const line of budgetLines) {
    const category = line.category_id
      ? categoryById.get(line.category_id)
      : null;
    const subCategory = line.sub_category_id
      ? subCategoryById.get(line.sub_category_id)
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

  for (const row of transactionExportRows) {
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
  const categoryRollupRows = [...categoryRollupMap.values()];
  addAnalysisWorksheets({
    workbook,
    flatSummaryProjects,
    projectNameById: new Map(projectRows.map((row) => [row.id, row.name])),
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
      budgetRows: budgetLines.map((row) => {
        const project = projectById.get(row.project_id);
        const category = row.category_id ? categoryById.get(row.category_id) : null;
        const subCategory = row.sub_category_id
          ? subCategoryById.get(row.sub_category_id)
          : null;
        const parentProgramme = project?.parent_project_id
          ? projectById.get(project.parent_project_id)
          : null;
        return {
          budgetId: row.id,
          projectId: row.project_id,
          projectName: project?.name ?? '',
          programmeId: parentProgramme?.id ?? '',
          programmeName: parentProgramme?.name ?? '',
          currency: project?.currency ?? '',
          categoryId: row.category_id ?? '',
          categoryName: category?.name ?? '',
          subCategoryId: row.sub_category_id ?? '',
          subCategoryName: subCategory?.name ?? '',
          allocatedCents: Number(row.allocated_cents),
          allocatedAmount: centsToMajorUnits(Number(row.allocated_cents)),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }),
      transactionRows: transactionExportRows,
      categoryRows: categories.map((row) => {
        const project = projectById.get(row.project_id);
        const parentProgramme = project?.parent_project_id
          ? projectById.get(project.parent_project_id)
          : null;
        return {
          categoryId: row.id,
          projectId: row.project_id,
          projectName: project?.name ?? '',
          programmeId: parentProgramme?.id ?? '',
          programmeName: parentProgramme?.name ?? '',
          name: row.name,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }),
      subCategoryRows: subCategories.map((row) => ({
        subCategoryId: row.id,
        projectId: row.project_id,
        projectName: projectById.get(row.project_id)?.name ?? '',
        categoryId: row.category_id,
        categoryName: categoryById.get(row.category_id)?.name ?? '',
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      companyDefaultCategoryRows: companyDefaultCategories.map((row) => ({
        categoryId: row.id,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      companyDefaultSubCategoryRows: companyDefaultSubCategories.map((row) => ({
        subCategoryId: row.id,
        categoryId: row.company_default_category_id,
        categoryName:
          defaultCategoryById.get(row.company_default_category_id)?.name ?? '',
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      defaultMappingRuleRows: companyDefaultMappingRules.map((row) => ({
        ruleId: row.id,
        matchText: row.match_text,
        categoryId: row.company_default_category_id,
        categoryName:
          defaultCategoryById.get(row.company_default_category_id)?.name ?? '',
        subCategoryId: row.company_default_sub_category_id,
        subCategoryName:
          defaultSubCategoryById.get(row.company_default_sub_category_id)
            ?.name ?? '',
        sortOrder: row.sort_order,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      importRuleRows: importRules.map((row) => ({
        ruleId: row.id,
        scope: row.project_id ? 'project' : 'company',
        projectId: row.project_id ?? '',
        name: row.name,
        action: row.action,
        field: row.field,
        operator: row.operator,
        value: row.value,
        sortOrder: row.sort_order,
        enabled: row.enabled,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      companyMemberRows: companyMembers.map((row) => ({
        userId: row.user_id,
        name: row.user_name,
        email: row.user_email,
        role: row.role,
        disabled: row.user_disabled,
        isGlobalSuperadmin: row.is_global_superadmin,
      })),
      projectMembershipRows: projectMemberships.map((row) => ({
        projectId: row.project_id,
        projectName: projectById.get(row.project_id)?.name ?? '',
        projectType: projectById.get(row.project_id)?.project_type ?? '',
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        role: row.role,
      })),
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
