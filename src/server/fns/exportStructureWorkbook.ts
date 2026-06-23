import ExcelJS from 'exceljs';

import type { CompanySummaryProject } from '../../types';
import type { ProjectExportRow } from './exportWorkbook';
import { centsToMajorUnits, createWorksheet } from './exportWorkbook';

export function addStructureWorksheets(args: {
  workbook: ExcelJS.Workbook;
  programmes: ProjectExportRow[];
  operationalProjects: ProjectExportRow[];
  projectRows: ProjectExportRow[];
  projectById: Map<string, ProjectExportRow>;
  projectIdSet: Set<string>;
  childCountByProgrammeId: Map<string, number>;
  flatSummaryProjects: CompanySummaryProject[];
  transactionsByProjectId: Map<
    string,
    Array<{
      reviewed_at: string | null;
      locked_at: string | null;
      sub_category_id: string | null;
      coding_pending_approval: boolean;
      budget_impact: boolean;
    }>
  >;
}) {
  createWorksheet(
    args.workbook,
    'Programmes',
    [
      { header: 'Programme ID', key: 'programmeId' },
      { header: 'Programme name', key: 'programmeName' },
      { header: 'Currency', key: 'currency' },
      { header: 'Status', key: 'status' },
      { header: 'Visibility', key: 'visibility' },
      { header: 'Budget cents', key: 'budgetCents' },
      { header: 'Budget amount', key: 'budgetAmount' },
      { header: 'Sub-project count', key: 'childCount' },
      { header: 'Allow superadmin access', key: 'allowSuperadminAccess' },
      { header: 'Created deactivated at', key: 'deactivatedAt' },
    ],
    args.programmes.map((row) => ({
      programmeId: row.id,
      programmeName: row.name,
      currency: row.currency,
      status: row.status,
      visibility: row.visibility,
      budgetCents: Number(row.budget_total_cents),
      budgetAmount: centsToMajorUnits(Number(row.budget_total_cents)),
      childCount: args.childCountByProgrammeId.get(row.id) ?? 0,
      allowSuperadminAccess: row.allow_superadmin_access,
      deactivatedAt: row.deactivated_at ?? '',
    }))
  );

  createWorksheet(
    args.workbook,
    'Projects',
    [
      { header: 'Project ID', key: 'projectId' },
      { header: 'Project name', key: 'projectName' },
      { header: 'Currency', key: 'currency' },
      { header: 'Status', key: 'status' },
      { header: 'Visibility', key: 'visibility' },
      { header: 'Parent programme ID', key: 'parentProgrammeId' },
      { header: 'Parent programme name', key: 'parentProgrammeName' },
      { header: 'Budget cents', key: 'budgetCents' },
      { header: 'Budget amount', key: 'budgetAmount' },
      {
        header: 'Sync future company defaults',
        key: 'syncCompanyDefaults',
      },
      { header: 'Allow transaction transfers', key: 'allowTxnTransfers' },
      { header: 'Allow superadmin access', key: 'allowSuperadminAccess' },
      { header: 'Deactivated at', key: 'deactivatedAt' },
    ],
    args.operationalProjects.map((row) => ({
      projectId: row.id,
      projectName: row.name,
      currency: row.currency,
      status: row.status,
      visibility: row.visibility,
      parentProgrammeId: row.parent_project_id ?? '',
      parentProgrammeName: row.parent_project_id
        ? (args.projectById.get(row.parent_project_id)?.name ?? '')
        : '',
      budgetCents: Number(row.budget_total_cents),
      budgetAmount: centsToMajorUnits(Number(row.budget_total_cents)),
      syncCompanyDefaults: row.sync_company_defaults,
      allowTxnTransfers: row.allow_txn_transfers,
      allowSuperadminAccess: row.allow_superadmin_access,
      deactivatedAt: row.deactivated_at ?? '',
    }))
  );

  createWorksheet(
    args.workbook,
    'Programme Membership',
    [
      { header: 'Programme ID', key: 'programmeId' },
      { header: 'Programme name', key: 'programmeName' },
      { header: 'Project ID', key: 'projectId' },
      { header: 'Project name', key: 'projectName' },
      { header: 'Project status', key: 'projectStatus' },
      { header: 'Project visibility', key: 'projectVisibility' },
    ],
    args.operationalProjects
      .filter(
        (row) =>
          !!row.parent_project_id &&
          args.projectIdSet.has(row.parent_project_id)
      )
      .map((row) => ({
        programmeId: row.parent_project_id ?? '',
        programmeName: row.parent_project_id
          ? (args.projectById.get(row.parent_project_id)?.name ?? '')
          : '',
        projectId: row.id,
        projectName: row.name,
        projectStatus: row.status,
        projectVisibility: row.visibility,
      }))
  );

  createWorksheet(
    args.workbook,
    'Monthly Actuals',
    [
      { header: 'Project ID', key: 'projectId' },
      { header: 'Project name', key: 'projectName' },
      { header: 'Project type', key: 'projectType' },
      { header: 'Parent programme ID', key: 'parentProgrammeId' },
      { header: 'Parent programme name', key: 'parentProgrammeName' },
      { header: 'Currency', key: 'currency' },
      { header: 'Month', key: 'monthKey' },
      { header: 'Actual coded cents', key: 'actualCodedCents' },
      { header: 'Actual coded amount', key: 'actualCodedAmount' },
      { header: 'Uncoded count', key: 'uncodedCount' },
      { header: 'Uncoded amount cents', key: 'uncodedAmountCents' },
      { header: 'Uncoded amount', key: 'uncodedAmount' },
    ],
    args.flatSummaryProjects.flatMap((project) =>
      project.months.map((month) => ({
        projectId: project.id,
        projectName: project.name,
        projectType: project.projectType,
        parentProgrammeId: project.parentProjectId ?? '',
        parentProgrammeName: project.parentProjectId
          ? (args.projectById.get(project.parentProjectId)?.name ?? '')
          : '',
        currency: project.currency,
        monthKey: month.monthKey,
        actualCodedCents: month.actualCodedCents,
        actualCodedAmount: centsToMajorUnits(month.actualCodedCents),
        uncodedCount: month.uncodedCount,
        uncodedAmountCents: month.uncodedAmountCents,
        uncodedAmount: centsToMajorUnits(month.uncodedAmountCents),
      }))
    )
  );

  createWorksheet(
    args.workbook,
    'Workflow Summary',
    [
      { header: 'Project ID', key: 'projectId' },
      { header: 'Project name', key: 'projectName' },
      { header: 'Project type', key: 'projectType' },
      { header: 'Currency', key: 'currency' },
      { header: 'Parent programme ID', key: 'parentProgrammeId' },
      { header: 'Parent programme name', key: 'parentProgrammeName' },
      { header: 'Total transactions', key: 'totalTransactions' },
      { header: 'Reviewed transactions', key: 'reviewedTransactions' },
      { header: 'Locked transactions', key: 'lockedTransactions' },
      { header: 'Uncoded transactions', key: 'uncodedTransactions' },
      { header: 'Auto-mapped pending', key: 'autoMappedPending' },
      { header: 'Budget-impact transactions', key: 'budgetImpactTransactions' },
    ],
    args.projectRows.map((row) => {
      const projectTxns = args.transactionsByProjectId.get(row.id) ?? [];
      const parentProgramme = row.parent_project_id
        ? args.projectById.get(row.parent_project_id)
        : null;
      return {
        projectId: row.id,
        projectName: row.name,
        projectType: row.project_type,
        currency: row.currency,
        parentProgrammeId: row.parent_project_id ?? '',
        parentProgrammeName: parentProgramme?.name ?? '',
        totalTransactions: projectTxns.length,
        reviewedTransactions: projectTxns.filter((txn) => !!txn.reviewed_at)
          .length,
        lockedTransactions: projectTxns.filter((txn) => !!txn.locked_at).length,
        uncodedTransactions: projectTxns.filter((txn) => !txn.sub_category_id)
          .length,
        autoMappedPending: projectTxns.filter(
          (txn) => txn.coding_pending_approval
        ).length,
        budgetImpactTransactions: projectTxns.filter((txn) => txn.budget_impact)
          .length,
      };
    })
  );
}
