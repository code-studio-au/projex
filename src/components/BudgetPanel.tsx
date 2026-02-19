import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Group, NumberInput, Stack, Text, Title } from '@mantine/core';
import { MantineReactTable, type MRT_ColumnDef } from 'mantine-react-table';
import type { RollupsHook } from '../hooks/useRollups';
import type { BudgetsHook } from '../hooks/useBudgets';
import {
  loadBudgetCollapseState,
  saveBudgetCollapseState,
} from '../store/uiPrefs';
import type { ProjectId, RollupRow } from '../types';
import {
  currency,
  parseYearMonth,
  quarterKey,
  quarterOfMonth,
  formatMonthLabel,
  sum,
  type Quarter,
} from '../utils/finance';

/**
 * Budget rollup table.
 *
 * This component is intentionally "UI-only":
 * - It renders the time-series table (Year -> Quarter -> Month).
 * - It owns column visibility/collapse UX.
 *
 * The heavy lifting (computing rollup rows and month keys) lives in `useRollups`.
 * That separation makes it straightforward to migrate rollup computation server-side
 * later (TanStack Start/server functions/DB queries) without rewriting the table.
 */

export default function BudgetPanel(props: {
  projectId: ProjectId;
  rollups: RollupsHook;
  budgets: BudgetsHook;
  uncodedSummary: { count: number; amount: number };
  readOnly?: boolean;
}) {
  const {
    projectId,
    rollups,
    budgets,
    uncodedSummary,
    readOnly = false,
  } = props;

  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(
    () => new Set()
  );
  const [collapsedQuarters, setCollapsedQuarters] = useState<Set<string>>(
    () => new Set()
  );

  const [collapseHydrated, setCollapseHydrated] = useState(false);
  const [hasSavedCollapseState, setHasSavedCollapseState] = useState(false);

  // Persisted collapse state is scoped per project.
  useEffect(() => {
    const saved = loadBudgetCollapseState(projectId);
    if (saved) {
      setCollapsedYears(
        new Set(
          Object.keys(saved.collapsedYears)
            .map((y) => Number(y))
            .filter((y) => Number.isFinite(y))
        )
      );
      setCollapsedQuarters(new Set(Object.keys(saved.collapsedQuarters)));
      setHasSavedCollapseState(true);
    } else {
      setHasSavedCollapseState(false);
      setCollapsedYears(new Set());
      setCollapsedQuarters(new Set());
    }
    setCollapseHydrated(true);
  }, [projectId]);

  // Default collapse behavior (only when there is no saved state).
  // NOTE: The budget table's entire time dimension is derived from rollups.visibleMonthKeys.
  // If visibleMonthKeys is empty, the table will have no year/quarter/month columns.
  useEffect(() => {
    if (!collapseHydrated) return;
    if (hasSavedCollapseState) return;
    if (!rollups.visibleMonthKeys.length) return;

    // Default: collapse other years; keep current quarter open for current year
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentQuarter = quarterOfMonth(now.getMonth() + 1);

    const yearsInData = Array.from(
      new Set(rollups.visibleMonthKeys.map((mk) => parseYearMonth(mk).year))
    ).sort((a, b) => a - b);

    setCollapsedYears(new Set(yearsInData.filter((y) => y !== currentYear)));

    const nextCollapsedQuarters = new Set<string>();
    for (const mk of rollups.visibleMonthKeys) {
      const { year, month } = parseYearMonth(mk);
      const q = quarterOfMonth(month);
      const qk = quarterKey(year, q);
      if (!(year === currentYear && q === currentQuarter))
        nextCollapsedQuarters.add(qk);
    }
    setCollapsedQuarters(nextCollapsedQuarters);
  }, [collapseHydrated, hasSavedCollapseState, rollups.visibleMonthKeys]);

  // Prune collapse state when the data range changes (and persist).
  useEffect(() => {
    if (!collapseHydrated) return;
    if (!rollups.visibleMonthKeys.length) return;

    const yearsInData = new Set<number>(
      rollups.visibleMonthKeys.map((mk) => parseYearMonth(mk).year)
    );
    const quartersInData = new Set<string>(
      rollups.visibleMonthKeys.map((mk) => {
        const { year, month } = parseYearMonth(mk);
        return quarterKey(year, quarterOfMonth(month));
      })
    );

    setCollapsedYears((prev) => {
      const next = new Set<number>();
      for (const y of prev) if (yearsInData.has(y)) next.add(y);
      return next;
    });

    setCollapsedQuarters((prev) => {
      const next = new Set<string>();
      for (const qk of prev) if (quartersInData.has(qk)) next.add(qk);
      return next;
    });
  }, [collapseHydrated, rollups.visibleMonthKeys]);

  // Persist collapse state per project so returning to a project keeps the same view.
  useEffect(() => {
    if (!collapseHydrated) return;
    saveBudgetCollapseState(projectId, {
      collapsedYears: Object.fromEntries(
        Array.from(collapsedYears.values()).map((y) => [String(y), true])
      ),
      collapsedQuarters: Object.fromEntries(
        Array.from(collapsedQuarters.values()).map((qk) => [qk, true])
      ),
    });
  }, [collapseHydrated, projectId, collapsedYears, collapsedQuarters]);

  const columnVisibility = useMemo(() => {
    const vis: Record<string, boolean> = {};
    for (const mk of rollups.visibleMonthKeys) {
      const { year, month } = parseYearMonth(mk);
      const q = quarterOfMonth(month);
      const qk = quarterKey(year, q);

      const yearCollapsed = collapsedYears.has(year);
      const quarterCollapsed = collapsedQuarters.has(qk);

      vis[`m_${mk}`] = !(yearCollapsed || quarterCollapsed);
      vis[`qt_${year}_${q}`] = !yearCollapsed;
      vis[`yt_${year}`] = true;
    }
    return vis;
  }, [rollups.visibleMonthKeys, collapsedYears, collapsedQuarters]);

  const budgetColumns = useMemo<
    MRT_ColumnDef<(typeof rollups.rollupRows)[number]>[]
  >(() => {
    // Time columns (Year -> Quarter -> Months) are derived here.
    // Invariant: rollups.visibleMonthKeys must be non-empty for the table to have a time dimension.

    // build year->quarter->months
    const years = new Map<number, Map<Quarter, string[]>>();
    for (const mk of rollups.visibleMonthKeys) {
      const { year, month } = parseYearMonth(mk);
      const q = quarterOfMonth(month);
      if (!years.has(year)) years.set(year, new Map());
      const qm = years.get(year)!;
      if (!qm.has(q)) qm.set(q, []);
      qm.get(q)!.push(mk);
    }
    for (const [, qm] of years)
      for (const [q, arr] of qm) qm.set(q, [...arr].sort());

    const sumQuarter = (row: RollupRow, months: string[]) =>
      months.reduce((acc, mk) => acc + (row.actualByMonthKey[mk] ?? 0), 0);
    const sumYear = (row: RollupRow, months: string[]) =>
      months.reduce((acc, mk) => acc + (row.actualByMonthKey[mk] ?? 0), 0);

    const yearGroups: MRT_ColumnDef<RollupRow>[] = Array.from(years.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, quarterMap]) => {
        const yearMonthKeys = Array.from(quarterMap.values()).flat();
        const isYearCollapsed = collapsedYears.has(year);

        const yearHeader = (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              justifyContent: 'flex-end',
            }}
          >
            <span>{year} Total</span>
            <span aria-hidden style={{ fontSize: 12, opacity: 0.85 }}>
              {isYearCollapsed ? '▸' : '▾'}
            </span>
          </span>
        );

        const yearTotalCol: MRT_ColumnDef<RollupRow> = {
          id: `yt_${year}`,
          header: yearHeader,
          size: 140,
          accessorFn: (row) => sumYear(row, yearMonthKeys),
          Cell: ({ cell }) => (
            <Text className="table-body-right-bold">
              {currency(cell.getValue<number>())}
            </Text>
          ),
          aggregationFn: 'sum',
          AggregatedCell: ({ cell }) => (
            <Text className="table-body-right-bold">
              {currency(cell.getValue<number>())}
            </Text>
          ),
          mantineTableHeadCellProps: {
            className: 'table-head-cell table-head-right-bold',
            onClick: (e) => {
              e.stopPropagation();
              setCollapsedYears((prev) => {
                const next = new Set(prev);
                next.has(year) ? next.delete(year) : next.add(year);
                return next;
              });
            },
            title: 'Click to collapse/expand year',
            style: { cursor: 'pointer', userSelect: 'none' },
          },
          mantineTableBodyCellProps: { className: 'table-body-right' },
        };

        const quarterGroups: MRT_ColumnDef<RollupRow>[] = (
          ['Q1', 'Q2', 'Q3', 'Q4'] as Quarter[]
        )
          .filter((q) => quarterMap.has(q))
          .map((q) => {
            const months = quarterMap.get(q)!;
            const qk = quarterKey(year, q);
            const isQuarterCollapsed = collapsedQuarters.has(qk);

            const quarterHeader = (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  justifyContent: 'flex-end',
                }}
              >
                <span>{q} Total</span>
                <span aria-hidden style={{ fontSize: 12, opacity: 0.85 }}>
                  {isQuarterCollapsed ? '▸' : '▾'}
                </span>
              </span>
            );

            const qTotalCol: MRT_ColumnDef<RollupRow> = {
              id: `qt_${year}_${q}`,
              header: quarterHeader,
              size: 130,
              accessorFn: (row) => sumQuarter(row, months),
              Cell: ({ cell }) => (
                <Text className="table-body-right-bold">
                  {currency(cell.getValue<number>())}
                </Text>
              ),
              aggregationFn: 'sum',
              AggregatedCell: ({ cell }) => (
                <Text className="table-body-right-bold">
                  {currency(cell.getValue<number>())}
                </Text>
              ),
              mantineTableHeadCellProps: {
                className: 'table-head-cell table-head-right-bold',
                onClick: (e) => {
                  e.stopPropagation();
                  setCollapsedQuarters((prev) => {
                    const next = new Set(prev);
                    next.has(qk) ? next.delete(qk) : next.add(qk);
                    return next;
                  });
                },
                title: 'Click to collapse/expand quarter months',
                style: { cursor: 'pointer', userSelect: 'none' },
              },
              mantineTableBodyCellProps: { className: 'table-body-right' },
            };

            const monthCols: MRT_ColumnDef<RollupRow>[] = months.map((mk) => ({
              id: `m_${mk}`,
              header: formatMonthLabel(mk),
              size: 110,
              accessorFn: (row) => row.actualByMonthKey[mk] ?? 0,
              Cell: ({ cell }) => (
                <Text className="table-body-right">
                  {currency(cell.getValue<number>())}
                </Text>
              ),
              aggregationFn: 'sum',
              AggregatedCell: ({ cell }) => (
                <Text className="table-body-right-bold">
                  {currency(cell.getValue<number>())}
                </Text>
              ),
              mantineTableHeadCellProps: {
                className: 'table-head-cell table-head-right',
              },
              mantineTableBodyCellProps: { className: 'table-body-right' },
            }));

            return {
              id: `qgrp_${year}_${q}`,
              header: q,
              columns: [qTotalCol, ...monthCols],
            };
          });

        return {
          id: `ygrp_${year}`,
          header: String(year),
          columns: [yearTotalCol, ...quarterGroups],
        };
      });

    return [
      {
        accessorKey: 'categoryName',
        header: 'Category',
        enableGrouping: true,
        size: 220,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left-bold',
        },
        mantineTableBodyCellProps: { className: 'table-body-left-bold' },
      },
      {
        accessorKey: 'subCategoryName',
        header: 'Subcategory',
        size: 260,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left',
        },
        mantineTableBodyCellProps: { className: 'table-body-left' },
      },
      {
        id: 'allocated',
        header: 'Allocated',
        size: 120,
        accessorFn: (row) => row.allocated,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-right',
        },
        mantineTableBodyCellProps: { className: 'table-body-right' },
        Cell: ({ row }) => (
          <NumberInput
            value={row.original.allocated}
            min={0}
            size="xs"
            thousandSeparator=","
            prefix="$"
            decimalScale={2}
            fixedDecimalScale
            hideControls
            classNames={{ input: 'table-number-input' }}
            disabled={readOnly}
            onChange={(val) =>
              budgets.updateAllocated(row.original.id, Number(val ?? 0))
            }
          />
        ),
        aggregationFn: 'sum',
        AggregatedCell: ({ cell }) => (
          <Text className="table-body-right-bold">
            {currency(cell.getValue<number>())}
          </Text>
        ),
      },
      ...yearGroups,
      {
        accessorKey: 'totalActual',
        header: 'Actual (Total)',
        size: 140,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-right-bold',
        },
        mantineTableBodyCellProps: { className: 'table-body-right' },
        Cell: ({ cell }) => (
          <Text className="table-body-right-bold">
            {currency(cell.getValue<number>())}
          </Text>
        ),
        aggregationFn: 'sum',
        AggregatedCell: ({ cell }) => (
          <Text className="table-body-right-bold">
            {currency(cell.getValue<number>())}
          </Text>
        ),
      },
      {
        id: 'remaining',
        header: 'Remaining',
        size: 140,
        accessorFn: (row) => row.remaining,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-right-bold',
        },
        mantineTableBodyCellProps: { className: 'table-body-right' },
        Cell: ({ cell }) => (
          <Text className="table-body-right-bold">
            {currency(cell.getValue<number>())}
          </Text>
        ),
        aggregationFn: (_columnId, leafRows) => {
          const alloc = sum(leafRows.map((lr) => lr.original.allocated));
          const act = sum(leafRows.map((lr) => lr.original.totalActual));
          return alloc - act;
        },
        AggregatedCell: ({ cell }) => (
          <Text className="table-body-right-bold">
            {currency(cell.getValue<number>())}
          </Text>
        ),
      },
    ];
  }, [
    rollups.visibleMonthKeys,
    budgets,
    collapsedYears,
    collapsedQuarters,
    readOnly,
  ]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <Stack gap={2}>
          <Title order={5}>Budget rollups</Title>
          <Text size="sm" c="dimmed">
            Click a year total or quarter total to collapse/expand time columns.
          </Text>
          {rollups.badDateCount > 0 && (
            <Text size="sm" c="dimmed">
              ⚠️ {rollups.badDateCount} transaction(s) have invalid dates and
              were excluded from monthly rollups.
            </Text>
          )}
        </Stack>
        <Badge
          size="lg"
          variant="light"
          color={uncodedSummary.count ? 'red' : 'gray'}
        >
          Uncoded: {uncodedSummary.count} ({currency(uncodedSummary.amount)})
        </Badge>
      </Group>

      <MantineReactTable
        columns={budgetColumns}
        data={rollups.rollupRows}
        enableGrouping
        enableExpanding
        layoutMode="grid-no-grow"
        enableColumnResizing
        enableColumnDragging={false}
        enableGlobalFilter={false}
        enablePagination={false}
        enableTopToolbar={false}
        enableBottomToolbar={false}
        enableColumnActions={false}
        enableExpandAll={false}
        enableSorting={false}
        onGroupingChange={() => {}}
        onExpandedChange={() => {}}
        onSortingChange={() => {}}
        state={{
          density: 'xs',
          grouping: ['categoryName'],
          expanded: true,
          sorting: [{ id: 'categoryName', desc: true }],
          columnVisibility,
          isFullScreen: false,
          showColumnFilters: false,
        }}
        displayColumnDefOptions={{
          'mrt-row-expand': {
            mantineTableHeadCellProps: { style: { display: 'none' } },
            mantineTableBodyCellProps: { style: { display: 'none' } },
          },
        }}
        mantineTableContainerProps={{
          className: 'financeTable budgetTable',
          style: { width: 'fit-content' },
        }}
        mantineTableProps={{ highlightOnHover: true }}
      />
    </Stack>
  );
}
