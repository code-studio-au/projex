import { useMemo, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Badge,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { MantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';

import type { CompanyId, Project } from '../types';
import { formatCurrencyFromCents } from '../utils/money';
import { sum } from '../utils/finance';
import { projectRoute } from '../router';
import { useCompanySummaryQuery } from '../queries/reference';

type QuarterOption = 'Q1' | 'Q2' | 'Q3' | 'Q4';

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

function quarterFromMonthNumber(month: number): QuarterOption {
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
  return quarterFromMonthNumber(Number(monthKey.slice(5, 7))) === quarterFilter;
}

function filteredBudgetCents(
  projectBudgetCents: number,
  args: {
    quarterFilter: QuarterOption | null;
    monthFilterKey: string | null;
  }
) {
  const { quarterFilter, monthFilterKey } = args;
  const visibleMonthCount = monthFilterKey ? 1 : quarterFilter ? 3 : 12;
  return Math.round((projectBudgetCents * visibleMonthCount) / 12);
}

function formatCurrencyGroups(groups: Map<Project['currency'], number>) {
  if (groups.size === 0) return '—';
  return (
    [...groups.entries()]
      .filter(([, amount]) => amount !== 0)
      .map(([currency, amount]) => formatCurrencyFromCents(amount, currency))
      .join(' • ') || '—'
  );
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

function buildProjectDrilldownSearch(args: {
  yearFilter: string | null;
  quarterFilter: QuarterOption | null;
  monthFilterKey: string | null;
  tab?: 'budget' | 'transactions';
  view?: 'all' | 'uncoded' | 'auto-mapped-pending';
  focus?: 'budget' | 'actual' | 'remaining' | 'uncoded' | 'health';
}) {
  return {
    year: args.yearFilter ?? undefined,
    quarter: args.quarterFilter ?? undefined,
    tab: args.tab === 'budget' ? undefined : args.tab,
    month: args.monthFilterKey ?? undefined,
    view: args.view && args.view !== 'all' ? args.view : undefined,
    source: 'company-summary' as const,
    focus: args.focus,
  };
}

function SummaryDrilldownLink(props: {
  companyId: CompanyId;
  projectId: Project['id'];
  yearFilter: string | null;
  quarterFilter: QuarterOption | null;
  monthFilterKey: string | null;
  tab: 'budget' | 'transactions';
  view?: 'all' | 'uncoded' | 'auto-mapped-pending';
  focus?: 'budget' | 'actual' | 'remaining' | 'uncoded' | 'health';
  children: ReactNode;
  color?: string;
}) {
  const {
    companyId,
    projectId,
    yearFilter,
    quarterFilter,
    monthFilterKey,
    tab,
    view,
    focus,
    children,
    color = 'blue.7',
  } = props;
  return (
    <Link
      to={projectRoute.to}
      params={{ companyId, projectId }}
      search={buildProjectDrilldownSearch({
        yearFilter,
        quarterFilter,
        monthFilterKey,
        tab,
        view,
        focus,
      })}
      style={{ textDecoration: 'none' }}
    >
      <Text fw={600} c={color}>
        {children}
      </Text>
    </Link>
  );
}

export default function CompanySummaryPanel(props: {
  companyId: CompanyId;
  isMobile?: boolean;
}) {
  const { companyId, isMobile = false } = props;
  const companySummaryQ = useCompanySummaryQuery(companyId);
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [quarterFilter, setQuarterFilter] = useState<QuarterOption | null>(
    null
  );
  const [monthFilterKey, setMonthFilterKey] = useState<string | null>(null);
  const summaryProjects = useMemo(
    () => companySummaryQ.data?.projects ?? [],
    [companySummaryQ.data]
  );
  const isLoading = companySummaryQ.isLoading;

  const allMonthKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const project of summaryProjects) {
      for (const month of project.months) {
        keys.add(month.monthKey);
      }
    }
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [summaryProjects]);

  const yearFilterOptions = useMemo(() => {
    const years = new Set(allMonthKeys.map((key) => key.slice(0, 4)));
    return [...years]
      .sort((a, b) => b.localeCompare(a))
      .map((value) => ({ value, label: value }));
  }, [allMonthKeys]);

  const quarterFilterOptions = useMemo(() => {
    const filteredMonths = allMonthKeys.filter(
      (key) => !yearFilter || key.startsWith(`${yearFilter}-`)
    );
    const quarters = new Set(
      filteredMonths.map((key) => {
        return quarterFromMonthNumber(Number(key.slice(5, 7)));
      })
    );
    return (['Q1', 'Q2', 'Q3', 'Q4'] as QuarterOption[])
      .filter((quarter) => quarters.has(quarter))
      .map((value) => ({ value, label: value }));
  }, [allMonthKeys, yearFilter]);

  const monthFilterOptions = useMemo(() => {
    return allMonthKeys
      .filter((key) => {
        if (yearFilter && !key.startsWith(`${yearFilter}-`)) return false;
        if (!quarterFilter) return true;
        return (
          quarterFromMonthNumber(Number(key.slice(5, 7))) === quarterFilter
        );
      })
      .map((value) => ({ value, label: value }));
  }, [allMonthKeys, quarterFilter, yearFilter]);

  const rows = useMemo<ProjectSummaryRow[]>(() => {
    return summaryProjects.map((project) => {
      const visibleMonths = project.months.filter((month) =>
        monthKeyMatchesFilters({
          monthKey: month.monthKey,
          yearFilter,
          quarterFilter,
          monthFilterKey,
        })
      );

      const actualCodedCents = sum(
        visibleMonths.map((month) => month.actualCodedCents)
      );
      const uncodedCount = sum(
        visibleMonths.map((month) => month.uncodedCount)
      );
      const uncodedAmountCents = sum(
        visibleMonths.map((month) => month.uncodedAmountCents)
      );
      const budgetCents = filteredBudgetCents(project.budgetCents, {
        quarterFilter,
        monthFilterKey,
      });
      return {
        id: project.id,
        name: project.name,
        status: project.status,
        visibility: project.visibility,
        currency: project.currency,
        budgetCents,
        actualCodedCents,
        remainingCents: budgetCents - actualCodedCents,
        uncodedCount,
        uncodedAmountCents,
        isOverBudget: actualCodedCents > budgetCents,
      };
    });
  }, [monthFilterKey, quarterFilter, summaryProjects, yearFilter]);

  const activeRows = useMemo(
    () => rows.filter((row) => row.status === 'active'),
    [rows]
  );

  const summary = useMemo(
    () => ({
      activeProjects: activeRows.length,
      totalBudget: formatCurrencyGroups(
        totalsByCurrency(activeRows, (row) => row.budgetCents)
      ),
      totalActual: formatCurrencyGroups(
        totalsByCurrency(activeRows, (row) => row.actualCodedCents)
      ),
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
        size: 180,
        Cell: ({ row }) => (
          <SummaryDrilldownLink
            companyId={companyId}
            projectId={row.original.id}
            yearFilter={yearFilter}
            quarterFilter={quarterFilter}
            monthFilterKey={monthFilterKey}
            tab="budget"
            focus="budget"
          >
            {row.original.name}
          </SummaryDrilldownLink>
        ),
      },
      {
        accessorKey: 'budgetCents',
        header: 'Budget',
        size: 110,
        Cell: ({ row }) => (
          <SummaryDrilldownLink
            companyId={companyId}
            projectId={row.original.id}
            yearFilter={yearFilter}
            quarterFilter={quarterFilter}
            monthFilterKey={monthFilterKey}
            tab="budget"
            focus="budget"
          >
            {formatCurrencyFromCents(
              row.original.budgetCents,
              row.original.currency
            )}
          </SummaryDrilldownLink>
        ),
      },
      {
        accessorKey: 'actualCodedCents',
        header: 'Actual',
        size: 110,
        Cell: ({ row }) => (
          <SummaryDrilldownLink
            companyId={companyId}
            projectId={row.original.id}
            yearFilter={yearFilter}
            quarterFilter={quarterFilter}
            monthFilterKey={monthFilterKey}
            tab="transactions"
            focus="actual"
          >
            {formatCurrencyFromCents(
              row.original.actualCodedCents,
              row.original.currency
            )}
          </SummaryDrilldownLink>
        ),
      },
      {
        accessorKey: 'remainingCents',
        header: 'Remaining',
        size: 120,
        Cell: ({ row }) => (
          <SummaryDrilldownLink
            companyId={companyId}
            projectId={row.original.id}
            yearFilter={yearFilter}
            quarterFilter={quarterFilter}
            monthFilterKey={monthFilterKey}
            tab="budget"
            focus="remaining"
            color={row.original.remainingCents < 0 ? 'red.7' : 'blue.7'}
          >
            {formatCurrencyFromCents(
              row.original.remainingCents,
              row.original.currency
            )}
          </SummaryDrilldownLink>
        ),
      },
      {
        accessorKey: 'uncodedCount',
        header: 'Uncoded',
        size: 84,
        Cell: ({ row }) =>
          row.original.uncodedCount > 0 ? (
            <SummaryDrilldownLink
              companyId={companyId}
              projectId={row.original.id}
              yearFilter={yearFilter}
              quarterFilter={quarterFilter}
              monthFilterKey={monthFilterKey}
              tab="transactions"
              view="uncoded"
              focus="uncoded"
              color="yellow.8"
            >
              {row.original.uncodedCount}
            </SummaryDrilldownLink>
          ) : (
            row.original.uncodedCount
          ),
      },
      {
        accessorKey: 'uncodedAmountCents',
        header: 'Uncoded Amt',
        size: 120,
        Cell: ({ row }) =>
          row.original.uncodedAmountCents > 0 ? (
            <SummaryDrilldownLink
              companyId={companyId}
              projectId={row.original.id}
              yearFilter={yearFilter}
              quarterFilter={quarterFilter}
              monthFilterKey={monthFilterKey}
              tab="transactions"
              view="uncoded"
              focus="uncoded"
              color="yellow.8"
            >
              {formatCurrencyFromCents(
                row.original.uncodedAmountCents,
                row.original.currency
              )}
            </SummaryDrilldownLink>
          ) : (
            formatCurrencyFromCents(
              row.original.uncodedAmountCents,
              row.original.currency
            )
          ),
      },
      {
        id: 'flags',
        header: 'Flags',
        size: 116,
        enableSorting: false,
        Cell: ({ row }) => (
          <Stack gap={6}>
            {row.original.isOverBudget ? (
              <Link
                to={projectRoute.to}
                params={{ companyId, projectId: row.original.id }}
                search={buildProjectDrilldownSearch({
                  yearFilter,
                  quarterFilter,
                  monthFilterKey,
                  tab: 'budget',
                  focus: 'health',
                })}
                style={{ textDecoration: 'none', width: 'fit-content' }}
              >
                <Badge variant="light" color="red">
                  Over budget
                </Badge>
              </Link>
            ) : null}
            {row.original.uncodedCount > 0 ? (
              <Link
                to={projectRoute.to}
                params={{ companyId, projectId: row.original.id }}
                search={buildProjectDrilldownSearch({
                  yearFilter,
                  quarterFilter,
                  monthFilterKey,
                  tab: 'transactions',
                  view: 'uncoded',
                  focus: 'uncoded',
                })}
                style={{ textDecoration: 'none', width: 'fit-content' }}
              >
                <Badge variant="light" color="yellow">
                  Has uncoded
                </Badge>
              </Link>
            ) : null}
            {!row.original.isOverBudget && row.original.uncodedCount === 0 ? (
              <Link
                to={projectRoute.to}
                params={{ companyId, projectId: row.original.id }}
                search={buildProjectDrilldownSearch({
                  yearFilter,
                  quarterFilter,
                  monthFilterKey,
                  tab: 'budget',
                  focus: 'health',
                })}
                style={{ textDecoration: 'none', width: 'fit-content' }}
              >
                <Badge variant="light" color="green">
                  Healthy
                </Badge>
              </Link>
            ) : null}
          </Stack>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        size: 96,
        Cell: ({ row }) => (
          <Badge
            variant="light"
            color={row.original.status === 'active' ? 'green' : 'gray'}
          >
            {row.original.status === 'active' ? 'Active' : 'Archived'}
          </Badge>
        ),
      },
      {
        accessorKey: 'visibility',
        header: 'Visible',
        size: 90,
        Cell: ({ row }) =>
          row.original.visibility === 'private' ? (
            <Badge variant="light">Private</Badge>
          ) : (
            <Badge variant="light" color="blue">
              Company
            </Badge>
          ),
      },
    ],
    [companyId, monthFilterKey, quarterFilter, yearFilter]
  );

  return (
    <Stack gap="md">
      <Paper withBorder radius="lg" p="lg">
        <Stack gap="md">
          <Title order={5}>Company summary</Title>
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
                setQuarterFilter((value as QuarterOption | null) ?? null);
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
              Budget, actual, remaining, and uncoded totals reflect the selected
              time filter.
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
          mantineTableContainerProps={{
            className: 'financeTable companySummaryTable',
          }}
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
            pagination: { pageIndex: 0, pageSize: isMobile ? 5 : 7 },
          }}
          mantineTableProps={{
            highlightOnHover: true,
            striped: 'odd',
            withTableBorder: true,
            style: { tableLayout: 'fixed' },
          }}
          mantineTableBodyCellProps={{
            style: { verticalAlign: 'middle' },
          }}
        />
      ) : (
        <Paper withBorder radius="lg" p="lg">
          <Text c="dimmed">
            No accessible projects are available to summarize yet.
          </Text>
        </Paper>
      )}
    </Stack>
  );
}
