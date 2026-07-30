import { useMemo, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Button,
  Badge,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  SimpleGrid,
  Title,
} from '@mantine/core';
import {
  MantineReactTable,
  type MRT_ColumnDef,
} from 'mantine-react-table-open';

import type { CompanyId, Project } from '../types';
import { formatCurrencyFromCents } from '../utils/money';
import { sum } from '../utils/finance';
import {
  calculateBudgetPosition,
  type BudgetHealth,
} from '../utils/budgetSemantics';
import { projectRoute } from '../router';
import {
  useCompanySummaryQuery,
  useCompanyWorkQueueQuery,
} from '../queries/reference';
import classes from '../styles/ui.module.css';

type QuarterOption = 'Q1' | 'Q2' | 'Q3' | 'Q4';
const quarterOptions: readonly QuarterOption[] = ['Q1', 'Q2', 'Q3', 'Q4'];

function toQuarterOption(value: string | null): QuarterOption | null {
  if (!value) return null;
  if (value === 'Q1' || value === 'Q2' || value === 'Q3' || value === 'Q4') {
    return value;
  }
  return null;
}

type ProjectSummaryRow = {
  id: Project['id'];
  name: string;
  projectType: Project['projectType'];
  parentProjectId?: Project['id'];
  isChild: boolean;
  status: Project['status'];
  visibility: Project['visibility'];
  currency: Project['currency'];
  budgetCents: number;
  pendingReversalCount: number;
  pendingReversalCents: number;
  uncodedCount: number;
  uncodedExposureCents: number;
  codingApprovalCount: number;
  reversalReviewCount: number;
  unlockRequestCount: number;
  recordedSpendCents: number;
  confirmedHeadroomCents: number;
  health: BudgetHealth;
};

type ProjectWorkflowView =
  | 'uncoded'
  | 'auto-mapped-pending'
  | 'reversal-review'
  | 'unlock-requests';

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

function formatCurrencyGroups(groups: Map<Project['currency'], number>) {
  if (groups.size === 0) return '—';
  return (
    [...groups.entries()]
      .flatMap(([currency, amount]) =>
        amount !== 0 ? [formatCurrencyFromCents(amount, currency)] : []
      )
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
  view?:
    | 'all'
    | 'uncoded'
    | 'needs-review'
    | 'auto-mapped-pending'
    | 'pending-reversal'
    | 'matched-reversal-pairs'
    | 'assigned-to-me';
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
  view?:
    | 'all'
    | 'uncoded'
    | 'needs-review'
    | 'auto-mapped-pending'
    | 'pending-reversal'
    | 'matched-reversal-pairs'
    | 'assigned-to-me';
  focus?: 'budget' | 'actual' | 'remaining' | 'uncoded' | 'health';
  children: ReactNode;
  color?: string;
  className?: string;
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
    color = 'var(--interactive-copy)',
    className = 'table-body-left',
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
      className={classes.plainLink}
    >
      <Text className={className} c={color}>
        {children}
      </Text>
    </Link>
  );
}

function WorkflowBadgeLink(props: {
  companyId: CompanyId;
  projectId: Project['id'];
  view: ProjectWorkflowView;
  count: number;
  singular: string;
  plural: string;
  color: 'blue' | 'orange' | 'red' | 'yellow';
  yearFilter?: string | null;
  quarterFilter?: QuarterOption | null;
  monthFilterKey?: string | null;
}) {
  const label = `${props.count} ${
    props.count === 1 ? props.singular : props.plural
  }`;
  const search =
    props.view === 'uncoded'
      ? buildProjectDrilldownSearch({
          yearFilter: props.yearFilter ?? null,
          quarterFilter: props.quarterFilter ?? null,
          monthFilterKey: props.monthFilterKey ?? null,
          tab: 'transactions',
          view: 'uncoded',
          focus: 'uncoded',
        })
      : {
          tab: 'transactions' as const,
          view: props.view,
          source: 'company-work-queue' as const,
        };
  return (
    <Link
      to={projectRoute.to}
      params={{ companyId: props.companyId, projectId: props.projectId }}
      search={search}
      className={classes.badgeLink}
      aria-label={label}
    >
      <Badge size="sm" variant="light" color={props.color}>
        {label}
      </Badge>
    </Link>
  );
}

