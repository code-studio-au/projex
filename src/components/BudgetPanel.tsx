import { useCallback, useMemo, useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Paper,
  Select,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import {
  MantineReactTable,
  type MRT_ColumnDef,
} from 'mantine-react-table-open';
import { IconColumns } from '@tabler/icons-react';
import { useIsHydrated } from '../hooks/useIsHydrated';
import type { RollupsHook } from '../hooks/useRollups';
import type { BudgetsHook } from '../hooks/useBudgets';
import type {
  CategoryId,
  ProjectId,
  RollupRow,
  SubCategoryId,
  TransactionDrilldownFilter,
} from '../types';
import {
  formatMonthLabel,
  parseYearMonth,
  quarterOfMonth,
  sum,
  type Quarter,
} from '../utils/finance';
import { formatCurrencyFromCents } from '../utils/money';
import { useSessionQuery } from '../queries/session';
import {
  loadBudgetCollapseState,
  saveBudgetCollapseState,
} from '../store/uiPrefs';
import { LoadingLine } from './LoadingValue';
import ProjectBudgetSummary from './budget/ProjectBudgetSummary';
import MoneyAmountEditor from './finance/MoneyAmountEditor';
import classes from '../styles/ui.module.css';

type BudgetRollupRowWithTaxonomy = RollupRow & {
  categoryId: CategoryId;
  subCategoryId: SubCategoryId;
};

type BudgetDisplayRow = BudgetRollupRowWithTaxonomy & {
  rowKind: 'category' | 'subcategory';
  rowId: string;
};

type VisibilityState = Record<string, boolean>;

const quarterOptions: readonly Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];

function toQuarter(value: string | null): Quarter | null {
  if (!value) return null;
  if (value === 'Q1' || value === 'Q2' || value === 'Q3' || value === 'Q4') {
    return value;
  }
  return null;
}

/**
 * Budget rollup table (UI-only).
 *
 * Responsibilities:
 * - Renders category rollup rows plus always-visible subcategory rows.
 * - Keeps time columns aligned via explicit sizing and fixed table layout.
 */
