import { useMemo, useState } from "react";
import type { CategoryId, SubCategoryId, Txn, TxnId } from "../types";
import { uid } from "../utils/id";
import { parseISODate, monthKeyFromStart, monthStart } from "../utils/finance";

export function useTransactions(params: { initial?: Txn[]; value?: Txn[]; onChange?: (next: Txn[]) => void }) {

  const [inner, setInner] = useState<Txn[]>(params.initial ?? []);

  const transactions = params.value ?? inner;
  const setTransactions = (next: Txn[] | ((prev: Txn[]) => Txn[])) => {
    const compute = typeof next === "function" ? (next as (p: Txn[]) => Txn[])(transactions) : next;
    if (params.onChange) params.onChange(compute);
    else setInner(compute);
  };

  const updateTxn = (id: TxnId, patch: Partial<Txn>) => {
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const stripCodingForSubCategoryIds = (subCategoryIds: SubCategoryId[]) => {
    const setIds = new Set(subCategoryIds);
    setTransactions((prev) =>
      prev.map((t) =>
        t.subCategoryId && setIds.has(t.subCategoryId)
          ? { ...t, categoryId: undefined, subCategoryId: undefined }
          : t
      )
    );
  };

  const stripCodingForCategoryIds = (categoryIds: CategoryId[]) => {
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

  const getUncodedSummary = (validSubIds: Set<SubCategoryId>) => {
    const bad = transactions.filter((t) => !t.subCategoryId || !validSubIds.has(t.subCategoryId));
    return { count: bad.length, amount: bad.reduce((a, b) => a + (b.amount ?? 0), 0) };
  };

  return { transactions, updateTxn, stripCodingForSubCategoryIds, stripCodingForCategoryIds, setTransactions, replaceAll, appendMany, getUncodedSummary };
}



export type TransactionsHook = ReturnType<typeof useTransactions>;
