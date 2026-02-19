import { useMemo } from "react";

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
import type { BudgetLine, RollupRow, SubCategoryId, Txn } from "../types";
import { monthKeyFromStart, monthStart, nextMonthStart, parseISODate, sum } from "../utils/finance";
import type { TaxonomyHook } from "./useTaxonomy";

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
    if (!transactions.length) return [];

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

    if (!times.length) return [];

    const minD = monthStart(new Date(Math.min(...times)));
    const maxD = monthStart(new Date(Math.max(...times)));

    const out: Date[] = [];
    let d = new Date(minD);
    while (d <= maxD) {
      out.push(new Date(d));
      d = nextMonthStart(d);
    }
    return out;
  }, [transactions]);

  const visibleMonthStarts = useMemo(() => {
    if (!monthFilterKey) return monthStarts;
    return [monthStart(parseMonthKeyToDate(monthFilterKey))];
  }, [monthStarts, monthFilterKey]);

  const visibleMonthKeys = useMemo(() => visibleMonthStarts.map(monthKeyFromStart), [visibleMonthStarts]);

  const validSubIds = useMemo(() => new Set<SubCategoryId>(taxonomy.subCategories.map((s) => s.id)), [taxonomy.subCategories]);

  const codedTxns = useMemo(
    () => transactions.filter((t) => t.subCategoryId && validSubIds.has(t.subCategoryId)),
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

      rec[mk] = (rec[mk] ?? 0) + t.amount;
    }

    return { actualsBySubMonth: map, badDateCount: bad };
  }, [codedTxns]);

  const rollupRows: RollupRow[] = useMemo(() => {
    return budgets
      .map((b) => {
        const rec = actualsBySubMonth.get(b.subCategoryId) ?? {};
        const actualByMonthKey: Record<string, number> = {};
        for (const mk of visibleMonthKeys) actualByMonthKey[mk] = rec[mk] ?? 0;
        const totalActual = sum(Object.values(actualByMonthKey));

        return {
          ...b,
          categoryName: taxonomy.getCategoryName(b.categoryId),
          subCategoryName: taxonomy.getSubCategoryName(b.subCategoryId),
          actualByMonthKey,
          totalActual,
          remaining: b.allocated - totalActual,
        };
      })
      .filter((r) => r.categoryName && r.subCategoryName);
  }, [budgets, actualsBySubMonth, visibleMonthKeys, taxonomy]);

  const totals = useMemo(() => {
    const allocated = sum(rollupRows.map((r) => r.allocated));
    const actual = sum(rollupRows.map((r) => r.totalActual));
    return { allocated, actual, remaining: allocated - actual };
  }, [rollupRows]);

  return { monthStarts, visibleMonthKeys, rollupRows, totals, badDateCount };
}

export type RollupsHook = ReturnType<typeof useRollups>;
