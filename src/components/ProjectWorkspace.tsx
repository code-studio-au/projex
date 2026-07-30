import { lazy, Suspense, useMemo, useState } from 'react';
import { Badge, Group, Paper, Stack, Tabs, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useRouter } from '@tanstack/react-router';

import type {
  CompanyId,
  CompanySummaryProject,
  ProjectId,
  ProjectType,
  TransactionDrilldownFilter,
  TxnId,
} from '../types';

import { useIsHydrated } from '../hooks/useIsHydrated';
import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { useBudgets } from '../hooks/useBudgets';
import { useTransactionActions } from '../hooks/useTransactionActions';
import { useTaxonomy } from '../hooks/useTaxonomy';
import { useRollups } from '../hooks/useRollups';
import { showAppToast } from '../utils/toast';

import {
  useCompanyQuery,
  useCompanySummaryQuery,
  useProjectQuery,
  useProjectsQuery,
} from '../queries/reference';
import {
  useImportTransactionsMutation,
  useUpdateProjectMutation,
} from '../queries/admin';
import { useProjectTransactionSummaryQuery } from '../queries/transactions';

import type { TransactionView } from './transactions/transactionViews';
import BudgetPanel from './BudgetPanel';
import { LoadingLine } from './LoadingValue';
import ProgrammeWorkspace from './ProgrammeWorkspace';
import ProjectWorkspaceTabList from './ProjectWorkspaceTabList';
import {
  resolveProjectWorkspaceTabAccess,
  type ProjectWorkspaceTab,
} from './projectWorkspaceTabAccess';
import {
  type ProjectWorkspaceEntryFocus,
  type ProjectWorkspaceEntrySource,
  type TransactionDrilldownSearch,
  useProjectWorkspaceUrlSync,
} from './projectWorkspace/useProjectWorkspaceUrlSync';
import classes from '../styles/ui.module.css';

const TransactionsPanel = lazy(() => import('./TransactionsPanel'));
const PowerBiImporterPanel = lazy(() => import('./PowerBiImporterPanel'));
const ProjectSettingsPanel = lazy(() => import('./ProjectSettingsPanel'));

type QuarterOption = 'Q1' | 'Q2' | 'Q3' | 'Q4';
function toProjectWorkspaceTab(value: string | null): ProjectWorkspaceTab {
  if (
    value === 'budget' ||
    value === 'transactions' ||
    value === 'import' ||
    value === 'settings'
  ) {
    return value;
  }
  return 'budget';
}

function quarterFromMonthKey(monthKey: string): QuarterOption {
  const month = Number(monthKey.slice(5, 7));
  if (month <= 3) return 'Q1';
  if (month <= 6) return 'Q2';
  if (month <= 9) return 'Q3';
  return 'Q4';
}

function monthKeyMatchesFilters(args: {
  monthKey: string;
  yearFilter: string | null;
  quarterFilter: QuarterOption | null;
  monthFilterKey: string | null;
}) {
  const { monthKey, yearFilter, quarterFilter, monthFilterKey } = args;
  if (monthFilterKey) return monthKey === monthFilterKey;
  if (yearFilter && !monthKey.startsWith(`${yearFilter}-`)) return false;
  if (!quarterFilter) return true;
  return quarterFromMonthKey(monthKey) === quarterFilter;
}

