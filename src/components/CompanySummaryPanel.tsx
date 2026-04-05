import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  Badge,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  MantineReactTable,
  type MRT_ColumnDef,
} from 'mantine-react-table';

import type { BudgetLine, Project, SubCategory, Txn } from '../types';
import { useApi } from '../hooks/useApi';
import { useQueryScopeUserId } from '../queries/scope';
import { qk } from '../queries/keys';
import { formatCurrencyFromCents } from '../utils/money';
import { monthKeyFromStart, monthStart, parseISODate, sum } from '../utils/finance';

type ProjectSummaryRow = {
  id: Project['id'];
  name: string;
  status: Project['status'];
  visibility: Project['visibility'];
  currency: Project['currency'];
  budgetCents: number;
  actualCodedCents: number;
  remainingCents: number;
  uncodedCount: number;
  uncodedAmountCents: number;
  isOverBudget: boolean;
};

function formatCurrencyGroups(groups: Map<Project['currency'], number>) {
  if (groups.size === 0) return '—';
  return [...groups.entries()]
    .filter(([, amount]) => amount !== 0)
    .map(([currency, amount]) => formatCurrencyFromCents(amount, currency))
    .join(' • ') || '—';
}

function totalsByCurrency(
  rows: ProjectSummaryRow[],
  pick: (row: ProjectSummaryRow) => number
) {
  const totals = new Map<Project['currency'], number>();
  for (const row of rows) {
    totals.set(row.currency, (totals.get(row.currency) ?? 0) + pick(row));
  }
  return totals;
}

