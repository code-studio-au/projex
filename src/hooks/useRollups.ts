import { useMemo,useState,useEffect } from "react";
import type { Id,Txn, BudgetLine, RollupRow } from "../types";
import { parseISODate, monthKeyFromStart, monthStart, nextMonthStart, sum, quarterOfMonth,parseYearMonth,quarterKey } from "../utils/finance";
import type { TaxonomyHook } from "./useTaxonomy";

export function useRollups(params: {
  transactions: Txn[];
  budgets: BudgetLine[];
  taxonomy: TaxonomyHook;
  monthFilterKey?: string | null;
}) {
  const { transactions, budgets, taxonomy, monthFilterKey } = params;

  const monthStarts = useMemo(() => {
    if (!transactions.length) return [];
    const times = transactions.map((t) => parseISODate(t.date).getTime());
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
    return [monthStart(parseISODate(monthFilterKey))];
  }, [monthStarts, monthFilterKey]);

  const visibleMonthKeys = useMemo(() => visibleMonthStarts.map(monthKeyFromStart), [visibleMonthStarts]);

  const validSubIds = useMemo(() => new Set(taxonomy.subCategories.map((s) => s.id)), [taxonomy.subCategories]);


  // ======== Time column collapse (Year + Quarter) ========
  const [collapsedYears, setCollapsedYears] = useState<Set<number>>(() => new Set());
  const [collapsedQuarters, setCollapsedQuarters] = useState<Set<string>>(() => new Set());

  // Default behavior:
  // - Other years collapsed (show year total only)
  // - Current year: current quarter expanded, other quarters collapsed
  useEffect(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentQuarter = quarterOfMonth(now.getMonth() + 1);

    const yearsInData = Array.from(
      new Set(visibleMonthKeys.map((mk) => parseYearMonth(mk).year))
    ).sort((a, b) => a - b);

    // Collapse all years except current year
    const nextCollapsedYears = new Set<number>(yearsInData.filter((y) => y !== currentYear));

    // Collapse all quarters except current quarter of current year
    const nextCollapsedQuarters = new Set<string>();
    for (const mk of visibleMonthKeys) {
      const { year, month } = parseYearMonth(mk);
      const q = quarterOfMonth(month);
      const qk = quarterKey(year, q);
      if (!(year === currentYear && q === currentQuarter)) nextCollapsedQuarters.add(qk);
    }

    setCollapsedYears(nextCollapsedYears);
    setCollapsedQuarters(nextCollapsedQuarters);
  }, [visibleMonthKeys]);

  const budgetColumnVisibility = useMemo(() => {
    const vis: Record<string, boolean> = {};

    for (const mk of visibleMonthKeys) {
      const { year, month } = parseYearMonth(mk);
      const q = quarterOfMonth(month);
      const qk = quarterKey(year, q);

      const yearCollapsed = collapsedYears.has(year);
      const quarterCollapsed = collapsedQuarters.has(qk);

      vis[`m_${mk}`] = !(yearCollapsed || quarterCollapsed);
      vis[`qt_${year}_${q}`] = !yearCollapsed; // hide quarter totals when year collapsed
      vis[`yt_${year}`] = true; // always show year totals
    }

    return vis;
  }, [visibleMonthKeys, collapsedYears, collapsedQuarters]);
  const codedTxns = useMemo(
    () => transactions.filter((t) => t.subCategoryId && validSubIds.has(t.subCategoryId)),
    [transactions, validSubIds]
  );

const actualsBySubMonth = useMemo(() => {
  const map = new Map<Id, Record<string, number>>();

  for (const t of codedTxns) {
    const scId = t.subCategoryId!;
    if (!map.has(scId)) map.set(scId, {});
    const rec = map.get(scId)!;

    const mk = t.date.slice(0, 7); // yyyy-mm
    rec[mk] = (rec[mk] ?? 0) + t.amount;
  }

  return map;
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

  return { monthStarts, visibleMonthKeys, rollupRows, totals };
}



export type RollupsHook = ReturnType<typeof useRollups>;