type ProjectWorkspaceProps = {
  companyId: CompanyId;
  projectId: ProjectId;
  initialCompanyName?: string | null;
  initialProjectName?: string | null;
  initialProjectType?: ProjectType;
  initialCurrencyCode?: 'AUD' | 'USD' | 'EUR' | 'GBP';
  initialAllowSuperadminAccess?: boolean;
  initialAllowTxnTransfers?: boolean;
  initialProjectBudgetTotalCents?: number;
  initialProgrammeSummary?: CompanySummaryProject | null;
  initialCanViewProgrammeSummary?: boolean;
  initialCanImport?: boolean;
  initialCanEditBudgets?: boolean;
  initialCanEditTxns?: boolean;
  initialCanEditTaxonomy?: boolean;
  initialCanProjectEdit?: boolean;
  initialTab?: ProjectWorkspaceTab;
  initialYearFilter?: string | null;
  initialQuarterFilter?: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null;
  initialMonthFilterKey?: string | null;
  initialTransactionView?: TransactionView;
  initialTransactionSearch?: string;
  initialCommentTxnId?: TxnId | null;
  initialTransactionDrilldown?: TransactionDrilldownSearch | null;
  initialEntrySource?: ProjectWorkspaceEntrySource;
  initialEntryFocus?: ProjectWorkspaceEntryFocus;
};

type ProjectWorkspaceInnerProps = {
  companyId: CompanyId;
  projectId: ProjectId;
  initialCompanyName: string | null;
  initialProjectName: string | null;
  initialProjectType: ProjectType;
  initialCurrencyCode: 'AUD' | 'USD' | 'EUR' | 'GBP';
  initialAllowSuperadminAccess: boolean;
  initialAllowTxnTransfers: boolean;
  initialProjectBudgetTotalCents: number;
  initialProgrammeSummary: CompanySummaryProject | null;
  initialCanViewProgrammeSummary: boolean;
  initialCanImport: boolean;
  initialCanEditBudgets: boolean;
  initialCanEditTxns: boolean;
  initialCanEditTaxonomy: boolean;
  initialCanProjectEdit: boolean;
  initialTab: ProjectWorkspaceTab;
  initialYearFilter: string | null;
  initialQuarterFilter: QuarterOption | null;
  initialMonthFilterKey: string | null;
  initialTransactionView: TransactionView;
  initialTransactionSearch: string;
  initialCommentTxnId: TxnId | null;
  initialTransactionDrilldown: TransactionDrilldownSearch | null;
  initialEntrySource?: ProjectWorkspaceEntrySource;
  initialEntryFocus?: ProjectWorkspaceEntryFocus;
};

export default function ProjectWorkspace(props: ProjectWorkspaceProps) {
  const {
    companyId,
    projectId,
    initialCompanyName = null,
    initialProjectName = null,
    initialProjectType = 'project',
    initialCurrencyCode = 'AUD',
    initialAllowSuperadminAccess = false,
    initialAllowTxnTransfers = false,
    initialProjectBudgetTotalCents = 0,
    initialProgrammeSummary = null,
    initialCanViewProgrammeSummary = false,
    initialCanImport = false,
    initialCanEditBudgets = false,
    initialCanEditTxns = false,
    initialCanEditTaxonomy = false,
    initialCanProjectEdit = false,
    initialTab = 'budget',
    initialYearFilter = null,
    initialQuarterFilter = null,
    initialMonthFilterKey = null,
    initialTransactionView = 'all',
    initialTransactionSearch = '',
    initialCommentTxnId = null,
    initialTransactionDrilldown = null,
    initialEntrySource,
    initialEntryFocus,
  } = props;
  const resolvedInitialYearFilter =
    initialYearFilter ?? initialMonthFilterKey?.slice(0, 4) ?? null;
  const resolvedInitialQuarterFilter =
    initialQuarterFilter ??
    (initialMonthFilterKey
      ? (() => {
          const month = Number(initialMonthFilterKey.slice(5, 7));
          return month <= 3
            ? 'Q1'
            : month <= 6
              ? 'Q2'
              : month <= 9
                ? 'Q3'
                : 'Q4';
        })()
      : null);
  const resetKey = [
    projectId,
    initialTab,
    resolvedInitialYearFilter ?? '',
    resolvedInitialQuarterFilter ?? '',
    initialMonthFilterKey ?? '',
    initialTransactionView,
    initialCommentTxnId ?? '',
    initialTransactionDrilldown?.kind ?? '',
    initialTransactionDrilldown?.categoryId ?? '',
    initialTransactionDrilldown?.kind === 'subcategory'
      ? initialTransactionDrilldown.subCategoryId
      : '',
    initialTransactionDrilldown?.categoryName ?? '',
    initialTransactionDrilldown?.kind === 'subcategory'
      ? (initialTransactionDrilldown.subCategoryName ?? '')
      : '',
    initialEntrySource ?? '',
    initialEntryFocus ?? '',
  ].join('|');

  return (
    <ProjectWorkspaceInner
      key={resetKey}
      companyId={companyId}
      projectId={projectId}
      initialCompanyName={initialCompanyName}
      initialProjectName={initialProjectName}
      initialProjectType={initialProjectType}
      initialCurrencyCode={initialCurrencyCode}
      initialAllowSuperadminAccess={initialAllowSuperadminAccess}
      initialAllowTxnTransfers={initialAllowTxnTransfers}
      initialProjectBudgetTotalCents={initialProjectBudgetTotalCents}
      initialProgrammeSummary={initialProgrammeSummary}
      initialCanViewProgrammeSummary={initialCanViewProgrammeSummary}
      initialCanImport={initialCanImport}
      initialCanEditBudgets={initialCanEditBudgets}
      initialCanEditTxns={initialCanEditTxns}
      initialCanEditTaxonomy={initialCanEditTaxonomy}
      initialCanProjectEdit={initialCanProjectEdit}
      initialTab={initialTab}
      initialYearFilter={resolvedInitialYearFilter}
      initialQuarterFilter={resolvedInitialQuarterFilter}
      initialMonthFilterKey={initialMonthFilterKey}
      initialTransactionView={initialTransactionView}
      initialTransactionSearch={initialTransactionSearch}
      initialCommentTxnId={initialCommentTxnId}
      initialTransactionDrilldown={initialTransactionDrilldown}
      initialEntrySource={initialEntrySource}
      initialEntryFocus={initialEntryFocus}
    />
  );
}