export default function CompanySummaryPanel(props: {
  projects: Project[];
  isMobile?: boolean;
}) {
  const { projects, isMobile = false } = props;
  const api = useApi();
  const scopeUserId = useQueryScopeUserId();
  const [monthFilterKey, setMonthFilterKey] = useState<string | null>(null);

  const projectDataQueries = useQueries({
    queries: projects.flatMap((project) => [
      {
        queryKey: qk.transactions(scopeUserId, project.id),
        queryFn: () => api.listTransactions(project.id),
      },
      {
        queryKey: qk.budgets(scopeUserId, project.id),
        queryFn: () => api.listBudgets(project.id),
      },
      {
        queryKey: qk.subCategories(scopeUserId, project.id),
        queryFn: () => api.listSubCategories(project.id),
      },
    ]),
  });

  const isLoading = projectDataQueries.some((query) => query.isLoading);

  const monthFilterOptions = useMemo(() => {
    const keys = new Set<string>();
    for (let index = 0; index < projects.length; index += 1) {
      const transactions = (projectDataQueries[index * 3]?.data as Txn[] | undefined) ?? [];
      for (const txn of transactions) {
        try {
          keys.add(monthKeyFromStart(monthStart(parseISODate(txn.date))));
        } catch {
          // Ignore invalid dates in the month filter options.
        }
      }
    }
    return [...keys]
      .sort((a, b) => b.localeCompare(a))
      .map((value) => ({ value, label: value }));
  }, [projectDataQueries, projects.length]);

  const rows = useMemo<ProjectSummaryRow[]>(() => {
    return projects.map((project, index) => {
      const transactions = (projectDataQueries[index * 3]?.data as Txn[] | undefined) ?? [];
      const budgets = (projectDataQueries[index * 3 + 1]?.data as BudgetLine[] | undefined) ?? [];
      const subCategories =
        (projectDataQueries[index * 3 + 2]?.data as SubCategory[] | undefined) ?? [];
      const validSubIds = new Set(subCategories.map((subCategory) => subCategory.id));
      const visibleTransactions = transactions.filter((txn) => {
        if (!monthFilterKey) return true;
        try {
          return monthKeyFromStart(monthStart(parseISODate(txn.date))) === monthFilterKey;
        } catch {
          return false;
        }
      });
      const codedTransactions = visibleTransactions.filter(
        (txn) => txn.subCategoryId && validSubIds.has(txn.subCategoryId)
      );
      const uncodedTransactions = visibleTransactions.filter(
        (txn) => !txn.subCategoryId || !validSubIds.has(txn.subCategoryId)
      );

      const budgetCents = sum(budgets.map((budget) => budget.allocatedCents));
      const actualCodedCents = sum(
        codedTransactions.map((txn) => Math.abs(txn.amountCents ?? 0))
      );
      const uncodedAmountCents = sum(
        uncodedTransactions.map((txn) => Math.abs(txn.amountCents ?? 0))
      );

      return {
        id: project.id,
        name: project.name,
        status: project.status,
        visibility: project.visibility,
        currency: project.currency,
        budgetCents,
        actualCodedCents,
        remainingCents: budgetCents - actualCodedCents,
        uncodedCount: uncodedTransactions.length,
        uncodedAmountCents,
        isOverBudget: actualCodedCents > budgetCents,
      };
    });
  }, [monthFilterKey, projectDataQueries, projects]);

  const activeRows = useMemo(
    () => rows.filter((row) => row.status === 'active'),
    [rows]
  );

  const summary = useMemo(
    () => ({
      activeProjects: activeRows.length,
      totalBudget: formatCurrencyGroups(totalsByCurrency(activeRows, (row) => row.budgetCents)),
      totalActual: formatCurrencyGroups(totalsByCurrency(activeRows, (row) => row.actualCodedCents)),
      totalRemaining: formatCurrencyGroups(
        totalsByCurrency(activeRows, (row) => row.remainingCents)
      ),
      totalUncodedAmount: formatCurrencyGroups(
        totalsByCurrency(activeRows, (row) => row.uncodedAmountCents)
      ),
      totalUncodedCount: sum(activeRows.map((row) => row.uncodedCount)),
    }),
    [activeRows]
  );

  const columns = useMemo<MRT_ColumnDef<ProjectSummaryRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Project',
      },
      {
        accessorKey: 'status',
        header: 'Status',
        Cell: ({ row }) => (
          <Badge variant="light" color={row.original.status === 'active' ? 'green' : 'gray'}>
            {row.original.status === 'active' ? 'Active' : 'Archived'}
          </Badge>
        ),
      },
      {
        accessorKey: 'visibility',
        header: 'Visibility',
        Cell: ({ row }) =>
          row.original.visibility === 'private' ? (
            <Badge variant="light">Private</Badge>
          ) : (
            <Badge variant="light" color="blue">
              Company
            </Badge>
          ),
      },
      {
        id: 'flags',
        header: 'Flags',
        enableSorting: false,
        Cell: ({ row }) => (
          <Stack gap={6}>
            {row.original.isOverBudget ? (
              <Badge variant="light" color="red">
                Over budget
              </Badge>
            ) : null}
            {row.original.uncodedCount > 0 ? (
              <Badge variant="light" color="yellow">
                Has uncoded
              </Badge>
            ) : null}
            {!row.original.isOverBudget && row.original.uncodedCount === 0 ? (
              <Badge variant="light" color="green">
                Healthy
              </Badge>
            ) : null}
          </Stack>
        ),
      },
      {
        accessorKey: 'budgetCents',
        header: 'Budget',
        Cell: ({ row }) => formatCurrencyFromCents(row.original.budgetCents, row.original.currency),
      },
      {
        accessorKey: 'actualCodedCents',
        header: 'Actual',
        Cell: ({ row }) =>
          formatCurrencyFromCents(row.original.actualCodedCents, row.original.currency),
      },
      {
        accessorKey: 'remainingCents',
        header: 'Remaining',
        Cell: ({ row }) =>
          formatCurrencyFromCents(row.original.remainingCents, row.original.currency),
      },
      {
        accessorKey: 'uncodedCount',
        header: 'Uncoded Txns',
      },
      {
        accessorKey: 'uncodedAmountCents',
        header: 'Uncoded Amount',
        Cell: ({ row }) =>
          formatCurrencyFromCents(row.original.uncodedAmountCents, row.original.currency),
      },
    ],
    []
  );

  return (
    <Stack gap="md">
      <Paper withBorder radius="lg" p="lg">
        <Stack gap="md">
          <Stack gap="xs">
            <Title order={5}>Company summary</Title>
            <Text size="sm" c="dimmed">
              Roll-up view across the projects you can currently access in this company.
            </Text>
          </Stack>
          <Select
            label="Month"
            placeholder="All months"
            data={monthFilterOptions}
            value={monthFilterKey}
            clearable
            onChange={setMonthFilterKey}
            style={{ width: isMobile ? '100%' : 220 }}
          />
          {monthFilterKey ? (
            <Text size="xs" c="dimmed">
              Actual, remaining, and uncoded totals reflect {monthFilterKey}. Budget totals remain full project budgets.
            </Text>
          ) : null}
        </Stack>
      </Paper>

      <SimpleGrid cols={isMobile ? 1 : 3} spacing="md" verticalSpacing="md">
        <Paper withBorder radius="lg" p="lg">
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
              Active projects
            </Text>
            <Title order={3}>{summary.activeProjects}</Title>
          </Stack>
        </Paper>
        <Paper withBorder radius="lg" p="lg">
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
              Total budget
            </Text>
            <Title order={4}>{summary.totalBudget}</Title>
          </Stack>
        </Paper>
        <Paper withBorder radius="lg" p="lg">
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
              Total actual
            </Text>
            <Title order={4}>{summary.totalActual}</Title>
          </Stack>
        </Paper>
        <Paper withBorder radius="lg" p="lg">
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
              Remaining
            </Text>
            <Title order={4}>{summary.totalRemaining}</Title>
          </Stack>
        </Paper>
        <Paper withBorder radius="lg" p="lg">
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
              Uncoded transactions
            </Text>
            <Title order={3}>{summary.totalUncodedCount}</Title>
          </Stack>
        </Paper>
        <Paper withBorder radius="lg" p="lg">
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
              Uncoded amount
            </Text>
            <Title order={4}>{summary.totalUncodedAmount}</Title>
          </Stack>
        </Paper>
      </SimpleGrid>

      {rows.length > 0 ? (
        <MantineReactTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          mantineTableContainerProps={{ className: 'financeTable' }}
          enableColumnActions={false}
          enableColumnFilters={false}
          enableDensityToggle={false}
          enableFullScreenToggle={false}
          enableTopToolbar={false}
          enablePagination
          enableSorting
          state={{ isLoading }}
          initialState={{
            density: 'xs',
            pagination: { pageIndex: 0, pageSize: isMobile ? 5 : 8 },
          }}
          mantineTableProps={{ highlightOnHover: true, striped: 'odd', withTableBorder: true }}
        />
      ) : (
        <Paper withBorder radius="lg" p="lg">
          <Text c="dimmed">No accessible projects are available to summarize yet.</Text>
        </Paper>
      )}
    </Stack>
  );
}