function useBudgetPanelController(props: {
  projectId: ProjectId;
  currencyCode: string;
  projectBudgetTotalCents: number;
  yearFilterOptions: { value: string; label: string }[];
  yearFilter: string | null;
  setYearFilter: (value: string | null) => void;
  quarterFilterOptions: { value: 'Q1' | 'Q2' | 'Q3' | 'Q4'; label: string }[];
  quarterFilter: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null;
  setQuarterFilter: (value: 'Q1' | 'Q2' | 'Q3' | 'Q4' | null) => void;
  monthFilterOptions: { value: string; label: string }[];
  monthFilterKey: string | null;
  setMonthFilterKey: (value: string | null) => void;
  onClearFilters: () => void;
  onTransactionDrilldown?: (filter: TransactionDrilldownFilter) => void;
  onUpdateProjectBudgetTotal?: (budgetTotalCents: number) => Promise<void>;
  rollups: RollupsHook;
  budgets: BudgetsHook;
  uncodedSummary: { count: number; amountCents: number };
  pendingReversalCount: number;
  pendingReversalCents: number;
  isLoading?: boolean;
  canEditProjectBudgetTotal?: boolean;
  readOnly?: boolean;
}) {
  const {
    currencyCode,
    projectBudgetTotalCents,
    yearFilterOptions,
    yearFilter,
    setYearFilter,
    quarterFilterOptions,
    quarterFilter,
    setQuarterFilter,
    monthFilterOptions,
    monthFilterKey,
    setMonthFilterKey,
    onClearFilters,
    onTransactionDrilldown,
    onUpdateProjectBudgetTotal,
    rollups,
    budgets,
    uncodedSummary,
    pendingReversalCount,
    pendingReversalCents,
    isLoading = false,
    canEditProjectBudgetTotal = false,
    readOnly = false,
  } = props;

  const { updateAllocated } = budgets;
  const session = useSessionQuery();
  const isHydrated = useIsHydrated();
  const [userColumnVisibility, setUserColumnVisibility] = useState<
    Record<string, boolean>
  >({});
  const [collapseStateVersion, setCollapseStateVersion] = useState(0);
  const currentUserId = session.data?.userId ?? null;
  const persistedCollapseState = useMemo(() => {
    void collapseStateVersion;
    if (!isHydrated) {
      return { collapsedYears: {}, collapsedQuarters: {} };
    }
    return (
      loadBudgetCollapseState(props.projectId, {
        userId: currentUserId,
      }) ?? { collapsedYears: {}, collapsedQuarters: {} }
    );
  }, [collapseStateVersion, currentUserId, isHydrated, props.projectId]);
  const collapsedYears = useMemo(
    () =>
      new Set(
        Object.keys(persistedCollapseState.collapsedYears).flatMap((value) => {
          const year = Number(value);
          return Number.isInteger(year) ? [year] : [];
        })
      ),
    [persistedCollapseState.collapsedYears]
  );
  const collapsedQuarters = useMemo(
    () => new Set(Object.keys(persistedCollapseState.collapsedQuarters)),
    [persistedCollapseState.collapsedQuarters]
  );

  const updateCollapseState = useCallback(
    function updateCollapseState(
      updater: (current: {
        collapsedYears: Record<string, true>;
        collapsedQuarters: Record<string, true>;
      }) => {
        collapsedYears: Record<string, true>;
        collapsedQuarters: Record<string, true>;
      }
    ) {
      if (!isHydrated) return;
      const nextState = updater(persistedCollapseState);
      saveBudgetCollapseState(props.projectId, nextState, {
        userId: currentUserId,
      });
      setCollapseStateVersion((current) => current + 1);
    },
    [currentUserId, isHydrated, persistedCollapseState, props.projectId]
  );

  const hasPeriodFilter = Boolean(
    yearFilter || quarterFilter || monthFilterKey
  );

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

      visibility[quarterId] =
        (userColumnVisibility[quarterId] ?? true) && !isYearCollapsed;
      visibility[monthId] =
        (userColumnVisibility[monthId] ?? true) &&
        !(isYearCollapsed || isQuarterCollapsed);
    }

    return visibility;
  }, [
    collapsedQuarters,
    collapsedYears,
    rollups.visibleMonthKeys,
    userColumnVisibility,
  ]);

  const displayRows = useMemo<BudgetDisplayRow[]>(() => {
    const grouped = new Map<
      string,
      {
        categoryId: CategoryId;
        categoryName: string;
        rows: [BudgetRollupRowWithTaxonomy, ...BudgetRollupRowWithTaxonomy[]];
      }
    >();

    const visibleRollupRows = rollups.rollupRows.filter(
      (row): row is BudgetRollupRowWithTaxonomy =>
        Boolean(row.categoryId && row.subCategoryId)
    );

    for (const row of visibleRollupRows) {
      const key = row.categoryId;
      const existing = grouped.get(key);
      if (existing) {
        existing.rows.push(row);
        continue;
      }
      grouped.set(key, {
        categoryId: row.categoryId,
        categoryName: row.categoryName.trim(),
        rows: [row],
      });
    }

    return Array.from(grouped.values()).flatMap(
      ({ categoryId, categoryName, rows }) => {
        const firstRow = rows[0];
        const actualByMonthKey = Object.fromEntries(
          rollups.visibleMonthKeys.map((mk) => [
            mk,
            sum(rows.map((row) => row.actualByMonthKey[mk] ?? 0)),
          ])
        );

        const categoryRow: BudgetDisplayRow = {
          ...firstRow,
          id: firstRow.id,
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
      }
    );
  }, [rollups.rollupRows, rollups.visibleMonthKeys]);

  const timeHierarchy = useMemo(() => {
    const byYear = new Map<
      number,
      { quarterIds: string[]; monthIds: string[] }
    >();
    const byQuarter = new Map<string, { monthIds: string[] }>();
    const quarterIdsByYear = new Map<number, Set<string>>();

    for (const mk of rollups.visibleMonthKeys) {
      const { year, month } = parseYearMonth(mk);
      const quarter = quarterOfMonth(month);
      const quarterId = `qt_${year}_${quarter}`;
      const monthId = `m_${mk}`;

      const yearEntry = byYear.get(year) ?? { quarterIds: [], monthIds: [] };
      const knownQuarterIds = quarterIdsByYear.get(year) ?? new Set<string>();
      if (!knownQuarterIds.has(quarterId)) {
        knownQuarterIds.add(quarterId);
        yearEntry.quarterIds.push(quarterId);
        quarterIdsByYear.set(year, knownQuarterIds);
      }
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
      const next = typeof updater === 'function' ? updater(current) : updater;
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
      .sort(([a], [b]) => b - a)
      .flatMap(([year, quarterMap]) => {
        const yearMonths = Array.from(quarterMap.values()).flat().sort();
        return [
          {
            id: `yt_${year}`,
            header: `${year} Total`,
            size: 128,
            minSize: 128,
            enableHiding: true,
            Header: () => (
              <span className={classes.inlineHeader}>{year} Total</span>
            ),
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
                updateCollapseState((current) => {
                  const nextYears = { ...current.collapsedYears };
                  const yearKey = String(year);
                  if (nextYears[yearKey]) delete nextYears[yearKey];
                  else nextYears[yearKey] = true;
                  return {
                    collapsedYears: nextYears,
                    collapsedQuarters: current.collapsedQuarters,
                  };
                }),
              style: { cursor: 'pointer' },
            },
            mantineTableBodyCellProps: {
              className: 'table-body-right budgetTable-cell',
            },
          },
          ...quarterOptions
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
                  Header: () => (
                    <span className={classes.inlineHeader}>
                      {quarter} Total
                    </span>
                  ),
                  accessorFn: (row) => sumMonths(row, months),
                  Cell: ({ cell }) => (
                    <Text className="table-body-emphasis">
                      {formatCurrencyFromCents(
                        cell.getValue<number>(),
                        currencyCode
                      )}
                    </Text>
                  ),
                  mantineTableHeadCellProps: {
                    className:
                      'table-head-cell table-head-right budgetTable-head',
                    title: 'Click to collapse or expand this quarter',
                    onClick: () =>
                      updateCollapseState((current) => {
                        const nextQuarters = { ...current.collapsedQuarters };
                        const key = `${year}_${quarter}`;
                        if (nextQuarters[key]) delete nextQuarters[key];
                        else nextQuarters[key] = true;
                        return {
                          collapsedYears: current.collapsedYears,
                          collapsedQuarters: nextQuarters,
                        };
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
                  Header: () => (
                    <span className={classes.inlineHeader}>
                      {formatMonthLabel(mk)}
                    </span>
                  ),
                  accessorFn: (row) => row.actualByMonthKey[mk] ?? 0,
                  Cell: ({ cell }) => (
                    <Text className="table-body-right">
                      {formatCurrencyFromCents(
                        cell.getValue<number>(),
                        currencyCode
                      )}
                    </Text>
                  ),
                  mantineTableHeadCellProps: {
                    className:
                      'table-head-cell table-head-right budgetTable-head',
                  },
                  mantineTableBodyCellProps: {
                    className: 'table-body-right budgetTable-cell',
                  },
                })),
              ];
            }),
        ];
      });
  }, [currencyCode, rollups.visibleMonthKeys, updateCollapseState]);

  const budgetColumns = useMemo<MRT_ColumnDef<BudgetDisplayRow>[]>(() => {
    return [
      {
        accessorKey: 'categoryName',
        header: 'Category',
        size: 112,
        minSize: 96,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left budgetTable-head',
        },
        mantineTableBodyCellProps: { className: 'budgetTable-cell' },
        Cell: ({ row }) => {
          const handleDrilldown =
            row.original.rowKind === 'category'
              ? () =>
                  onTransactionDrilldown?.({
                    kind: 'category',
                    categoryId: row.original.categoryId,
                    categoryName: row.original.categoryName,
                  })
              : undefined;
          return (
            <Text
              component={handleDrilldown ? 'button' : 'span'}
              type={handleDrilldown ? 'button' : undefined}
              className={`${row.original.rowKind === 'category' ? 'table-body-left-bold' : 'table-body-left'}${handleDrilldown ? ` ${classes.drilldownButton}` : ''}`}
              onClick={handleDrilldown}
            >
              {row.original.rowKind === 'category'
                ? row.original.categoryName
                : ''}
            </Text>
          );
        },
      },
      {
        accessorKey: 'subCategoryName',
        header: 'Subcategory',
        size: 156,
        minSize: 136,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-left budgetTable-head',
        },
        mantineTableBodyCellProps: { className: 'budgetTable-cell' },
        Cell: ({ row }) => {
          const handleDrilldown =
            row.original.rowKind === 'subcategory'
              ? () =>
                  onTransactionDrilldown?.({
                    kind: 'subcategory',
                    categoryId: row.original.categoryId,
                    categoryName: row.original.categoryName,
                    subCategoryId: row.original.subCategoryId,
                    subCategoryName: row.original.subCategoryName,
                  })
              : undefined;
          return (
            <Text
              component={handleDrilldown ? 'button' : 'span'}
              type={handleDrilldown ? 'button' : undefined}
              className={`${row.original.rowKind === 'category' ? 'table-body-left-bold' : 'budgetTable-subcategory'}${handleDrilldown ? ` ${classes.drilldownButton}` : ''}`}
              onClick={handleDrilldown}
            >
              {row.original.rowKind === 'category'
                ? ''
                : row.original.subCategoryName}
            </Text>
          );
        },
      },
      {
        accessorKey: 'allocatedCents',
        header: 'Allocated',
        accessorFn: (row) => row.allocatedCents,
        size: 210,
        minSize: 196,
        mantineTableHeadCellProps: {
          className: 'table-head-cell table-head-right budgetTable-head',
        },
        mantineTableBodyCellProps: {
          className: 'table-body-right budgetTable-cell',
        },
        Cell: ({ row }) =>
          row.original.rowKind === 'category' ? (
            <Text className="table-body-emphasis">
              {formatCurrencyFromCents(
                row.original.allocatedCents,
                currencyCode
              )}
            </Text>
          ) : (
            <MoneyAmountEditor
              amountCents={row.original.allocatedCents}
              minimumCents={0}
              inputLabel={`Allocated budget for ${row.original.subCategoryName}`}
              saveLabel={`Save allocated budget for ${row.original.subCategoryName}`}
              cancelLabel={`Cancel allocated budget edit for ${row.original.subCategoryName}`}
              disabled={readOnly}
              inputClassName="budgetTable-numberInput"
              onSave={(allocatedCents) =>
                updateAllocated(row.original.id, allocatedCents)
              }
            />
          ),
      },
      {
        accessorKey: 'totalActualCents',
        header: 'Coded actual',
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
        header: 'Allocation remaining',
        accessorFn: (row) => row.remainingCents,
        size: 132,
        minSize: 120,
        Cell: ({ cell }) => {
          const v = cell.getValue<number>();
          return (
            <Text
              className="table-body-emphasis"
              {...(v < 0 ? { c: 'red' } : {})}
            >
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
    onTransactionDrilldown,
    updateAllocated,
    readOnly,
    timeColumns,
  ]);

  return {
    budgetColumns,
    canEditProjectBudgetTotal,
    columnVisibility,
    currencyCode,
    displayRows,
    handleColumnVisibilityChange,
    hasPeriodFilter,
    isHydrated,
    isLoading,
    monthFilterKey,
    monthFilterOptions,
    onClearFilters,
    onUpdateProjectBudgetTotal,
    pendingReversalCents,
    pendingReversalCount,
    projectBudgetTotalCents,
    quarterFilter,
    quarterFilterOptions,
    rollups,
    setMonthFilterKey,
    setQuarterFilter,
    setYearFilter,
    timeHierarchy,
    toggleQuarterVisibility,
    toggleYearVisibility,
    uncodedSummary,
    userColumnVisibility,
    yearFilter,
    yearFilterOptions,
  };
}

type BudgetPanelController = ReturnType<typeof useBudgetPanelController>;

function BudgetPanelView({ model }: { model: BudgetPanelController }) {
  return (
    <Stack gap="lg" className={classes.pageStack}>
      <Paper className={classes.filterCard} radius="xl">
        <Group align="flex-end" gap="sm" wrap="wrap">
          <Select
            label="Year"
            placeholder="All years"
            data={model.yearFilterOptions}
            value={model.yearFilter}
            clearable
            onChange={(value) => {
              model.setYearFilter(value);
              model.setQuarterFilter(null);
              model.setMonthFilterKey(null);
            }}
            style={{ width: 140 }}
          />
          <Select
            label="Quarter"
            placeholder="All quarters"
            data={model.quarterFilterOptions}
            value={model.quarterFilter}
            clearable
            disabled={!model.yearFilter}
            onChange={(value) => {
              model.setQuarterFilter(toQuarter(value));
              model.setMonthFilterKey(null);
            }}
            style={{ width: 150 }}
          />
          <Select
            label="Month"
            placeholder="All months"
            data={model.monthFilterOptions}
            value={model.monthFilterKey}
            clearable
            onChange={model.setMonthFilterKey}
            style={{ width: 180 }}
          />
          <Button
            size="sm"
            variant="subtle"
            disabled={
              !model.yearFilter && !model.quarterFilter && !model.monthFilterKey
            }
            onClick={model.onClearFilters}
          >
            Remove filter(s)
          </Button>
        </Group>
      </Paper>

      <ProjectBudgetSummary
        currencyCode={model.currencyCode}
        projectBudgetTotalCents={model.projectBudgetTotalCents}
        projectAllocatedCents={model.rollups.totals.allocatedCents}
        projectActualCents={model.rollups.totals.actualCents}
        uncodedSummary={model.uncodedSummary}
        pendingReversalCount={model.pendingReversalCount}
        pendingReversalCents={model.pendingReversalCents}
        hasPeriodFilter={model.hasPeriodFilter}
        isLoading={model.isLoading}
        canEditProjectBudgetTotal={model.canEditProjectBudgetTotal}
        {...(model.onUpdateProjectBudgetTotal
          ? { onUpdateProjectBudgetTotal: model.onUpdateProjectBudgetTotal }
          : {})}
      />

      <div className={classes.tableBreakout}>
        <div className={classes.tableWrap}>
          {model.isHydrated ? (
            <MantineReactTable
              columns={model.budgetColumns}
              data={model.displayRows}
              getRowId={(row) => row.rowId}
              state={{ columnVisibility: model.columnVisibility }}
              onColumnVisibilityChange={model.handleColumnVisibilityChange}
              mantineTableContainerProps={{
                className: 'financeTable budgetTable',
              }}
              mantineTableBodyCellProps={{
                style: { verticalAlign: 'middle' },
              }}
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
                    {Array.from(model.timeHierarchy.byYear.entries())
                      .sort(([a], [b]) => b - a)
                      .map(([year, entry]) => {
                        const yearId = `yt_${year}`;
                        return (
                          <Stack key={yearId} gap={4} p="xs">
                            <Switch
                              checked={
                                model.userColumnVisibility[yearId] ?? true
                              }
                              label={`${year} Total`}
                              onChange={(event) =>
                                model.toggleYearVisibility(
                                  year,
                                  event.currentTarget.checked
                                )
                              }
                            />
                            {entry.quarterIds.map((quarterId) => (
                              <Switch
                                key={quarterId}
                                checked={
                                  model.userColumnVisibility[quarterId] ?? true
                                }
                                label={
                                  quarterId.replace(/^qt_\d+_/, '') + ' Total'
                                }
                                onChange={(event) =>
                                  model.toggleQuarterVisibility(
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
          ) : (
            <Paper className={classes.surfaceMuted} radius="xl" p="md">
              <Stack gap="sm">
                <LoadingLine width="100%" height={18} radius="sm" />
                <LoadingLine width="100%" height={18} radius="sm" />
                <LoadingLine width="100%" height={18} radius="sm" />
                <LoadingLine width="100%" height={18} radius="sm" />
              </Stack>
            </Paper>
          )}
        </div>
      </div>
    </Stack>
  );
}

export default function BudgetPanel(
  props: Parameters<typeof useBudgetPanelController>[0]
) {
  const model = useBudgetPanelController(props);
  return <BudgetPanelView model={model} />;
}
