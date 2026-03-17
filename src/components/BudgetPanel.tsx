import { useMemo, useState } from 'react';
import { ActionIcon, Alert, Group, Menu, NumberInput, Paper, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import {
  MantineReactTable,
  type MRT_ColumnDef,
} from 'mantine-react-table';
import { IconCheck, IconColumns, IconPencil, IconX } from '@tabler/icons-react';
import type { RollupsHook } from '../hooks/useRollups';
import type { BudgetsHook } from '../hooks/useBudgets';
import type { ProjectId, RollupRow } from '../types';
import {
  formatMonthLabel,
  parseYearMonth,
  quarterOfMonth,
  sum,
  type Quarter,
} from '../utils/finance';
import { formatCurrencyFromCents, fromCents, toCents } from '../utils/money';
import { LoadingLine } from './LoadingValue';

type BudgetDisplayRow = RollupRow & {
  rowKind: 'category' | 'subcategory';
  rowId: string;
};

type VisibilityState = Record<string, boolean>;

const HEADER_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  justifyContent: 'flex-end',
} as const;

/**
 * Budget rollup table (UI-only).
 *
 * Responsibilities:
 * - Renders category rollup rows plus always-visible subcategory rows.
 * - Keeps time columns aligned via explicit sizing and fixed table layout.
 */
