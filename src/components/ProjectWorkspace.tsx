import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Badge,
  Button,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useRouter } from '@tanstack/react-router';

import type {
  CategoryId,
  CompanyId,
  CompanySummaryProject,
  ProjectId,
  ProjectType,
  SubCategoryId,
  TransactionDrilldownFilter,
  TxnId,
} from '../types';

import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { useBudgets } from '../hooks/useBudgets';
import { useTransactions } from '../hooks/useTransactions';
import { useTaxonomy } from '../hooks/useTaxonomy';
import { useRollups } from '../hooks/useRollups';
import { formatCurrencyFromCents } from '../utils/money';

import {
  useCompanyQuery,
  useCompanySummaryQuery,
  useProjectQuery,
  useProjectsQuery,
} from '../queries/reference';
import { useUpdateProjectMutation } from '../queries/admin';

import TransactionsPanel from './TransactionsPanel';
import BudgetPanel from './BudgetPanel';
import PowerBiImporterPanel from './PowerBiImporterPanel';
import ImportReviewQueuePanel from './ImportReviewQueuePanel';
import ProjectSettingsPanel from './ProjectSettingsPanel';
import { LoadingLine } from './LoadingValue';
import classes from '../styles/ui.module.css';

const hydrateSubscription = () => () => {};
const getClientHydratedSnapshot = () => true;
const getServerHydratedSnapshot = () => false;

type ProjectWorkspaceTab = 'budget' | 'transactions' | 'import' | 'settings';
type QuarterOption = 'Q1' | 'Q2' | 'Q3' | 'Q4';
type TransactionView =
  | 'all'
  | 'uncoded'
  | 'auto-mapped-pending'
  | 'assigned-to-me';
type TransactionDrilldownSearch =
  | {
      kind: 'category';
      categoryId: CategoryId;
      categoryName?: string;
    }
  | {
      kind: 'subcategory';
      categoryId: CategoryId;
      subCategoryId: SubCategoryId;
      categoryName?: string;
      subCategoryName?: string;
    };

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

