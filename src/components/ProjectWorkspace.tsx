import { useEffect, useMemo, useState } from 'react';
import { Badge, Group, Paper, Stack, Tabs, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useRouter } from '@tanstack/react-router';

import type { CompanyId, ProjectId } from '../types';

import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { useBudgets } from '../hooks/useBudgets';
import { useTransactions } from '../hooks/useTransactions';
import { useTaxonomy } from '../hooks/useTaxonomy';
import { useRollups } from '../hooks/useRollups';
import { formatCurrencyFromCents } from '../utils/money';

import { useCompanyQuery, useProjectQuery } from '../queries/reference';
import { useUpdateProjectMutation } from '../queries/admin';

import TransactionsPanel from './TransactionsPanel';
import BudgetPanel from './BudgetPanel';
import CsvImporterPanel from './CsvImporterPanel';
import ProjectSettingsPanel from './ProjectSettingsPanel';
import { LoadingChip, LoadingLine } from './LoadingValue';

export default function ProjectWorkspace(props: {
  companyId: CompanyId;
  projectId: ProjectId;
  initialTab?: 'budget' | 'transactions' | 'import' | 'settings';
  initialYearFilter?: string | null;
  initialQuarterFilter?: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null;
  initialMonthFilterKey?: string | null;
  initialTransactionView?: 'all' | 'uncoded' | 'auto-mapped-pending';
  initialEntrySource?: 'company-summary';
  initialEntryFocus?: 'budget' | 'actual' | 'remaining' | 'uncoded' | 'health';
}) {
  const {
    companyId,
    projectId,
    initialTab = 'budget',
    initialYearFilter = null,
    initialQuarterFilter = null,
    initialMonthFilterKey = null,
    initialTransactionView = 'all',
    initialEntrySource,
    initialEntryFocus,
  } = props;
  const derivedInitialYearFilter = initialYearFilter ?? initialMonthFilterKey?.slice(0, 4) ?? null;
  const derivedInitialQuarterFilter =
    initialQuarterFilter ??
    (initialMonthFilterKey
      ? (() => {
          const month = Number(initialMonthFilterKey.slice(5, 7));
          return month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4';
        })()
      : null);
  const isMobile = useMediaQuery('(max-width: 48em)');
  const router = useRouter();

  const access = useCompanyAccess(companyId);
  const company = useCompanyQuery(companyId);
  const project = useProjectQuery(projectId);
  const updateProject = useUpdateProjectMutation(companyId);

  const canProjectEdit = access.can('project:edit', projectId);
  const canImport = access.can('project:import', projectId);
  const canEditBudgets = access.can('budget:edit', projectId);
  const canEditTxns = access.can('txns:edit', projectId);
  const canEditTaxonomy = access.can('taxonomy:edit', projectId);

  const budgets = useBudgets({ companyId, projectId });
  const txns = useTransactions({ projectId });
  const taxonomy = useTaxonomy({ companyId, projectId, budgets, txns, canEditBudgets });

  const [activeTab, setActiveTab] = useState<'budget' | 'transactions' | 'import' | 'settings'>(
    initialTab
  );
  const [yearFilter, setYearFilter] = useState<string | null>(derivedInitialYearFilter);
  const [quarterFilter, setQuarterFilter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4' | null>(
    derivedInitialQuarterFilter
  );
  const [monthFilterKey, setMonthFilterKey] = useState<string | null>(initialMonthFilterKey);
  const [transactionView, setTransactionView] = useState<'all' | 'uncoded' | 'auto-mapped-pending'>(
    initialTransactionView
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setYearFilter(derivedInitialYearFilter);
  }, [derivedInitialYearFilter]);

  useEffect(() => {
    setQuarterFilter(derivedInitialQuarterFilter);
  }, [derivedInitialQuarterFilter]);

  useEffect(() => {
    setMonthFilterKey(initialMonthFilterKey);
  }, [initialMonthFilterKey]);

  useEffect(() => {
    setTransactionView(initialTransactionView);
  }, [initialTransactionView]);

  const rollups = useRollups({
    transactions: txns.transactions,
    budgets: budgets.budgets,
    taxonomy,
    yearFilter,
    quarterFilter,
    monthFilterKey,
  });

  const allMonthKeys = useMemo(
    () =>
      rollups.monthStarts.map((date) => {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
      }),
    [rollups.monthStarts]
  );

  const yearFilterOptions = useMemo(() => {
    const years = new Set(allMonthKeys.map((key) => key.slice(0, 4)));
    return [...years]
      .sort((a, b) => b.localeCompare(a))
      .map((value) => ({ value, label: value }));
  }, [allMonthKeys]);

  const quarterFilterOptions = useMemo(() => {
    if (!yearFilter) return [];
    const filteredMonths = allMonthKeys.filter((key) => key.startsWith(`${yearFilter}-`));
    const quarters = new Set(
      filteredMonths.map((key) => {
        const month = Number(key.slice(5, 7));
        return month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4';
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
          const month = Number(key.slice(5, 7));
          const quarter = month <= 3 ? 'Q1' : month <= 6 ? 'Q2' : month <= 9 ? 'Q3' : 'Q4';
          return quarter === quarterFilter;
        })
        .map((value) => ({ value, label: value })),
    [allMonthKeys, quarterFilter, yearFilter]
  );

  const uncoded = useMemo(
    () => txns.getUncodedSummary(taxonomy.validSubIds),
    [txns, taxonomy.validSubIds]
  );
  const headerReady = Boolean(company.data && project.data);
  const summaryReady = headerReady && !budgets.isLoading && !txns.isLoading && !taxonomy.isLoading;
  const currencyCode = project.data?.currency ?? 'AUD';
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
      },
      replace: true,
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
    transactionView,
  ]);

  return (
    <Stack gap="lg">
      <Paper withBorder p={isMobile ? 'md' : 'lg'} radius="lg">
        <Stack gap="sm">
          <Group justify="space-between" align="center" wrap="wrap">
            {headerReady ? (
              <Title order={3}>
                {company.data?.name} • {project.data?.name}
              </Title>
            ) : (
              <LoadingLine width={320} height={30} radius="md" />
            )}

            <Group gap="sm" wrap="wrap">
              {headerReady && project.data?.allowSuperadminAccess ? (
                <Badge size={isMobile ? 'md' : 'lg'} variant="light" color="teal">
                  Superadmin access enabled
                </Badge>
              ) : null}
              {summaryReady ? (
                <Badge size={isMobile ? 'md' : 'lg'} variant="light" color={uncoded.count ? 'red' : 'gray'}>
                  Uncoded: {uncoded.count} ({formatCurrencyFromCents(uncoded.amountCents, currencyCode)})
                </Badge>
              ) : (
                <LoadingChip width={190} height={30} />
              )}
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

      <Paper withBorder radius="lg" p="md">
        <Tabs
          value={activeTab}
          onChange={(value) =>
            setActiveTab((value as 'budget' | 'transactions' | 'import' | 'settings') ?? 'budget')
          }
          keepMounted={false}
          variant="outline"
        >
          <Tabs.List style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
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
                    view: transactionView === 'all' ? undefined : transactionView,
                    source: undefined,
                    focus: undefined,
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
              projectBudgetTotalCents={project.data?.budgetTotalCents ?? 0}
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
                    view: transactionView === 'all' ? undefined : transactionView,
                    source: undefined,
                    focus: undefined,
                  },
                  replace: true,
                });
              }}
              onUpdateProjectBudgetTotal={async (budgetTotalCents) => {
                await updateProject.mutateAsync({ id: projectId, budgetTotalCents });
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
            <CsvImporterPanel
              taxonomy={taxonomy}
              budgets={budgets}
              companyId={companyId}
              projectId={projectId}
              currencyCode={currencyCode}
              canEditTaxonomy={canEditTaxonomy}
              canEditBudgets={canEditBudgets}
              onReplaceAll={(next, options) => txns.replaceAll(next, options)}
              onAppend={(next, options) => txns.appendMany(next, options)}
            />
          </Tabs.Panel>

          <Tabs.Panel value="settings" pt="md">
            <ProjectSettingsPanel companyId={companyId} projectId={projectId} />
          </Tabs.Panel>
        </Tabs>
      </Paper>
    </Stack>
  );
}