export default function CompanySummaryPanel(props: {
  companyId: CompanyId;
  isMobile?: boolean;
}) {
  const { companyId, isMobile = false } = props;
  const companySummaryQ = useCompanySummaryQuery(companyId);
  const companyWorkQueueQ = useCompanyWorkQueueQuery(companyId);
  const [yearFilter, setYearFilter] = useState<string | null>(null);
  const [quarterFilter, setQuarterFilter] = useState<QuarterOption | null>(
    null
  );
  const [monthFilterKey, setMonthFilterKey] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<'all' | 'needs-attention'>(
    'all'
  );
  const summaryProjects = useMemo(
    () => companySummaryQ.data?.projects ?? [],
    [companySummaryQ.data]
  );
  const workQueueByProjectId = useMemo(
    () =>
      new Map(
        (companyWorkQueueQ.data?.projects ?? []).map((project) => [
          project.projectId,
          project,
        ])
      ),
    [companyWorkQueueQ.data]
  );
  const isLoading = companySummaryQ.isLoading || companyWorkQueueQ.isLoading;

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
    return quarterOptions
      .filter((quarter) => quarters.has(quarter))
      .map((value) => ({ value, label: value }));
  }, [allMonthKeys, yearFilter]);

  const monthFilterOptions = useMemo(() => {
    return allMonthKeys.flatMap((value) => {
      if (yearFilter && !value.startsWith(`${yearFilter}-`)) return [];
      if (
        quarterFilter &&
        quarterFromMonthNumber(Number(value.slice(5, 7))) !== quarterFilter
      ) {
        return [];
      }
      return [{ value, label: value }];
    });
  }, [allMonthKeys, quarterFilter, yearFilter]);

  const rows = useMemo<ProjectSummaryRow[]>(() => {
    const toRow = (
      project: (typeof summaryProjects)[number],
      isChild: boolean
    ): ProjectSummaryRow => {
      const visibleMonths = project.months.filter((month) =>
        monthKeyMatchesFilters({
          monthKey: month.monthKey,
          yearFilter,
          quarterFilter,
          monthFilterKey,
        })
      );

      const codedActualCents = sum(
        visibleMonths.map((month) => month.actualCodedCents)
      );
      const pendingReversalCents = sum(
        visibleMonths.map((month) => month.pendingReversalCents)
      );
      const pendingReversalCount = sum(
        visibleMonths.map((month) => month.pendingReversalCount)
      );
      const uncodedCount = sum(
        visibleMonths.map((month) => month.uncodedCount)
      );
      const uncodedExposureCents = sum(
        visibleMonths.map((month) => month.uncodedAmountCents)
      );
      const position = calculateBudgetPosition({
        projectBudgetCents: project.budgetCents,
        codedActualCents,
        uncodedExposureCents,
        uncodedCount,
        pendingReversalCount,
        pendingReversalCents,
      });
      const workflow = workQueueByProjectId.get(project.id);
      return {
        id: project.id,
        name: project.name,
        projectType: project.projectType,
        parentProjectId: project.parentProjectId,
        isChild,
        status: project.status,
        visibility: project.visibility,
        currency: project.currency,
        budgetCents: project.budgetCents,
        pendingReversalCount,
        pendingReversalCents,
        uncodedCount,
        uncodedExposureCents,
        codingApprovalCount: workflow?.codingApprovalCount ?? 0,
        reversalReviewCount: workflow?.reversalReviewCount ?? 0,
        unlockRequestCount: workflow?.unlockRequestCount ?? 0,
        recordedSpendCents: position.recordedSpendCents,
        confirmedHeadroomCents: position.confirmedHeadroomCents,
        health: position.health,
      };
    };

    return summaryProjects.flatMap((project) => [
      toRow(project, false),
      ...(project.children ?? []).map((child) => toRow(child, true)),
    ]);
  }, [
    monthFilterKey,
    quarterFilter,
    summaryProjects,
    workQueueByProjectId,
    yearFilter,
  ]);

  const displayedRows = useMemo(() => {
    if (projectFilter === 'all') return rows;
    const directAttentionIds = new Set(
      rows.flatMap((row) =>
        row.status === 'active' &&
        (row.uncodedCount > 0 ||
          row.codingApprovalCount > 0 ||
          row.reversalReviewCount > 0 ||
          row.unlockRequestCount > 0)
          ? [row.id]
          : []
      )
    );
    const programmeIds = new Set(
      rows.flatMap((row) =>
        row.parentProjectId && directAttentionIds.has(row.id)
          ? [row.parentProjectId]
          : []
      )
    );
    return rows.filter(
      (row) =>
        directAttentionIds.has(row.id) ||
        (row.projectType === 'programme' && programmeIds.has(row.id))
    );
  }, [projectFilter, rows]);

  const activeRows = useMemo(
    () => rows.filter((row) => row.status === 'active' && !row.isChild),
    [rows]
  );

  const summary = useMemo(
    () => ({
      activeProjects: activeRows.length,
      totalBudget: formatCurrencyGroups(
        totalsByCurrency(activeRows, (row) => row.budgetCents)
      ),
      totalRecordedSpend: formatCurrencyGroups(
        totalsByCurrency(activeRows, (row) => row.recordedSpendCents)
      ),
      totalPendingReversal: formatCurrencyGroups(
        totalsByCurrency(activeRows, (row) => row.pendingReversalCents)
      ),
      totalPendingReversalCount: sum(
        activeRows.map((row) => row.pendingReversalCount)
      ),
      totalConfirmedHeadroom: formatCurrencyGroups(
        totalsByCurrency(activeRows, (row) => row.confirmedHeadroomCents)
      ),
      totalUncodedAmount: formatCurrencyGroups(
        totalsByCurrency(activeRows, (row) => row.uncodedExposureCents)
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
          <Stack gap={2} pl={row.original.isChild ? 'md' : 0}>
            <Group gap="xs" wrap="wrap">
              <SummaryDrilldownLink
                companyId={companyId}
                projectId={row.original.id}
                yearFilter={yearFilter}
                quarterFilter={quarterFilter}
                monthFilterKey={monthFilterKey}
                tab="budget"
                focus="budget"
                className="table-body-left-bold table-link-text"
              >
                {row.original.isChild
                  ? `- ${row.original.name}`
                  : row.original.name}
              </SummaryDrilldownLink>
              {row.original.projectType === 'programme' ? (
                <Badge variant="light" color="blue">
                  Programme
                </Badge>
              ) : null}
            </Group>
          </Stack>
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
            className="table-body-right"
          >
            {formatCurrencyFromCents(
              row.original.budgetCents,
              row.original.currency
            )}
          </SummaryDrilldownLink>
        ),
      },
      {
        accessorKey: 'recordedSpendCents',
        header: 'Recorded spend',
        size: 130,
        Cell: ({ row }) => (
          <SummaryDrilldownLink
            companyId={companyId}
            projectId={row.original.id}
            yearFilter={yearFilter}
            quarterFilter={quarterFilter}
            monthFilterKey={monthFilterKey}
            tab="transactions"
            focus="actual"
            className="table-body-right"
          >
            {formatCurrencyFromCents(
              row.original.recordedSpendCents,
              row.original.currency
            )}
          </SummaryDrilldownLink>
        ),
      },
      {
        accessorKey: 'pendingReversalCents',
        header: 'Pending reversal',
        size: 120,
        Cell: ({ row }) =>
          row.original.pendingReversalCount > 0 ? (
            <SummaryDrilldownLink
              companyId={companyId}
              projectId={row.original.id}
              yearFilter={yearFilter}
              quarterFilter={quarterFilter}
              monthFilterKey={monthFilterKey}
              tab="transactions"
              view="pending-reversal"
              focus="actual"
              className="table-body-right"
            >
              {formatCurrencyFromCents(
                row.original.pendingReversalCents,
                row.original.currency
              )}{' '}
              ({row.original.pendingReversalCount})
            </SummaryDrilldownLink>
          ) : (
            <Text className="table-body-right">
              {formatCurrencyFromCents(
                row.original.pendingReversalCents,
                row.original.currency
              )}
            </Text>
          ),
      },
      {
        accessorKey: 'confirmedHeadroomCents',
        header: 'Budget headroom',
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
            color={
              row.original.confirmedHeadroomCents < 0
                ? 'var(--danger-copy)'
                : undefined
            }
            className="table-body-right"
          >
            {formatCurrencyFromCents(
              row.original.confirmedHeadroomCents,
              row.original.currency
            )}
          </SummaryDrilldownLink>
        ),
      },
      {
        accessorKey: 'uncodedExposureCents',
        header: 'Uncoded exposure',
        size: 140,
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
              className="table-body-right"
            >
              {formatCurrencyFromCents(
                row.original.uncodedExposureCents,
                row.original.currency
              )}{' '}
              ({row.original.uncodedCount})
            </SummaryDrilldownLink>
          ) : (
            <Text className="table-body-right">
              {formatCurrencyFromCents(
                row.original.uncodedExposureCents,
                row.original.currency
              )}
            </Text>
          ),
      },
      {
        id: 'actionRequired',
        header: 'Action required',
        size: 210,
        enableSorting: false,
        Cell: ({ row }) => {
          if (
            row.original.projectType === 'programme' ||
            row.original.status !== 'active'
          ) {
            return <Text c="dimmed">—</Text>;
          }
          if (
            companyWorkQueueQ.isError &&
            row.original.projectType === 'project'
          ) {
            return (
              <Text size="sm" c="red">
                Unavailable
              </Text>
            );
          }
          const actionCount =
            row.original.uncodedCount +
            row.original.codingApprovalCount +
            row.original.reversalReviewCount +
            row.original.unlockRequestCount;
          if (actionCount === 0) {
            return (
              <Text size="sm" c="dimmed">
                None
              </Text>
            );
          }
          return (
            <Stack
              gap={4}
              align="flex-start"
              title="Uncoded work follows the selected period. Other workflow actions cover all periods."
            >
              {row.original.uncodedCount > 0 ? (
                <WorkflowBadgeLink
                  companyId={companyId}
                  projectId={row.original.id}
                  view="uncoded"
                  count={row.original.uncodedCount}
                  singular="uncoded transaction"
                  plural="uncoded transactions"
                  color="red"
                  yearFilter={yearFilter}
                  quarterFilter={quarterFilter}
                  monthFilterKey={monthFilterKey}
                />
              ) : null}
              {row.original.codingApprovalCount > 0 ? (
                <WorkflowBadgeLink
                  companyId={companyId}
                  projectId={row.original.id}
                  view="auto-mapped-pending"
                  count={row.original.codingApprovalCount}
                  singular="coding approval"
                  plural="coding approvals"
                  color="yellow"
                />
              ) : null}
              {row.original.reversalReviewCount > 0 ? (
                <WorkflowBadgeLink
                  companyId={companyId}
                  projectId={row.original.id}
                  view="reversal-review"
                  count={row.original.reversalReviewCount}
                  singular="reversal decision"
                  plural="reversal decisions"
                  color="blue"
                />
              ) : null}
              {row.original.unlockRequestCount > 0 ? (
                <WorkflowBadgeLink
                  companyId={companyId}
                  projectId={row.original.id}
                  view="unlock-requests"
                  count={row.original.unlockRequestCount}
                  singular="unlock request"
                  plural="unlock requests"
                  color="orange"
                />
              ) : null}
            </Stack>
          );
        },
      },
      {
        id: 'health',
        header: 'Health',
        size: 150,
        enableSorting: false,
        Cell: ({ row }) => (
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
            className={classes.badgeLink}
            title={row.original.health.reason}
          >
            <Badge variant="light" color={row.original.health.color}>
              {row.original.health.label}
            </Badge>
          </Link>
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
            <Badge variant="light" color="orange">
              Private
            </Badge>
          ) : (
            <Badge variant="light" color="teal">
              Company
            </Badge>
          ),
      },
    ],
    [
      companyId,
      companyWorkQueueQ.isError,
      monthFilterKey,
      quarterFilter,
      yearFilter,
    ]
  );

  return (
    <Stack gap="lg" className={classes.pageStack}>
      <Paper className={classes.filterCard} radius="xl">
        <Stack gap="sm">
          <Group align="flex-end" gap="sm" wrap="wrap">
            <Select
              label="Show"
              data={[
                { value: 'all', label: 'All projects' },
                { value: 'needs-attention', label: 'Needs attention' },
              ]}
              value={projectFilter}
              allowDeselect={false}
              onChange={(value) =>
                setProjectFilter(
                  value === 'needs-attention' ? 'needs-attention' : 'all'
                )
              }
              style={{ width: isMobile ? '100%' : 180 }}
            />
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
              style={{ width: isMobile ? '100%' : 140 }}
            />
            <Select
              label="Quarter"
              placeholder="All quarters"
              data={quarterFilterOptions}
              value={quarterFilter}
              clearable
              disabled={!yearFilter}
              onChange={(value) => {
                setQuarterFilter(toQuarterOption(value));
                setMonthFilterKey(null);
              }}
              style={{ width: isMobile ? '100%' : 150 }}
            />
            <Select
              label="Month"
              placeholder="All months"
              data={monthFilterOptions}
              value={monthFilterKey}
              clearable
              onChange={setMonthFilterKey}
              style={{ width: isMobile ? '100%' : 180 }}
            />
            <Button
              size="sm"
              variant="subtle"
              disabled={!yearFilter && !quarterFilter && !monthFilterKey}
              onClick={() => {
                setYearFilter(null);
                setQuarterFilter(null);
                setMonthFilterKey(null);
              }}
            >
              Remove filter(s)
            </Button>
          </Group>
          {yearFilter || quarterFilter || monthFilterKey ? (
            <Text size="xs" c="dimmed">
              Project budgets remain full-project totals; spend, exposure,
              headroom, health, and uncoded actions reflect the selected period.
              Other workflow actions remain across all periods.
            </Text>
          ) : null}
        </Stack>
      </Paper>

      <SimpleGrid cols={isMobile ? 1 : 3} spacing="md" verticalSpacing="md">
        <Paper className={classes.statCard} withBorder={false}>
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
              Active programmes/projects
            </Text>
            <Title order={3}>{summary.activeProjects}</Title>
          </Stack>
        </Paper>
        <Paper className={classes.statCard} withBorder={false}>
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
              Project budgets
            </Text>
            <Title order={4}>{summary.totalBudget}</Title>
          </Stack>
        </Paper>
        <Paper className={classes.statCard} withBorder={false}>
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
              Recorded spend
            </Text>
            <Title order={4}>{summary.totalRecordedSpend}</Title>
          </Stack>
        </Paper>
        <Paper className={classes.statCard} withBorder={false}>
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
              Budget headroom
            </Text>
            <Title order={4}>{summary.totalConfirmedHeadroom}</Title>
          </Stack>
        </Paper>
        <Paper className={classes.statCard} withBorder={false}>
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
              Uncoded exposure
            </Text>
            <Title order={4}>{summary.totalUncodedAmount}</Title>
            <Text size="sm" c="dimmed">
              {summary.totalUncodedCount} transactions
            </Text>
          </Stack>
        </Paper>
        <Paper className={classes.statCard} withBorder={false}>
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={700}>
              Pending reversals
            </Text>
            <Title order={4}>{summary.totalPendingReversal}</Title>
            <Text size="sm" c="dimmed">
              {summary.totalPendingReversalCount} open workflows
            </Text>
          </Stack>
        </Paper>
      </SimpleGrid>

      {displayedRows.length > 0 ? (
        <div className={classes.tableWrap}>
          <MantineReactTable
            columns={columns}
            data={displayedRows}
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
        </div>
      ) : rows.length > 0 && projectFilter === 'needs-attention' ? (
        <Paper className={classes.surfaceCard} radius="xl" p="lg">
          <Text c="dimmed">No active projects currently need attention.</Text>
        </Paper>
      ) : (
        <Paper className={classes.surfaceCard} radius="xl" p="lg">
          <Text c="dimmed">
            No accessible projects are available to summarize yet.
          </Text>
        </Paper>
      )}
    </Stack>
  );
}