function filteredBudgetCents(
  budgetCents: number,
  args: { quarterFilter: QuarterOption | null; monthFilterKey: string | null }
) {
  const visibleMonthCount = args.monthFilterKey
    ? 1
    : args.quarterFilter
      ? 3
      : 12;
  return Math.round((budgetCents * visibleMonthCount) / 12);
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
  initialCommentTxnId?: TxnId | null;
  initialTransactionDrilldown?: TransactionDrilldownSearch | null;
  initialEntrySource?: 'company-summary';
  initialEntryFocus?: 'budget' | 'actual' | 'remaining' | 'uncoded' | 'health';
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
  initialCommentTxnId: TxnId | null;
  initialTransactionDrilldown: TransactionDrilldownSearch | null;
  initialEntrySource?: 'company-summary';
  initialEntryFocus?: 'budget' | 'actual' | 'remaining' | 'uncoded' | 'health';
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
    initialCommentTxnId,
    initialTransactionDrilldown,
    initialEntrySource,
    initialEntryFocus,
  } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');
  const router = useRouter();
  const isHydrated = useSyncExternalStore(
    hydrateSubscription,
    getClientHydratedSnapshot,
    getServerHydratedSnapshot
  );

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

  const canProjectEdit = isHydrated
    ? initialCanProjectEdit || access.can('project:edit', projectId)
    : initialCanProjectEdit;
  const canImport =
    isOperationalProject &&
    (isHydrated
      ? initialCanImport || access.can('project:import', projectId)
      : initialCanImport);
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
  const canManageImportRules = isHydrated
    ? access.can('company:manage_defaults')
    : false;

  const budgets = useBudgets({
    companyId,
    projectId,
    enabled: isOperationalProject,
  });
  const txns = useTransactions({ projectId, enabled: isOperationalProject });
  const taxonomy = useTaxonomy({
    companyId,
    projectId,
    budgets,
    txns,
    canEditBudgets,
    enabled: isOperationalProject,
  });

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
  const [transactionDrilldown, setTransactionDrilldown] =
    useState<TransactionDrilldownSearch | null>(initialTransactionDrilldown);
  const nextUrlSyncShouldReplaceRef = useRef(true);

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
    nextUrlSyncShouldReplaceRef.current = false;
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
    transactions: txns.transactions,
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
      allMonthKeys
        .filter((key) => {
          if (yearFilter && !key.startsWith(`${yearFilter}-`)) return false;
          if (!quarterFilter) return true;
          return quarterFromMonthKey(key) === quarterFilter;
        })
        .map((value) => ({ value, label: value })),
    [allMonthKeys, quarterFilter, yearFilter]
  );

  const transferProjectOptions = useMemo(
    () =>
      (projects.data ?? [])
        .filter(
          (candidate) =>
            candidate.id !== projectId &&
            candidate.status === 'active' &&
            candidate.projectType === 'project' &&
            access.can('txns:edit', candidate.id)
        )
        .map((candidate) => ({
          value: candidate.id,
          label: candidate.name,
        })),
    [access, projectId, projects.data]
  );

  const uncoded = useMemo(
    () => txns.getUncodedSummary(taxonomy.validSubIds),
    [txns, taxonomy.validSubIds]
  );
  const headerReady = Boolean(effectiveCompanyName && effectiveProjectName);
  const summaryReady =
    headerReady && !budgets.isLoading && !txns.isLoading && !taxonomy.isLoading;
  const currencyCode = effectiveCurrencyCode;
  const programmeTotals = useMemo(() => {
    const visibleMonths = (programmeSummary?.months ?? []).filter((month) =>
      monthKeyMatchesFilters({
        monthKey: month.monthKey,
        yearFilter,
        quarterFilter,
        monthFilterKey,
      })
    );
    return {
      budgetCents: filteredBudgetCents(programmeSummary?.budgetCents ?? 0, {
        quarterFilter,
        monthFilterKey,
      }),
      actualCents: visibleMonths.reduce(
        (total, month) => total + month.actualCodedCents,
        0
      ),
      uncodedCount: visibleMonths.reduce(
        (total, month) => total + month.uncodedCount,
        0
      ),
      uncodedAmountCents: visibleMonths.reduce(
        (total, month) => total + month.uncodedAmountCents,
        0
      ),
    };
  }, [monthFilterKey, programmeSummary, quarterFilter, yearFilter]);
  const entryMessage = useMemo(() => {
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

  useEffect(() => {
    const replace = nextUrlSyncShouldReplaceRef.current;
    nextUrlSyncShouldReplaceRef.current = true;
    void router.navigate({
      to: '/c/$companyId/p/$projectId',
      params: { companyId, projectId },
      search: {
        year: yearFilter ?? undefined,
        quarter: quarterFilter ?? undefined,
        tab: activeTab === 'budget' ? undefined : activeTab,
        month: monthFilterKey ?? undefined,
        view: transactionView === 'all' ? undefined : transactionView,
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
      replace,
    });
  }, [
    activeTab,
    companyId,
    initialEntryFocus,
    initialEntrySource,
    yearFilter,
    quarterFilter,
    monthFilterKey,
    projectId,
    router,
    transactionDrilldown,
    transactionView,
  ]);

  if (effectiveProjectType === 'programme') {
    const childProjects = programmeSummary?.children ?? [];
    return (
      <Stack gap="lg" className={classes.pageStack}>
        <Paper
          className={classes.pageHero}
          p={isMobile ? 'md' : 'lg'}
          radius="xl"
        >
          <Stack gap="sm">
            <Group justify="space-between" align="center" wrap="wrap">
              {headerReady ? (
                <Title order={3} className={classes.pageHeroTitle}>
                  {effectiveCompanyName} • {effectiveProjectName}
                </Title>
              ) : (
                <LoadingLine width={320} height={30} radius="md" />
              )}
              <Badge size={isMobile ? 'md' : 'lg'} variant="light" color="blue">
                Programme
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              Programmes are reporting-only containers. Budgets, imports,
              transactions, taxonomy, and coding live in the sub-projects below.
            </Text>
          </Stack>
        </Paper>

        {!canViewProgrammeSummary ? (
          <Paper className={classes.surfaceCard} radius="xl" p="lg">
            <Text c="dimmed">
              Programme rollups are available to company admins, executives, and
              superadmins.
            </Text>
          </Paper>
        ) : null}

        {canViewProgrammeSummary ? (
          <>
            <Paper className={classes.surfaceCard} radius="xl" p="lg">
              <Stack gap="md">
                <Group justify="space-between" align="center" wrap="wrap">
                  <Title order={5}>Programme rollup</Title>
                  <Button
                    size="xs"
                    variant="light"
                    disabled={!yearFilter && !quarterFilter && !monthFilterKey}
                    onClick={() => {
                      setYearFilter(null);
                      setQuarterFilter(null);
                      setMonthFilterKey(null);
                    }}
                  >
                    Clear filters
                  </Button>
                </Group>
                <SimpleGrid cols={isMobile ? 1 : 3} spacing="md">
                  <Select
                    label="Year"
                    placeholder="All years"
                    data={yearFilterOptions}
                    value={yearFilter}
                    clearable
                    onChange={(value) => {
                      setYearFilter(value);
                      setQuarterFilter(null);
                      setMonthFilterKey(null);
                    }}
                  />
                  <Select
                    label="Quarter"
                    placeholder="All quarters"
                    data={quarterFilterOptions}
                    value={quarterFilter}
                    clearable
                    onChange={(value) => {
                      setQuarterFilter(
                        value === 'Q1' ||
                          value === 'Q2' ||
                          value === 'Q3' ||
                          value === 'Q4'
                          ? value
                          : null
                      );
                      setMonthFilterKey(null);
                    }}
                  />
                  <Select
                    label="Month"
                    placeholder="All months"
                    data={monthFilterOptions}
                    value={monthFilterKey}
                    clearable
                    onChange={setMonthFilterKey}
                  />
                </SimpleGrid>
                {monthFilterKey || quarterFilter || yearFilter ? (
                  <Text size="xs" c="dimmed">
                    Programme budget, actual, and uncoded totals reflect the
                    selected time filter.
                  </Text>
                ) : null}
              </Stack>
            </Paper>

            <SimpleGrid cols={isMobile ? 1 : 4} spacing="md">
              <Paper className={classes.statCard} withBorder={false}>
                <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                  Sub-projects
                </Text>
                <Title order={3}>{childProjects.length}</Title>
              </Paper>
              <Paper className={classes.statCard} withBorder={false}>
                <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                  Total budget
                </Text>
                <Title order={4}>
                  {formatCurrencyFromCents(
                    programmeTotals.budgetCents,
                    currencyCode
                  )}
                </Title>
              </Paper>
              <Paper className={classes.statCard} withBorder={false}>
                <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                  Actual
                </Text>
                <Title order={4}>
                  {formatCurrencyFromCents(
                    programmeTotals.actualCents,
                    currencyCode
                  )}
                </Title>
              </Paper>
              <Paper className={classes.statCard} withBorder={false}>
                <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
                  Uncoded
                </Text>
                <Title order={4}>{programmeTotals.uncodedCount}</Title>
              </Paper>
            </SimpleGrid>
          </>
        ) : null}

        {canViewProgrammeSummary ? (
          <Paper className={classes.surfaceCard} radius="xl" p="lg">
            <Stack gap="sm">
              <Title order={5}>Sub-projects</Title>
              {childProjects.length ? (
                <Table.ScrollContainer minWidth={720}>
                  <Table striped highlightOnHover withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Project</Table.Th>
                        <Table.Th>Budget</Table.Th>
                        <Table.Th>Actual</Table.Th>
                        <Table.Th>Uncoded</Table.Th>
                        <Table.Th>Status</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {childProjects.map((child) => {
                        const visibleMonths = child.months.filter((month) =>
                          monthKeyMatchesFilters({
                            monthKey: month.monthKey,
                            yearFilter,
                            quarterFilter,
                            monthFilterKey,
                          })
                        );
                        const actualCents = visibleMonths.reduce(
                          (total, month) => total + month.actualCodedCents,
                          0
                        );
                        const uncodedCount = visibleMonths.reduce(
                          (total, month) => total + month.uncodedCount,
                          0
                        );
                        const budgetCents = filteredBudgetCents(
                          child.budgetCents,
                          {
                            quarterFilter,
                            monthFilterKey,
                          }
                        );
                        const canOpenChild = child.status === 'active';
                        return (
                          <Table.Tr key={child.id}>
                            <Table.Td>
                              {canOpenChild ? (
                                <button
                                  type="button"
                                  className={classes.drilldownButton}
                                  onClick={() =>
                                    router.navigate({
                                      to: '/c/$companyId/p/$projectId',
                                      params: {
                                        companyId,
                                        projectId: child.id,
                                      },
                                    })
                                  }
                                >
                                  <Text
                                    component="span"
                                    className="table-body-left-bold table-link-text"
                                  >
                                    {child.name}
                                  </Text>
                                </button>
                              ) : (
                                <Text className="table-body-left-bold">
                                  {child.name}
                                </Text>
                              )}
                            </Table.Td>
                            <Table.Td>
                              <Text className="table-body-right">
                                {formatCurrencyFromCents(
                                  budgetCents,
                                  child.currency
                                )}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text className="table-body-right">
                                {formatCurrencyFromCents(
                                  actualCents,
                                  child.currency
                                )}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Text className="table-body-right">
                                {uncodedCount}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <Badge
                                variant="light"
                                color={
                                  child.status === 'active' ? 'green' : 'gray'
                                }
                              >
                                {child.status === 'active'
                                  ? 'Active'
                                  : 'Archived'}
                              </Badge>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              ) : (
                <Text c="dimmed">No sub-projects are assigned yet.</Text>
              )}
            </Stack>
          </Paper>
        ) : null}
      </Stack>
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
              {summaryReady ? (
                <Badge
                  size={isMobile ? 'md' : 'lg'}
                  variant="light"
                  color={uncoded.count ? 'red' : 'gray'}
                >
                  Uncoded: {uncoded.count} (
                  {formatCurrencyFromCents(uncoded.amountCents, currencyCode)})
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
          <Tabs.List>
            <Tabs.Tab value="budget">Budget</Tabs.Tab>
            <Tabs.Tab value="transactions">Transactions</Tabs.Tab>
            <Tabs.Tab value="import" disabled={!canImport}>
              Import
            </Tabs.Tab>
            <Tabs.Tab value="settings" disabled={!canProjectEdit}>
              Settings
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="transactions" pt="md">
            <TransactionsPanel
              projectId={projectId}
              txns={txns}
              taxonomy={taxonomy}
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
              transactionDrilldown={effectiveTransactionDrilldown}
              onClearTransactionDrilldown={() => setTransactionDrilldown(null)}
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
              readOnly={!canEditTxns}
            />
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
              uncodedSummary={uncoded}
              isLoading={!summaryReady}
              canEditProjectBudgetTotal={canEditBudgets}
              readOnly={!canEditBudgets}
            />
          </Tabs.Panel>

          <Tabs.Panel value="import" pt="md">
            <Stack gap="md">
              <ImportReviewQueuePanel
                projectId={projectId}
                currencyCode={currencyCode}
                enabled={canImport}
              />
              <PowerBiImporterPanel
                taxonomy={taxonomy}
                budgets={budgets}
                companyId={companyId}
                projectId={projectId}
                currencyCode={currencyCode}
                canEditTaxonomy={canEditTaxonomy}
                canEditBudgets={canEditBudgets}
                canManageImportRules={canManageImportRules}
                onReplaceAll={(next, options) => txns.replaceAll(next, options)}
                onAppend={(next, options) => txns.appendMany(next, options)}
              />
            </Stack>
          </Tabs.Panel>

          <Tabs.Panel value="settings" pt="md">
            <ProjectSettingsPanel companyId={companyId} projectId={projectId} />
          </Tabs.Panel>
        </Tabs>
      </Paper>
    </Stack>
  );
}
