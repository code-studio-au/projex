import { useMemo, useState } from 'react';
import { Badge, Group, Paper, Stack, Tabs, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

import type { CompanyId, ProjectId } from '../types';

import { useCompanyAccess } from '../hooks/useCompanyAccess';
import { useBudgets } from '../hooks/useBudgets';
import { useTransactions } from '../hooks/useTransactions';
import { useTaxonomy } from '../hooks/useTaxonomy';
import { useRollups } from '../hooks/useRollups';
import { formatCurrencyFromCents } from '../utils/money';

import { useCompanyQuery, useProjectQuery } from '../queries/reference';

import TransactionsPanel from './TransactionsPanel';
import BudgetPanel from './BudgetPanel';
import CsvImporterPanel from './CsvImporterPanel';
import ProjectSettingsPanel from './ProjectSettingsPanel';

export default function ProjectWorkspace(props: {
  companyId: CompanyId;
  projectId: ProjectId;
}) {
  const { companyId, projectId } = props;
  const isMobile = useMediaQuery('(max-width: 48em)');

  const access = useCompanyAccess(companyId);
  const company = useCompanyQuery(companyId);
  const project = useProjectQuery(projectId);

  const canProjectEdit = access.can('project:edit', projectId);
  const canImport = access.can('project:import', projectId);
  const canEditBudgets = access.can('budget:edit', projectId);
  const canEditTxns = access.can('txns:edit', projectId);
  const canEditTaxonomy = access.can('taxonomy:edit', projectId);

  const budgets = useBudgets({ companyId, projectId });
  const txns = useTransactions({ projectId });
  const taxonomy = useTaxonomy({ companyId, projectId, budgets, txns, canEditBudgets });

  const [monthFilterKey, setMonthFilterKey] = useState<string | null>(null);
  const [showUncodedOnly, setShowUncodedOnly] = useState(false);

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

  return (
    <Stack gap="lg">
      <Paper withBorder p={isMobile ? 'md' : 'lg'} radius="lg">
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Stack gap={2}>
            <Title order={3}>
              {company.data?.name ?? 'Company'} • {project.data?.name ?? 'Project'}
            </Title>
            <Text c="dimmed" size="sm">
              Operational workspace for coding, budgeting, imports, and project controls.
            </Text>
          </Stack>

          <Group gap="sm" wrap="wrap">
            <Badge size={isMobile ? 'md' : 'lg'} variant="light" color={uncoded.count ? 'red' : 'gray'}>
              Uncoded: {uncoded.count} ({formatCurrencyFromCents(uncoded.amountCents, project.data?.currency ?? 'AUD')})
            </Badge>
            <Badge size={isMobile ? 'md' : 'lg'} color={project.data?.status === 'archived' ? 'gray' : 'blue'}>
              {project.data?.status === 'archived' ? 'Deactivated' : 'Active'}
            </Badge>
          </Group>
        </Group>
      </Paper>

      <Paper withBorder radius="lg" p="md">
        <Tabs defaultValue="transactions" keepMounted={false} variant="outline">
          <Tabs.List style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
            <Tabs.Tab value="transactions">Transactions</Tabs.Tab>
            <Tabs.Tab value="budget">Budget</Tabs.Tab>
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
              currencyCode={project.data?.currency ?? 'AUD'}
              monthFilterKey={monthFilterKey}
              setMonthFilterKey={setMonthFilterKey}
              monthFilterOptions={monthFilterOptions}
              showUncodedOnly={showUncodedOnly}
              setShowUncodedOnly={setShowUncodedOnly}
              uncodedSummary={uncoded}
              canEditTaxonomy={canEditTaxonomy}
              readOnly={!canEditTxns}
            />
          </Tabs.Panel>

          <Tabs.Panel value="budget" pt="md">
            <BudgetPanel
              projectId={projectId}
              currencyCode={project.data?.currency ?? 'AUD'}
              rollups={rollups}
              budgets={budgets}
              uncodedSummary={uncoded}
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
              onReplaceAll={(next) => txns.replaceAll(next)}
              onAppend={(next) => txns.appendMany(next)}
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
