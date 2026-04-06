import { useEffect, useMemo, useState } from 'react';
import { Badge, Group, Paper, Stack, Tabs, Title } from '@mantine/core';
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
  initialMonthFilterKey?: string | null;
  initialTransactionView?: 'all' | 'uncoded' | 'auto-mapped-pending';
}) {
  const {
    companyId,
    projectId,
    initialTab = 'budget',
    initialMonthFilterKey = null,
    initialTransactionView = 'all',
  } = props;
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
  const [monthFilterKey, setMonthFilterKey] = useState<string | null>(initialMonthFilterKey);
  const [transactionView, setTransactionView] = useState<'all' | 'uncoded' | 'auto-mapped-pending'>(
    initialTransactionView
  );

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

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
    monthFilterKey,
  });

  const monthFilterOptions = useMemo(
    () =>
      rollups.monthStarts.map((d) => {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const mk = `${y}-${m}`;
        return { value: mk, label: mk };
      }),
    [rollups.monthStarts]
  );

  const uncoded = useMemo(
    () => txns.getUncodedSummary(taxonomy.validSubIds),
    [txns, taxonomy.validSubIds]
  );
  const headerReady = Boolean(company.data && project.data);
  const summaryReady = headerReady && !budgets.isLoading && !txns.isLoading && !taxonomy.isLoading;
  const currencyCode = project.data?.currency ?? 'AUD';

  useEffect(() => {
    void router.navigate({
      to: '/c/$companyId/p/$projectId',
      params: { companyId, projectId },
      search: {
        tab: activeTab === 'budget' ? undefined : activeTab,
        month: monthFilterKey ?? undefined,
        view: transactionView === 'all' ? undefined : transactionView,
      },
      replace: true,
    });
  }, [activeTab, companyId, monthFilterKey, projectId, router, transactionView]);

  return (
    <Stack gap="lg">
      <Paper withBorder p={isMobile ? 'md' : 'lg'} radius="lg">
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
              monthFilterKey={monthFilterKey}
              setMonthFilterKey={setMonthFilterKey}
              monthFilterOptions={monthFilterOptions}
              transactionView={transactionView}
              setTransactionView={setTransactionView}
              canEditTaxonomy={canEditTaxonomy}
              readOnly={!canEditTxns}
            />
          </Tabs.Panel>

          <Tabs.Panel value="budget" pt="md">
            <BudgetPanel
              projectId={projectId}
              currencyCode={currencyCode}
              projectBudgetTotalCents={project.data?.budgetTotalCents ?? 0}
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
              existingTxns={txns.transactions}
              companyId={companyId}
              projectId={projectId}
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
