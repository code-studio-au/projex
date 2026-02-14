import { useMemo, useState } from "react";
import type { Id, Txn } from "../types";
import { uid } from "../utils/id";
import { parseISODate, monthKeyFromStart, monthStart } from "../utils/finance";

export function useTransactions(initial: Txn[]) {

  const [transactions, setTransactions] = useState<Txn[]>(initial);

  const updateTxn = (id: Id, patch: Partial<Txn>) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const stripCodingForSubCategoryIds = (subCategoryIds: Id[]) => {
    const setIds = new Set(subCategoryIds);
    setTransactions((prev) =>
      prev.map((t) =>
        t.subCategoryId && setIds.has(t.subCategoryId)
          ? { ...t, categoryId: undefined, subCategoryId: undefined }
          : t
      )
    );
  };

  const stripCodingForCategoryIds = (categoryIds: Id[]) => {
    const setIds = new Set(categoryIds);
    setTransactions((prev) =>
      prev.map((t) =>
        t.categoryId && setIds.has(t.categoryId)
          ? { ...t, categoryId: undefined, subCategoryId: undefined }
          : t
      )
    );
  };


  const replaceAll = (next: Txn[]) => setTransactions(next);

  const appendMany = (next: Txn[]) => setTransactions((prev) => [...prev, ...next]);

  const getUncodedSummary = (validSubIds: Set<Id>) => {
    const bad = transactions.filter((t) => !t.subCategoryId || !validSubIds.has(t.subCategoryId));
    return { count: bad.length, amount: bad.reduce((a, b) => a + (b.amount ?? 0), 0) };
  };

  return { transactions, updateTxn, stripCodingForSubCategoryIds, stripCodingForCategoryIds, setTransactions, replaceAll, appendMany, getUncodedSummary };
}



export type TransactionsHook = ReturnType<typeof useTransactions>;