function ProjectWorkspaceInner(props: ProjectWorkspaceInnerProps) {
  const {
    companyId,
    projectId,
    initialCompanyName,
    initialProjectName,
    initialProjectType,
    initialCurrencyCode,
    initialAllowSuperadminAccess,
    initialAllowTxnTransfers,
    initialProjectBudgetTotalCents,
    initialProgrammeSummary,
    initialCanViewProgrammeSummary,
    initialCanImport,
    initialCanEditBudgets,
    initialCanEditTxns,
    initialCanEditTaxonomy,
    initialCanProjectEdit,
    initialTab,
    initialYearFilter,
    initialQuarterFilter,
    initialMonthFilterKey,
    initialTransactionView,
    initialTransactionSearch,
    initialCommentTxnId,
    initialTransactionDrilldown,
    initialEntrySource,
    initialEntryFocus,
  } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');
  const router = useRouter();
  const isHydrated = useIsHydrated();

  const access = useCompanyAccess(companyId);
  const company = useCompanyQuery(companyId);
  const project = useProjectQuery(projectId);
  const projects = useProjectsQuery(companyId);
  const liveCanViewProgrammeSummary =
    access.isAdmin || access.isExecutive || access.isSuperadmin;
  const canViewProgrammeSummary = isHydrated
    ? liveCanViewProgrammeSummary
    : initialCanViewProgrammeSummary;
  const effectiveProjectType =
    (isHydrated ? project.data?.projectType : undefined) ?? initialProjectType;
  const companySummary = useCompanySummaryQuery(companyId, {
    enabled: effectiveProjectType === 'programme' && canViewProgrammeSummary,
  });
  const updateProject = useUpdateProjectMutation(companyId);
  const isOperationalProject = effectiveProjectType === 'project';

  const { canImport, canProjectEdit } = resolveProjectWorkspaceTabAccess({
    isHydrated,
    isOperationalProject,
    initialCanImport,
    initialCanProjectEdit,
    liveCanImport: access.can('project:import', projectId),
    liveCanProjectEdit: access.can('project:edit', projectId),
  });
  const canEditBudgets =
    isOperationalProject &&
    (isHydrated
      ? initialCanEditBudgets || access.can('budget:edit', projectId)
      : initialCanEditBudgets);
  const canEditTxns =
    isOperationalProject &&
    (isHydrated
      ? initialCanEditTxns || access.can('txns:edit', projectId)
      : initialCanEditTxns);
  const canEditTaxonomy =
    isOperationalProject &&
    (isHydrated
      ? initialCanEditTaxonomy || access.can('taxonomy:edit', projectId)
      : initialCanEditTaxonomy);
  const canManageReversals =
    isOperationalProject &&
    (isHydrated ? access.can('txns:manage_reversals', projectId) : false);
  const canResolveUnlock =
    isOperationalProject &&
    (isHydrated ? access.can('txns:resolve_unlock', projectId) : false);
  const canAdminUnlock =
    isOperationalProject &&
    (isHydrated ? access.can('txns:admin_unlock', projectId) : false);
  const canManageImportRules = isHydrated
    ? access.can('project:import', projectId)
    : false;
  const [activeTab, setActiveTab] = useState<ProjectWorkspaceTab>(initialTab);
  const [yearFilter, setYearFilter] = useState<string | null>(
    initialYearFilter
  );
  const [quarterFilter, setQuarterFilter] = useState<QuarterOption | null>(
    initialQuarterFilter
  );
  const [monthFilterKey, setMonthFilterKey] = useState<string | null>(
    initialMonthFilterKey
  );
  const [transactionView, setTransactionView] = useState<TransactionView>(
    initialTransactionView
  );
  const transactionSearch = initialTransactionSearch;
  const [transactionDrilldown, setTransactionDrilldown] =
    useState<TransactionDrilldownSearch | null>(initialTransactionDrilldown);
  const { pushNextUrlSync } = useProjectWorkspaceUrlSync({
    companyId,
    projectId,
    activeTab,
    yearFilter,
    quarterFilter,
    monthFilterKey,
    transactionView,
    transactionDrilldown,
    entrySource: initialEntrySource,
    entryFocus: initialEntryFocus,
  });

  const budgets = useBudgets({
    companyId,
    projectId,
    enabled: isOperationalProject,
  });
  const projectTransactionSummaryQ = useProjectTransactionSummaryQuery(
    projectId,
    { enabled: isOperationalProject }
  );
  const transactionActions = useTransactionActions(projectId);
  const importTransactions = useImportTransactionsMutation(projectId);
  const taxonomy = useTaxonomy({
    companyId,
    projectId,
    budgets,
    canEditBudgets,
    enabled: isOperationalProject,
  });

  const effectiveCompanyName =
    (isHydrated ? company.data?.name : undefined) ?? initialCompanyName;
  const effectiveProjectName =
    (isHydrated ? project.data?.name : undefined) ?? initialProjectName;
  const effectiveCurrencyCode =
    (isHydrated ? project.data?.currency : undefined) ?? initialCurrencyCode;
  const effectiveAllowSuperadminAccess =
    (isHydrated ? project.data?.allowSuperadminAccess : undefined) ??
    initialAllowSuperadminAccess;
  const effectiveAllowTxnTransfers =
    (isHydrated ? project.data?.allowTxnTransfers : undefined) ??
    initialAllowTxnTransfers;
  const effectiveProjectBudgetTotalCents =
    (isHydrated ? project.data?.budgetTotalCents : undefined) ??
    initialProjectBudgetTotalCents;

  const effectiveTransactionDrilldown = useMemo(() => {
    if (!transactionDrilldown) return null;
    const categoryName =
      taxonomy.categories.find(
        (category) => category.id === transactionDrilldown.categoryId
      )?.name ??
      transactionDrilldown.categoryName ??
      transactionDrilldown.categoryId;
    if (transactionDrilldown.kind === 'category') {
      return {
        kind: 'category' as const,
        categoryId: transactionDrilldown.categoryId,
        categoryName,
      };
    }

    const subCategoryName =
      taxonomy.subCategories.find(
        (subCategory) => subCategory.id === transactionDrilldown.subCategoryId
      )?.name ??
      transactionDrilldown.subCategoryName ??
      transactionDrilldown.subCategoryId;
    return {
      kind: 'subcategory' as const,
      categoryId: transactionDrilldown.categoryId,
      categoryName,
      subCategoryId: transactionDrilldown.subCategoryId,
      subCategoryName,
    };
  }, [taxonomy.categories, taxonomy.subCategories, transactionDrilldown]);

  function openTransactionDrilldown(filter: TransactionDrilldownFilter) {
    pushNextUrlSync();
    setTransactionDrilldown(
      filter.kind === 'subcategory'
        ? {
            kind: 'subcategory',
            categoryId: filter.categoryId,
            subCategoryId: filter.subCategoryId,
            categoryName: filter.categoryName,
            subCategoryName: filter.subCategoryName,
          }
        : {
            kind: 'category',
            categoryId: filter.categoryId,
            categoryName: filter.categoryName,
          }
    );
    setTransactionView('all');
    setActiveTab('transactions');
  }

  const rollups = useRollups({
    transactionSummary: projectTransactionSummaryQ.data,
    budgets: budgets.budgets,
    taxonomy,
    yearFilter,
    quarterFilter,
    monthFilterKey,
  });
  const programmeSummary = useMemo(() => {
    const liveProgrammeSummary = (companySummary.data?.projects ?? []).find(
      (candidate) => candidate.id === projectId
    );
    return liveProgrammeSummary ?? initialProgrammeSummary;
  }, [companySummary.data?.projects, initialProgrammeSummary, projectId]);

  const operationalMonthKeys = useMemo(
    () =>
      rollups.monthStarts.map((date) => {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
      }),
    [rollups.monthStarts]
  );
  const programmeMonthKeys = useMemo(() => {
    const keys = new Set<string>();
    if (programmeSummary) {
      for (const project of [
        programmeSummary,
        ...(programmeSummary.children ?? []),
      ]) {
        for (const month of project.months) keys.add(month.monthKey);
      }
    }
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [programmeSummary]);
  const allMonthKeys = isOperationalProject
    ? operationalMonthKeys
    : programmeMonthKeys;

  const yearFilterOptions = useMemo(() => {
    const years = new Set(allMonthKeys.map((key) => key.slice(0, 4)));
    return [...years]
      .sort((a, b) => b.localeCompare(a))
      .map((value) => ({ value, label: value }));
  }, [allMonthKeys]);

  const quarterFilterOptions = useMemo(() => {
    if (!yearFilter) return [];
    const filteredMonths = allMonthKeys.filter((key) =>
      key.startsWith(`${yearFilter}-`)
    );
    const quarters = new Set(
      filteredMonths.map((key) => {
        return quarterFromMonthKey(key);
      })
    );
    return (['Q1', 'Q2', 'Q3', 'Q4'] as const)
      .filter((quarter) => quarters.has(quarter))
      .map((value) => ({ value, label: value }));
  }, [allMonthKeys, yearFilter]);

  const monthFilterOptions = useMemo(
    () =>
      allMonthKeys.flatMap((value) => {
        if (yearFilter && !value.startsWith(`${yearFilter}-`)) return [];
        if (quarterFilter && quarterFromMonthKey(value) !== quarterFilter) {
          return [];
        }
        return [{ value, label: value }];
      }),
    [allMonthKeys, quarterFilter, yearFilter]
  );

  const transferProjectOptions = useMemo(
    () =>
      (projects.data ?? []).flatMap((candidate) =>
        candidate.id !== projectId &&
        candidate.status === 'active' &&
        candidate.projectType === 'project' &&
        access.can('txns:edit', candidate.id)
          ? [{ value: candidate.id, label: candidate.name }]
          : []
      ),
    [access, projectId, projects.data]
  );

  const transactionPeriodSummary = useMemo(() => {
    const visiblePeriods = (
      projectTransactionSummaryQ.data?.periodSummaries ?? []
    ).filter((period) =>
      monthKeyMatchesFilters({
        monthKey: period.monthKey,
        yearFilter,
        quarterFilter,
        monthFilterKey,
      })
    );
    return {
      uncodedCount: visiblePeriods.reduce(
        (total, period) => total + period.uncodedCount,
        0
      ),
      uncodedAmountCents: visiblePeriods.reduce(
        (total, period) => total + period.uncodedAmountCents,
        0
      ),
      pendingReversalCents: visiblePeriods.reduce(
        (total, period) => total + period.pendingReversalCents,
        0
      ),
      pendingReversalCount: visiblePeriods.reduce(
        (total, period) => total + period.pendingReversalCount,
        0
      ),
    };
  }, [
    monthFilterKey,
    projectTransactionSummaryQ.data?.periodSummaries,
    quarterFilter,
    yearFilter,
  ]);
  const headerReady = Boolean(effectiveCompanyName && effectiveProjectName);
  const summaryReady =
    headerReady &&
    !budgets.isLoading &&
    !projectTransactionSummaryQ.isLoading &&
    !taxonomy.isLoading;
  const currencyCode = effectiveCurrencyCode;
  const entryMessage = useMemo(() => {
    if (initialEntrySource === 'company-work-queue') {
      return 'Opened from the company project list to resolve outstanding work.';
    }
    if (initialEntrySource !== 'company-summary') return null;
    switch (initialEntryFocus) {
      case 'actual':
        return 'Opened from the company summary to review actual spend for this project.';
      case 'remaining':
        return 'Opened from the company summary to review this project budget position.';
      case 'uncoded':
        return 'Opened from the company summary to review uncoded transactions for this project.';
      case 'health':
        return 'Opened from the company summary to review this project health snapshot.';
      case 'budget':
      default:
        return 'Opened from the company summary to review this project budget snapshot.';
    }
  }, [initialEntryFocus, initialEntrySource]);

  if (effectiveProjectType === 'programme') {
    return (
      <ProgrammeWorkspace
        companyName={effectiveCompanyName}
        projectName={effectiveProjectName}
        currencyCode={currencyCode}
        programmeSummary={programmeSummary}
        canViewProgrammeSummary={canViewProgrammeSummary}
        headerReady={headerReady}
        isMobile={isMobile}
        yearFilterOptions={yearFilterOptions}
        yearFilter={yearFilter}
        quarterFilterOptions={quarterFilterOptions}
        quarterFilter={quarterFilter}
        monthFilterOptions={monthFilterOptions}
        monthFilterKey={monthFilterKey}
        onYearFilterChange={setYearFilter}
        onQuarterFilterChange={setQuarterFilter}
        onMonthFilterChange={setMonthFilterKey}
        onOpenProject={(childProjectId) => {
          void router.navigate({
            to: '/c/$companyId/p/$projectId',
            params: { companyId, projectId: childProjectId },
            search: {
              year: yearFilter ?? undefined,
              quarter: quarterFilter ?? undefined,
              month: monthFilterKey ?? undefined,
              source: 'company-summary',
            },
          });
        }}
      />
    );
  }

  return (
    <Stack gap="lg" className={classes.pageStack}>
      <Paper
        className={classes.pageHero}
        p={isMobile ? 'md' : 'lg'}
        radius="xl"
      >
        <Stack gap="sm">
          <Group justify="space-between" align="center" wrap="wrap">
            {headerReady || (initialCompanyName && initialProjectName) ? (
              <Title order={3} className={classes.pageHeroTitle}>
                {effectiveCompanyName ?? ''} • {effectiveProjectName ?? ''}
              </Title>
            ) : (
              <LoadingLine width={320} height={30} radius="md" />
            )}

            <Group gap="sm" wrap="wrap">
              {effectiveAllowSuperadminAccess ? (
                <Badge
                  size={isMobile ? 'md' : 'lg'}
                  variant="light"
                  color="teal"
                >
                  Superadmin access enabled
                </Badge>
              ) : null}
            </Group>
          </Group>

          {entryMessage ? (
            <Group align="center" wrap="wrap">
              <Text size="sm" c="dimmed">
                {entryMessage}
              </Text>
            </Group>
          ) : null}
        </Stack>
      </Paper>

      <Paper className={classes.surfaceCard} radius="xl" p="md">
        <Tabs
          value={activeTab}
          onChange={(value) => setActiveTab(toProjectWorkspaceTab(value))}
          keepMounted={false}
          className={classes.softTabs}
        >
          <ProjectWorkspaceTabList
            canImport={canImport}
            canProjectEdit={canProjectEdit}
          />

          <Tabs.Panel value="transactions" pt="md">
            <Suspense fallback={<LoadingLine height={180} radius="md" />}>
              <TransactionsPanel
                projectId={projectId}
                transactionActions={transactionActions}
                taxonomy={taxonomy}
                autoMappedPendingCount={
                  projectTransactionSummaryQ.data?.autoMappedPendingCount ?? 0
                }
                currencyCode={currencyCode}
                yearFilterOptions={yearFilterOptions}
                yearFilter={yearFilter}
                setYearFilter={setYearFilter}
                quarterFilterOptions={quarterFilterOptions}
                quarterFilter={quarterFilter}
                setQuarterFilter={setQuarterFilter}
                monthFilterOptions={monthFilterOptions}
                monthFilterKey={monthFilterKey}
                setMonthFilterKey={setMonthFilterKey}
                transactionView={transactionView}
                setTransactionView={setTransactionView}
                transactionSearch={transactionSearch}
                setTransactionSearch={(value) => {
                  void router.navigate({
                    to: '/c/$companyId/p/$projectId',
                    params: { companyId, projectId },
                    search: {
                      year: yearFilter ?? undefined,
                      quarter: quarterFilter ?? undefined,
                      tab: activeTab === 'budget' ? undefined : activeTab,
                      month: monthFilterKey ?? undefined,
                      view:
                        transactionView === 'all' ? undefined : transactionView,
                      q: value.trim().slice(0, 200) || undefined,
                      source: initialEntrySource,
                      focus: initialEntryFocus,
                      drilldownKind: transactionDrilldown?.kind,
                      categoryId: transactionDrilldown?.categoryId,
                      categoryName: transactionDrilldown?.categoryName,
                      subCategoryId:
                        transactionDrilldown?.kind === 'subcategory'
                          ? transactionDrilldown.subCategoryId
                          : undefined,
                      subCategoryName:
                        transactionDrilldown?.kind === 'subcategory'
                          ? transactionDrilldown.subCategoryName
                          : undefined,
                    },
                    replace: true,
                  });
                }}
                transactionDrilldown={effectiveTransactionDrilldown}
                onClearTransactionDrilldown={() =>
                  setTransactionDrilldown(null)
                }
                initialCommentTxnId={initialCommentTxnId}
                transferOutEnabled={effectiveAllowTxnTransfers}
                transferProjectOptions={transferProjectOptions}
                onClearFilters={() => {
                  setYearFilter(null);
                  setQuarterFilter(null);
                  setMonthFilterKey(null);
                  setTransactionDrilldown(null);
                  void router.navigate({
                    to: '/c/$companyId/p/$projectId',
                    params: { companyId, projectId },
                    search: {
                      tab: activeTab === 'budget' ? undefined : activeTab,
                      month: undefined,
                      quarter: undefined,
                      year: undefined,
                      view:
                        transactionView === 'all' ? undefined : transactionView,
                      q: transactionSearch.trim() || undefined,
                      source: undefined,
                      focus: undefined,
                      drilldownKind: undefined,
                      categoryId: undefined,
                      categoryName: undefined,
                      subCategoryId: undefined,
                      subCategoryName: undefined,
                    },
                    replace: true,
                  });
                }}
                canEditTaxonomy={canEditTaxonomy}
                canManageReversals={canManageReversals}
                canResolveUnlock={canResolveUnlock}
                canAdminUnlock={canAdminUnlock}
                readOnly={!canEditTxns}
              />
            </Suspense>
          </Tabs.Panel>

          <Tabs.Panel value="budget" pt="md">
            <BudgetPanel
              projectId={projectId}
              currencyCode={currencyCode}
              projectBudgetTotalCents={effectiveProjectBudgetTotalCents}
              yearFilterOptions={yearFilterOptions}
              yearFilter={yearFilter}
              setYearFilter={setYearFilter}
              quarterFilterOptions={quarterFilterOptions}
              quarterFilter={quarterFilter}
              setQuarterFilter={setQuarterFilter}
              monthFilterOptions={monthFilterOptions}
              monthFilterKey={monthFilterKey}
              setMonthFilterKey={setMonthFilterKey}
              onClearFilters={() => {
                setYearFilter(null);
                setQuarterFilter(null);
                setMonthFilterKey(null);
                void router.navigate({
                  to: '/c/$companyId/p/$projectId',
                  params: { companyId, projectId },
                  search: {
                    tab: activeTab === 'budget' ? undefined : activeTab,
                    month: undefined,
                    quarter: undefined,
                    year: undefined,
                    view:
                      transactionView === 'all' ? undefined : transactionView,
                    q: transactionSearch.trim() || undefined,
                    source: undefined,
                    focus: undefined,
                    drilldownKind: undefined,
                    categoryId: undefined,
                    categoryName: undefined,
                    subCategoryId: undefined,
                    subCategoryName: undefined,
                  },
                  replace: true,
                });
              }}
              onTransactionDrilldown={openTransactionDrilldown}
              onUpdateProjectBudgetTotal={async (budgetTotalCents) => {
                await updateProject.mutateAsync({
                  id: projectId,
                  budgetTotalCents,
                });
              }}
              rollups={rollups}
              budgets={budgets}
              uncodedSummary={{
                count: transactionPeriodSummary.uncodedCount,
                amountCents: transactionPeriodSummary.uncodedAmountCents,
              }}
              pendingReversalCents={
                transactionPeriodSummary.pendingReversalCents
              }
              pendingReversalCount={
                transactionPeriodSummary.pendingReversalCount
              }
              isLoading={!summaryReady}
              canEditProjectBudgetTotal={canEditBudgets}
              readOnly={!canEditBudgets}
            />
          </Tabs.Panel>

          <Tabs.Panel value="import" pt="md">
            <Stack gap="md">
              <Suspense fallback={<LoadingLine height={180} radius="md" />}>
                <PowerBiImporterPanel
                  companyId={companyId}
                  projectId={projectId}
                  currencyCode={currencyCode}
                  canEditTaxonomy={canEditTaxonomy}
                  canEditBudgets={canEditBudgets}
                  canManageImportRules={canManageImportRules}
                  onImportComplete={(message) => {
                    setActiveTab('transactions');
                    showAppToast({
                      tone: 'success',
                      title: 'Import complete',
                      message,
                      autoClose: 8000,
                    });
                  }}
                  onReplaceAll={async (options) => {
                    return importTransactions.mutateAsync({
                      mode: 'replaceAll',
                      ...options,
                    });
                  }}
                  onAppend={async (options) => {
                    return importTransactions.mutateAsync({
                      mode: 'append',
                      ...options,
                    });
                  }}
                />
              </Suspense>
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="settings" pt="md">
            <Suspense fallback={<LoadingLine height={180} radius="md" />}>
              <ProjectSettingsPanel
                companyId={companyId}
                projectId={projectId}
              />
            </Suspense>
          </Tabs.Panel>
        </Tabs>
      </Paper>
    </Stack>
  );
}