export default function BudgetPanel(props: {
  projectId: ProjectId;
  currencyCode: string;
  projectBudgetTotalCents: number;
  onUpdateProjectBudgetTotal?: (budgetTotalCents: number) => Promise<void>;
  rollups: RollupsHook;
  budgets: BudgetsHook;
  uncodedSummary: { count: number; amountCents: number };
  isLoading?: boolean;
  canEditProjectBudgetTotal?: boolean;
  readOnly?: boolean;
}) {
  const {
    currencyCode,
    projectBudgetTotalCents,
    onUpdateProjectBudgetTotal,
    rollups,
    budgets,
    uncodedSummary,
    isLoading = false,
    canEditProjectBudgetTotal = false,
    readOnly = false,
  } = props;

  const { updateAllocated } = budgets;
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(new Set());
  const [collapsedQuarters, setCollapsedQuarters] = useState<Set<string>>(new Set());
  const [userColumnVisibility, setUserColumnVisibility] = useState<Record<string, boolean>>({});
  const [projectBudgetDraft, setProjectBudgetDraft] = useState<number | ''>('');
  const [isEditingProjectBudget, setIsEditingProjectBudget] = useState(false);

  const projectAllocatedCents = rollups.totals.allocatedCents;
  const projectActualCents = rollups.totals.actualCents;
  const projectRemainingCents = projectBudgetTotalCents - projectAllocatedCents;
  const allocatedVsActualCents = projectAllocatedCents - projectActualCents;
  const projectVsActualCents = projectBudgetTotalCents - projectActualCents;
  const remainingAfterUncodedCents = projectRemainingCents - uncodedSummary.amountCents;
  const allocatedCoveragePct =
    projectBudgetTotalCents > 0
      ? (projectAllocatedCents / projectBudgetTotalCents) * 100
      : 0;
  const actualCoveragePct =
    projectBudgetTotalCents > 0
      ? (projectActualCents / projectBudgetTotalCents) * 100
      : 0;

  async function commitProjectBudgetTotal() {
    if (!onUpdateProjectBudgetTotal) return;
    const nextCents = toCents(Number(projectBudgetDraft === '' ? fromCents(projectBudgetTotalCents) : projectBudgetDraft));
    if (!Number.isFinite(nextCents) || nextCents < 0 || nextCents === projectBudgetTotalCents) {
      setProjectBudgetDraft('');
      setIsEditingProjectBudget(false);
      return;
    }
    await onUpdateProjectBudgetTotal(nextCents);
    setProjectBudgetDraft('');
    setIsEditingProjectBudget(false);
  }

  const columnVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = { ...userColumnVisibility };

    for (const mk of rollups.visibleMonthKeys) {
      const { year, month } = parseYearMonth(mk);
      const quarter = quarterOfMonth(month);
      const quarterKey = `${year}_${quarter}`;
      const isYearCollapsed = collapsedYears.has(year);
      const isQuarterCollapsed = collapsedQuarters.has(quarterKey);

      const quarterId = `qt_${year}_${quarter}`;
      const monthId = `m_${mk}`;

      visibility[quarterId] = (userColumnVisibility[quarterId] ?? true) && !isYearCollapsed;
      visibility[monthId] =
        (userColumnVisibility[monthId] ?? true) &&
        !(isYearCollapsed || isQuarterCollapsed);
    }

    return visibility;
  }, [collapsedQuarters, collapsedYears, rollups.visibleMonthKeys, userColumnVisibility]);

  const displayRows = useMemo<BudgetDisplayRow[]>(() => {
    const grouped = new Map<string, { categoryId: string; categoryName: string; rows: RollupRow[] }>();

    for (const row of rollups.rollupRows) {
      const key = row.categoryId ?? `uncategorized:${row.categoryName.trim()}`;
      const existing = grouped.get(key) ?? {
        categoryId: key,
        categoryName: row.categoryName.trim(),
        rows: [] as RollupRow[],
      };
      existing.rows.push(row);
      grouped.set(key, existing);
    }

    return Array.from(grouped.values()).flatMap(({ categoryId, categoryName, rows }) => {
      const actualByMonthKey = Object.fromEntries(
        rollups.visibleMonthKeys.map((mk) => [
          mk,
          sum(rows.map((row) => row.actualByMonthKey[mk] ?? 0)),
        ])
      );

      const categoryRow: BudgetDisplayRow = {
        ...rows[0],
        id: rows[0].id,
        categoryName,
        subCategoryName: 'Total',
        allocatedCents: sum(rows.map((row) => row.allocatedCents)),
        totalActualCents: sum(rows.map((row) => row.totalActualCents)),
        remainingCents: sum(rows.map((row) => row.remainingCents)),
        actualByMonthKey,
        rowKind: 'category',
        rowId: `category:${categoryId}`,
      };

      const subRows = rows
        .slice()
        .sort((a, b) => a.subCategoryName.localeCompare(b.subCategoryName))
        .map<BudgetDisplayRow>((row) => ({
          ...row,
          rowKind: 'subcategory',
          rowId: `subcategory:${row.id}`,
        }));

      return [categoryRow, ...subRows];
    });
  }, [rollups.rollupRows, rollups.visibleMonthKeys]);

  const timeHierarchy = useMemo(() => {
    const byYear = new Map<number, { quarterIds: string[]; monthIds: string[] }>();
    const byQuarter = new Map<string, { monthIds: string[] }>();

    for (const mk of rollups.visibleMonthKeys) {
      const { year, month } = parseYearMonth(mk);
      const quarter = quarterOfMonth(month);
      const quarterId = `qt_${year}_${quarter}`;
      const monthId = `m_${mk}`;

      const yearEntry = byYear.get(year) ?? { quarterIds: [], monthIds: [] };
      if (!yearEntry.quarterIds.includes(quarterId)) yearEntry.quarterIds.push(quarterId);
      yearEntry.monthIds.push(monthId);
      byYear.set(year, yearEntry);

      const quarterEntry = byQuarter.get(quarterId) ?? { monthIds: [] };
      quarterEntry.monthIds.push(monthId);
      byQuarter.set(quarterId, quarterEntry);
    }

    return { byYear, byQuarter };
  }, [rollups.visibleMonthKeys]);

  function handleColumnVisibilityChange(
    updater: VisibilityState | ((old: VisibilityState) => VisibilityState)
  ) {
    setUserColumnVisibility((current) => {
      const next =
        typeof updater === 'function' ? updater(current) : updater;
      return { ...next };
    });
  }

  function toggleYearVisibility(year: number, visible: boolean) {
    handleColumnVisibilityChange((current) => {
      const next = { ...current };
      const yearId = `yt_${year}`;
      next[yearId] = visible;
      const entry = timeHierarchy.byYear.get(year);
      if (entry) {
        for (const quarterId of entry.quarterIds) next[quarterId] = visible;
        for (const monthId of entry.monthIds) next[monthId] = visible;
      }
      return next;
    });
  }

  function toggleQuarterVisibility(quarterId: string, visible: boolean) {
    handleColumnVisibilityChange((current) => {
      const next = { ...current };
      next[quarterId] = visible;
      const entry = timeHierarchy.byQuarter.get(quarterId);
      if (entry) {
        for (const monthId of entry.monthIds) next[monthId] = visible;
      }
      return next;
    });
  }

  const timeColumns = useMemo<MRT_ColumnDef<BudgetDisplayRow>[]>(() => {
    const years = new Map<number, Map<Quarter, string[]>>();

    for (const mk of rollups.visibleMonthKeys) {
      const { year, month } = parseYearMonth(mk);
      const quarter = quarterOfMonth(month);
      const yearEntry = years.get(year) ?? new Map<Quarter, string[]>();
      const existing = yearEntry.get(quarter) ?? [];
      existing.push(mk);
      yearEntry.set(quarter, existing);
      years.set(year, yearEntry);
    }

    const sumMonths = (row: BudgetDisplayRow, months: string[]) =>
      months.reduce((acc, mk) => acc + (row.actualByMonthKey[mk] ?? 0), 0);

    return Array.from(years.entries())
      .sort(([a], [b]) => a - b)
      .flatMap(([year, quarterMap]) => {
        const yearMonths = Array.from(quarterMap.values()).flat().sort();
        return [
          {
            id: `yt_${year}`,
            header: `${year} Total`,
            size: 128,
            minSize: 128,
            enableHiding: true,
            Header: () => <span style={HEADER_STYLE}>{year} Total</span>,
            accessorFn: (row) => sumMonths(row, yearMonths),
            Cell: ({ cell }) => (
              <Text className="table-body-emphasis">
                {formatCurrencyFromCents(cell.getValue<number>(), currencyCode)}
              </Text>
            ),
            mantineTableHeadCellProps: {
              className: 'table-head-cell table-head-right budgetTable-head',
              title: 'Click to collapse or expand this year',
              onClick: () =>
                setCollapsedYears((current) => {
                  const next = new Set(current);
                  if (next.has(year)) next.delete(year);
                  else next.add(year);
                  return next;
                }),
              style: { cursor: 'pointer' },
            },
            mantineTableBodyCellProps: {
              className: 'table-body-right budgetTable-cell',
            },
          },
          ...(['Q1', 'Q2', 'Q3', 'Q4'] as Quarter[])
            .filter((quarter) => quarterMap.has(quarter))
            .flatMap<MRT_ColumnDef<BudgetDisplayRow>>((quarter) => {
              const months = (quarterMap.get(quarter) ?? []).slice().sort();
              return [
                {
                  id: `qt_${year}_${quarter}`,
                  header: `${quarter} Total`,
                  size: 124,
                  minSize: 124,
                  enableHiding: true,
                  Header: () => <span style={HEADER_STYLE}>{quarter} Total</span>,
                  accessorFn: (row) => sumMonths(row, months),
                  Cell: ({ cell }) => (
                    <Text className="table-body-emphasis">
                      {formatCurrencyFromCents(cell.getValue<number>(), currencyCode)}
                    </Text>
                  ),
                  mantineTableHeadCellProps: {
                    className: 'table-head-cell table-head-right budgetTable-head',
                    title: 'Click to collapse or expand this quarter',
                    onClick: () =>
                      setCollapsedQuarters((current) => {
                        const next = new Set(current);
                        const key = `${year}_${quarter}`;
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      }),
                    style: { cursor: 'pointer' },
                  },
                  mantineTableBodyCellProps: {
                    className: 'table-body-right budgetTable-cell',
                  },
                },
                ...months.map<MRT_ColumnDef<BudgetDisplayRow>>((mk) => ({
                  id: `m_${mk}`,
                  header: formatMonthLabel(mk),
                  size: 112,
                  minSize: 112,
                  enableHiding: false,
                  Header: () => <span style={HEADER_STYLE}>{formatMonthLabel(mk)}</span>,
                  accessorFn: (row) => row.actualByMonthKey[mk] ?? 0,
                  Cell: ({ cell }) => (
                    <Text className="table-body-right">
                      {formatCurrencyFromCents(cell.getValue<number>(), currencyCode)}
                    </Text>
                  ),
                  mantineTableHeadCellProps: {
                    className: 'table-head-cell table-head-right budgetTable-head',
                  },
                  mantineTableBodyCellProps: {
                    className: 'table-body-right budgetTable-cell',
                  },
                })),
              ];
            }),
        ];
      });
  }, [currencyCode, rollups.visibleMonthKeys]);

  const budgetColumns = useMemo<MRT_ColumnDef<BudgetDisplayRow>[]>(() => {
    return [
      {
        accessorKey: 'categoryName',
        header: 'Category',
        size: 112,
        minSize: 96,
        mantineTableHeadCellProps: { className: 'table-head-cell table-head-left budgetTable-head' },
        mantineTableBodyCellProps: { className: 'budgetTable-cell' },
        Cell: ({ row }) => (
          <Text className={row.original.rowKind === 'category' ? 'table-body-left-bold' : 'table-body-left'}>
            {row.original.rowKind === 'category' ? row.original.categoryName : ''}
          </Text>
        ),
      },
      {
        accessorKey: 'subCategoryName',
        header: 'Subcategory',
        size: 156,
        minSize: 136,
        mantineTableHeadCellProps: { className: 'table-head-cell table-head-left budgetTable-head' },
        mantineTableBodyCellProps: { className: 'budgetTable-cell' },
        Cell: ({ row }) => (
          <Text className={row.original.rowKind === 'category' ? 'table-body-left-bold' : 'budgetTable-subcategory'}>
            {row.original.rowKind === 'category' ? '' : row.original.subCategoryName}
          </Text>
        ),
      },
      {
        accessorKey: 'allocatedCents',
        header: 'Allocated',
        accessorFn: (row) => row.allocatedCents,
        size: 132,
        minSize: 120,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-right budgetTable-head',
        },
        mantineTableBodyCellProps: {
          className: 'table-body-right budgetTable-cell',
        },
        Cell: ({ row }) => (
          row.original.rowKind === 'category' ? (
            <Text className="table-body-emphasis">
              {formatCurrencyFromCents(row.original.allocatedCents, currencyCode)}
            </Text>
          ) : (
            <NumberInput
              value={fromCents(row.original.allocatedCents)}
              min={0}
              size="xs"
              thousandSeparator=","
              prefix="$"
              decimalScale={2}
              fixedDecimalScale
              hideControls
              disabled={readOnly}
              classNames={{ input: 'budgetTable-numberInput' }}
              styles={{ input: { textAlign: 'right' } }}
              onChange={(v) =>
                updateAllocated(row.original.id, toCents(Number(v ?? 0)))
              }
            />
          )
        ),
      },
      {
        accessorKey: 'totalActualCents',
        header: 'Actual (Total)',
        size: 132,
        minSize: 120,
        Cell: ({ cell }) => (
          <Text className="table-body-emphasis">
            {formatCurrencyFromCents(cell.getValue<number>(), currencyCode)}
          </Text>
        ),
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-right budgetTable-head',
        },
        mantineTableBodyCellProps: {
          className: 'table-body-right budgetTable-cell',
        },
      },
      {
        id: 'remainingCents',
        header: 'Remaining',
        accessorFn: (row) => row.remainingCents,
        size: 132,
        minSize: 120,
        Cell: ({ cell }) => {
          const v = cell.getValue<number>();
          return (
            <Text className="table-body-emphasis" c={v < 0 ? 'red' : undefined}>
              {formatCurrencyFromCents(v, currencyCode)}
            </Text>
          );
        },
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-right budgetTable-head',
        },
        mantineTableBodyCellProps: {
          className: 'table-body-right budgetTable-cell',
        },
      },
      ...timeColumns,
    ];
  }, [
    currencyCode,
    updateAllocated,
    readOnly,
    timeColumns,
  ]);

  return (
    <Stack gap="md">
      <Paper withBorder radius="md" p="md" className="budgetSummaryCard">
        <Stack gap="xs">
          <Text fw={700} size="sm">
            Project totals
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
            <Paper withBorder radius="md" p="sm" className="budgetMetricCard budgetSummaryPrimary">
              <Stack gap={4}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Total project budget
                </Text>
                {canEditProjectBudgetTotal && isEditingProjectBudget ? (
                  <Group gap="xs" align="center" wrap="nowrap">
                    <NumberInput
                      value={projectBudgetDraft === '' ? fromCents(projectBudgetTotalCents) : projectBudgetDraft}
                      min={0}
                      thousandSeparator=","
                      prefix="$"
                      decimalScale={2}
                      fixedDecimalScale
                      hideControls
                      classNames={{ input: 'budgetSummaryInput' }}
                      styles={{ input: { textAlign: 'right' } }}
                      onChange={(value) => setProjectBudgetDraft(typeof value === 'number' ? value : Number(value ?? 0))}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void commitProjectBudgetTotal();
                        }
                        if (event.key === 'Escape') {
                          setProjectBudgetDraft('');
                          setIsEditingProjectBudget(false);
                        }
                      }}
                    />
                    <ActionIcon
                      variant="light"
                      color="green"
                      aria-label="Save project budget total"
                      onClick={() => {
                        void commitProjectBudgetTotal();
                      }}
                    >
                      <IconCheck size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label="Cancel editing project budget total"
                      onClick={() => {
                        setProjectBudgetDraft('');
                        setIsEditingProjectBudget(false);
                      }}
                    >
                      <IconX size={16} />
                    </ActionIcon>
                  </Group>
                ) : (
                  <Group gap="xs" align="center" wrap="nowrap">
                    <Text fw={800} size="xl">
                      {formatCurrencyFromCents(projectBudgetTotalCents, currencyCode)}
                    </Text>
                    {canEditProjectBudgetTotal ? (
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Edit project budget total"
                        onClick={() => {
                          setProjectBudgetDraft(fromCents(projectBudgetTotalCents));
                          setIsEditingProjectBudget(true);
                        }}
                      >
                        <IconPencil size={16} />
                      </ActionIcon>
                    ) : null}
                  </Group>
                )}
              </Stack>
            </Paper>

            <Paper withBorder radius="md" p="sm" className="budgetMetricCard">
              <Stack gap={4}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Allocated
                </Text>
                <Text fw={800} size="lg">
                  {isLoading ? <LoadingLine width={120} height={28} radius="md" /> : formatCurrencyFromCents(projectAllocatedCents, currencyCode)}
                </Text>
                {isLoading ? (
                  <>
                    <LoadingLine width={150} height={16} />
                    <LoadingLine width={120} height={16} />
                  </>
                ) : (
                  <>
                    <Text size="sm" c={allocatedCoveragePct > 100 ? 'red' : 'dimmed'}>
                      {allocatedCoveragePct.toFixed(1)}% of project budget
                    </Text>
                    <Text size="sm" c={allocatedVsActualCents < 0 ? 'red' : 'dimmed'}>
                      vs actual: {formatCurrencyFromCents(allocatedVsActualCents, currencyCode)}
                    </Text>
                  </>
                )}
              </Stack>
            </Paper>

            <Paper withBorder radius="md" p="sm" className="budgetMetricCard">
              <Stack gap={4}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Actual
                </Text>
                <Text fw={800} size="lg">
                  {isLoading ? <LoadingLine width={120} height={28} radius="md" /> : formatCurrencyFromCents(projectActualCents, currencyCode)}
                </Text>
                {isLoading ? (
                  <>
                    <LoadingLine width={150} height={16} />
                    <LoadingLine width={130} height={16} />
                  </>
                ) : (
                  <>
                    <Text size="sm" c={actualCoveragePct > 100 ? 'red' : 'dimmed'}>
                      {actualCoveragePct.toFixed(1)}% of project budget
                    </Text>
                    <Text size="sm" c={projectVsActualCents < 0 ? 'red' : 'dimmed'}>
                      budget headroom: {formatCurrencyFromCents(projectVsActualCents, currencyCode)}
                    </Text>
                  </>
                )}
              </Stack>
            </Paper>

            <Paper withBorder radius="md" p="sm" className="budgetMetricCard">
              <Stack gap={4}>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  Remaining
                </Text>
                <Text fw={800} size="lg" c={projectRemainingCents < 0 ? 'red' : undefined}>
                  {isLoading ? <LoadingLine width={120} height={28} radius="md" /> : formatCurrencyFromCents(projectRemainingCents, currencyCode)}
                </Text>
                {isLoading ? (
                  <>
                    <LoadingLine width={140} height={16} />
                    <LoadingLine width={135} height={16} />
                  </>
                ) : (
                  <>
                    <Text size="sm" c={remainingAfterUncodedCents < 0 ? 'red' : 'dimmed'}>
                      after uncoded: {formatCurrencyFromCents(remainingAfterUncodedCents, currencyCode)}
                    </Text>
                    <Text size="sm" c="dimmed">
                      uncoded impact: {formatCurrencyFromCents(uncodedSummary.amountCents, currencyCode)}
                    </Text>
                  </>
                )}
              </Stack>
            </Paper>
          </SimpleGrid>

          {projectAllocatedCents > projectBudgetTotalCents ? (
            <Alert color="red" variant="light" radius="md">
              Budget allocations exceed the project budget by{' '}
              {formatCurrencyFromCents(
                projectAllocatedCents - projectBudgetTotalCents,
                currencyCode
              )}
              .
            </Alert>
          ) : null}

        </Stack>
      </Paper>

      <MantineReactTable
        columns={budgetColumns}
        data={displayRows}
        getRowId={(row) => row.rowId}
        state={{ columnVisibility }}
        onColumnVisibilityChange={handleColumnVisibilityChange}
        mantineTableContainerProps={{ className: 'financeTable budgetTable' }}
        renderToolbarInternalActions={() => (
          <Menu withinPortal position="bottom-end" shadow="md">
            <Menu.Target>
              <ActionIcon
                variant="light"
                color="gray"
                aria-label="Show or hide budget columns"
              >
                <IconColumns size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown className="budgetColumnMenu">
              {Array.from(timeHierarchy.byYear.entries())
                .sort(([a], [b]) => a - b)
                .map(([year, entry]) => {
                  const yearId = `yt_${year}`;
                  return (
                    <Stack key={yearId} gap={4} p="xs">
                      <Switch
                        checked={userColumnVisibility[yearId] ?? true}
                        label={`${year} Total`}
                        onChange={(event) =>
                          toggleYearVisibility(year, event.currentTarget.checked)
                        }
                      />
                      {entry.quarterIds.map((quarterId) => (
                        <Switch
                          key={quarterId}
                          checked={userColumnVisibility[quarterId] ?? true}
                          label={quarterId.replace(/^qt_\d+_/, '') + ' Total'}
                          onChange={(event) =>
                            toggleQuarterVisibility(
                              quarterId,
                              event.currentTarget.checked
                            )
                          }
                          ml="lg"
                        />
                      ))}
                      <Menu.Divider />
                    </Stack>
                  );
                })}
            </Menu.Dropdown>
          </Menu>
        )}
        mantineTableBodyRowProps={({ row }) => ({
          className:
            row.original.rowKind === 'category'
              ? 'budgetTable-row budgetTable-row-category'
              : 'budgetTable-row budgetTable-row-subcategory',
        })}
        mantineTableProps={{
          highlightOnHover: false,
          withTableBorder: true,
          style: { tableLayout: 'fixed' },
        }}
        mantineTopToolbarProps={{ className: 'budgetTable-toolbar' }}
        enablePagination={false}
        enableSorting={false}
        enableTopToolbar
        enableDensityToggle={false}
        enableFullScreenToggle={false}
        enableColumnActions={false}
      />
    </Stack>
  );
}
