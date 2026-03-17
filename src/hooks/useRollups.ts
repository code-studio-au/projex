import { useMemo } from 'react';

/**
 * Rollup computations for budgets vs actuals.
 *
 * This hook is intentionally UI-agnostic: it produces a normalized model
 * (rows + month keys + aggregations) that a table component can render.
 *
 * Keeping the computation isolated makes it easy to migrate to a backend
 * implementation later (TanStack Start server functions / SQL rollups),
 * while preserving the same UI contract.
 */
import type { BudgetLine, RollupRow, SubCategoryId, Txn } from '../types';
import {
  monthKeyFromStart,
  monthStart,
  nextMonthStart,
  parseISODate,
  sum,
} from '../utils/finance';
import type { TaxonomyHook } from './useTaxonomy';

/**
 * Parses a month key used in the UI ("YYYY-MM") into a Date.
 * Accepts full ISO date strings as a convenience (we normalize to month start).
 */
function parseMonthKeyToDate(input: string) {
  // Accept "YYYY-MM" or a full ISO date.
  const key = /^\d{4}-\d{2}$/.test(input) ? `${input}-01` : input;
  return parseISODate(key);
}

export function useRollups(params: {
  transactions: Txn[];
  budgets: BudgetLine[];
  taxonomy: TaxonomyHook;
  monthFilterKey?: string | null;
}) {
  const { transactions, budgets, taxonomy, monthFilterKey } = params;

  const monthStarts = useMemo(() => {
    // Be resilient to malformed dates (e.g., from CSV imports).
    // A single NaN in Math.min/Math.max would poison the whole range.
    const times = transactions
      .map((t) => {
        try {
          return parseISODate(t.date).getTime();
        } catch {
          return NaN;
        }
      })
      .filter((ms) => Number.isFinite(ms)) as number[];

    if (!times.length) {
      if (!budgets.length) return [];

      // Keep the budget time-axis usable even before transaction dates exist.
      // This gives budgeting screens a stable year/quarter/month scaffold and
      // makes column visibility controls meaningful for newly created projects.
      const now = new Date();
      const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      return Array.from({ length: 12 }, (_, idx) =>
        new Date(Date.UTC(start.getUTCFullYear(), idx, 1))
      );
    }

    const minD = monthStart(new Date(Math.min(...times)));
    const maxD = monthStart(new Date(Math.max(...times)));

    const out: Date[] = [];
    let d = new Date(minD);
    while (d <= maxD) {
      out.push(new Date(d));
      d = nextMonthStart(d);
    }
    return out;
  }, [budgets.length, transactions]);

  const visibleMonthStarts = useMemo(() => {
    if (!monthFilterKey) return monthStarts;
    return [monthStart(parseMonthKeyToDate(monthFilterKey))];
  }, [monthStarts, monthFilterKey]);

  const visibleMonthKeys = useMemo(
    () => visibleMonthStarts.map(monthKeyFromStart),
    [visibleMonthStarts]
  );

  const validSubIds = useMemo(
    () => new Set<SubCategoryId>(taxonomy.subCategories.map((s) => s.id)),
    [taxonomy.subCategories]
  );

  const codedTxns = useMemo(
    () =>
      transactions.filter(
        (t) => t.subCategoryId && validSubIds.has(t.subCategoryId)
      ),
    [transactions, validSubIds]
  );

  const { actualsBySubMonth, badDateCount } = useMemo(() => {
    const map = new Map<SubCategoryId, Record<string, number>>();
    let bad = 0;

    for (const t of codedTxns) {
      const scId = t.subCategoryId!;
      if (!map.has(scId)) map.set(scId, {});
      const rec = map.get(scId)!;

      // Derive the month key from an actual parsed date instead of string slicing.
      // This avoids silently mis-bucketing dates like "2025/01/05" or empty strings.
      let mk: string | null = null;
      try {
        const d = parseISODate(t.date);
        mk = monthKeyFromStart(monthStart(d));
      } catch {
        bad += 1;
      }

      if (!mk) continue;

      // Projex treats expense amounts as positive. Be resilient to Concur-style
      // exports (negative expenses) and any legacy data.
      rec[mk] = (rec[mk] ?? 0) + Math.abs(t.amountCents);
    }

    return { actualsBySubMonth: map, badDateCount: bad };
  }, [codedTxns]);

  const rollupRows: RollupRow[] = useMemo(() => {
    return budgets
      .map((b) => {
        // Rollups are subcategory-scoped. If a budget line is missing a subCategoryId,
        // we can't bucket actuals reliably.
        if (!b.subCategoryId) return null;

        const rec = actualsBySubMonth.get(b.subCategoryId) ?? {};
        const actualByMonthKey: Record<string, number> = {};
        for (const mk of visibleMonthKeys) actualByMonthKey[mk] = rec[mk] ?? 0;
        const totalActualCents = sum(Object.values(actualByMonthKey));

        return {
          ...b,
          categoryName: taxonomy.getCategoryName(b.categoryId),
          subCategoryName: taxonomy.getSubCategoryName(b.subCategoryId),
          actualByMonthKey,
          totalActualCents,
          remainingCents: b.allocatedCents - totalActualCents,
        };
      })
      .filter((r): r is RollupRow => !!r && !!r.categoryName && !!r.subCategoryName);
  }, [budgets, actualsBySubMonth, visibleMonthKeys, taxonomy]);

  const totals = useMemo(() => {
    const allocatedCents = sum(rollupRows.map((r) => r.allocatedCents));
    const actualCents = sum(rollupRows.map((r) => r.totalActualCents));
    return {
      allocatedCents,
      actualCents,
      remainingCents: allocatedCents - actualCents,
    };
  }, [rollupRows]);

  return { monthStarts, visibleMonthKeys, rollupRows, totals, badDateCount };
}

export type RollupsHook = ReturnType<typeof useRollups>;
