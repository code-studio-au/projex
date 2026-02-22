import { useEffect, useMemo, useState } from 'react';
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
  formatMonthLabel,
  parseYearMonth,
  quarterKey,
  quarterOfMonth,
  sum,
  type Quarter,
} from '../utils/finance';

type CollapseState = {
  collapsedYears: Set<number>;
  collapsedQuarters: Set<string>;
};

const HEADER_STYLE = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  justifyContent: 'flex-end',
} as const;

/**
 * Budget rollup table (UI-only).
 *
 * Responsibilities:
 * - Renders hierarchical time columns (Year → Quarter).
 * - Owns collapse / expand UX.
 * - Persists collapse state per project.
 *
 * NOTE:
 * All state is initialized lazily.
 * Effects are used ONLY for side-effects (persistence).
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

  const { updateAllocated } = budgets;

  /**
   * Collapse state scoped per project.
   * Initialized once via lazy initializer.
   */
  const [{ collapsedYears, collapsedQuarters }, setCollapse] =
    useState<CollapseState>(() => {
      const saved = loadBudgetCollapseState(projectId);

      if (saved) {
        return {
          collapsedYears: new Set(
            Object.keys(saved.collapsedYears)
              .map(Number)
              .filter(Number.isFinite)
          ),
          collapsedQuarters: new Set(Object.keys(saved.collapsedQuarters)),
        };
      }

      return {
        collapsedYears: new Set<number>(),
        collapsedQuarters: new Set<string>(),
      };
    });

  /**
   * Persist collapse state per project.
   */
  useEffect(() => {
    saveBudgetCollapseState(projectId, {
      collapsedYears: Object.fromEntries(
        Array.from(collapsedYears).map((y) => [String(y), true])
      ),
      collapsedQuarters: Object.fromEntries(
        Array.from(collapsedQuarters).map((qk) => [qk, true])
      ),
    });
  }, [projectId, collapsedYears, collapsedQuarters]);

  /**
   * Column visibility derived from collapse state.
   */
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
    const years = new Map<number, Map<Quarter, string[]>>();

    for (const mk of rollups.visibleMonthKeys) {
      const { year, month } = parseYearMonth(mk);
      const q = quarterOfMonth(month);
      if (!years.has(year)) years.set(year, new Map());
      const qm = years.get(year)!;
      if (!qm.has(q)) qm.set(q, []);
      qm.get(q)!.push(mk);
    }

    for (const [, qm] of years) {
      for (const [q, arr] of qm) {
        qm.set(q, [...arr].sort());
      }
    }

    const sumMonths = (row: RollupRow, months: string[]) =>
      months.reduce((acc, mk) => acc + (row.actualByMonthKey[mk] ?? 0), 0);

    const yearGroups: MRT_ColumnDef<RollupRow>[] = Array.from(years.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, quarterMap]) => {
        const yearMonths = Array.from(quarterMap.values()).flat();

        const yearTotal: MRT_ColumnDef<RollupRow> = {
          id: `yt_${year}`,
          header: `${year} Total`,
          Header: () => (
            <span style={HEADER_STYLE}>
              <span>{year} Total</span>
              <span aria-hidden style={{ fontSize: 12, opacity: 0.85 }}>
                {collapsedYears.has(year) ? '▸' : '▾'}
              </span>
            </span>
          ),
          accessorFn: (row) => sumMonths(row, yearMonths),
          Cell: ({ cell }) => (
            <Text fw={700}>{currency(cell.getValue<number>())}</Text>
          ),
          aggregationFn: 'sum',
          mantineTableHeadCellProps: {
            title: 'Click to collapse / expand year',
            onClick: () =>
              setCollapse((s) => {
                const next = new Set(s.collapsedYears);
                if (next.has(year)) next.delete(year);
                else next.add(year);
                return { ...s, collapsedYears: next };
              }),
            style: { cursor: 'pointer' },
          },
        };

        const quarterCols: MRT_ColumnDef<RollupRow>[] = (
          ['Q1', 'Q2', 'Q3', 'Q4'] as Quarter[]
        )
          .filter((q) => quarterMap.has(q))
          .map((q) => {
            const months = quarterMap.get(q)!;
            const qk = quarterKey(year, q);

            const quarterTotal: MRT_ColumnDef<RollupRow> = {
              id: `qt_${year}_${q}`,
              header: `${q} Total`,
              Header: () => (
                <span style={HEADER_STYLE}>
                  <span>{q} Total</span>
                  <span aria-hidden style={{ fontSize: 12, opacity: 0.85 }}>
                    {collapsedQuarters.has(qk) ? '▸' : '▾'}
                  </span>
                </span>
              ),
              accessorFn: (row) => sumMonths(row, months),
              Cell: ({ cell }) => <Text fw={700}>{currency(cell.getValue<number>())}</Text>,
              aggregationFn: 'sum',
              mantineTableHeadCellProps: {
                title: 'Click to collapse / expand quarter',
                onClick: () =>
                  setCollapse((s) => {
                    const next = new Set(s.collapsedQuarters);
                    if (next.has(qk)) next.delete(qk);
                    else next.add(qk);
                    return { ...s, collapsedQuarters: next };
                  }),
                style: { cursor: 'pointer' },
              },
            };

            const monthCols: MRT_ColumnDef<RollupRow>[] = months.map((mk) => ({
              id: `m_${mk}`,
              header: formatMonthLabel(mk),
              accessorFn: (row) => row.actualByMonthKey[mk] ?? 0,
              Cell: ({ cell }) => <Text>{currency(cell.getValue<number>())}</Text>,
              aggregationFn: 'sum',
            }));

            return {
              id: `qgrp_${year}_${q}`,
              header: q,
              columns: [quarterTotal, ...monthCols],
            };
          });

        return {
          id: `ygrp_${year}`,
          header: String(year),
          columns: [yearTotal, ...quarterCols],
        };
      });

    return [
      { accessorKey: 'categoryName', header: 'Category' },
      { accessorKey: 'subCategoryName', header: 'Subcategory' },
      {
        accessorKey: 'allocated',
        header: 'Allocated',
        accessorFn: (row) => row.allocated,
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
            disabled={readOnly}
            onChange={(v) =>
              updateAllocated(row.original.id, Number(v ?? 0))
            }
          />
        ),
        aggregationFn: 'sum',
      },
      ...yearGroups,
      {
        accessorKey: 'totalActual',
        header: 'Actual (Total)',
        aggregationFn: 'sum',
      },
      {
        id: 'remaining',
        header: 'Remaining',
        accessorFn: (row) => row.remaining,
        aggregationFn: (_id, rows) =>
          sum(rows.map((r) => r.original.allocated)) -
          sum(rows.map((r) => r.original.totalActual)),
      },
    ];
  }, [
    rollups.visibleMonthKeys,
    collapsedYears,
    collapsedQuarters,
    updateAllocated,
    readOnly,
  ]);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={5}>Budget rollups</Title>
        <Badge color={uncodedSummary.count ? 'red' : 'gray'}>
          Uncoded: {uncodedSummary.count} ({currency(uncodedSummary.amount)})
        </Badge>
      </Group>

      <MantineReactTable
        columns={budgetColumns}
        data={rollups.rollupRows}
        state={{ columnVisibility }}
        enablePagination={false}
        enableSorting={false}
      />
    </Stack>
  );
}