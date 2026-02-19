import type { ImportTxnWithTaxonomy, Txn, TxnId } from "../types";
import { asTxnId } from "../types";
import { uid } from "./id";

type UnscopedTxn = Omit<Txn, "companyId" | "projectId">;

/**
 * Minimal CSV parser (handles quotes, commas, newlines).
 * Expected headers (case-insensitive):
 * - id
 * - date (yyyy-mm-dd)
 * - item
 * - description
 * - amount
 * Optional:
 * - category
 * - subcategory
 *
 * NOTE: mapping category/subcategory -> IDs is handled elsewhere (taxonomy lookup).
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushCell = () => {
    row.push(cur);
    cur = "";
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      pushCell();
      continue;
    }

    if (ch === "\n") {
      pushCell();
      rows.push(row);
      row = [];
      continue;
    }

    if (ch === "\r") {
      // ignore CR; LF handles row end
      continue;
    }

    cur += ch;
  }

  // final cell
  pushCell();
  // final row if any content
  if (row.length > 1 || row.some((c) => c.trim() !== "")) rows.push(row);

  if (!rows.length) return [];

  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (const r of rows.slice(1)) {
    if (r.every((c) => c.trim() === "")) continue;
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = (r[i] ?? "").trim();
    out.push(obj);
  }
  return out;
}

export function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, "");
}

export function rowsToImportTxns(rows: Record<string, string>[]): ImportTxnWithTaxonomy[] {
  return rows.map((r) => {
    const map: Record<string, string> = {};
    for (const k of Object.keys(r)) map[normalizeHeader(k)] = r[k];

    const id =
      map["id"] ||
      map["transactionid"] ||
      map["txn_id"] ||
      map["reference"] ||
      "";

    const date = map["date"] || map["transactiondate"] || map["posteddate"] || "";
    const item = map["item"] || map["merchant"] || map["payee"] || "";
    const description = map["description"] || map["memo"] || "";
    const amountRaw = map["amount"] || map["debit"] || "";
    const amount = Number(String(amountRaw).replace(/[^0-9.\-]/g, "")) || 0;

    return {
      id: id.trim() || undefined, // optional (many CSVs won't have it)
      date,
      item,
      description,
      amount,
      category: map["category"] || "",
      subcategory: map["subcategory"] || "",
    };
  });
}

/** Normalize text so tiny differences don't change IDs */
function normText(s: string) {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[’‘]/g, "'");
}

function normAmount(n: number) {
  return (Math.round((n || 0) * 100) / 100).toFixed(2);
}

/** FNV-1a 32-bit hash (fast + deterministic) */
function fnv1a32(str: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function fingerprint(t: Pick<ImportTxnWithTaxonomy, "date" | "item" | "description" | "amount">) {
  return [t.date || "", normAmount(t.amount), normText(t.item), normText(t.description)].join("|");
}

export function deriveStableTxnId(
  t: Pick<ImportTxnWithTaxonomy, "id" | "date" | "item" | "description" | "amount">,
  occurrence = 1
): TxnId | string {
  // Prefer bank-provided / CSV id if present
  if (t.id && String(t.id).trim()) return String(t.id).trim();

  // Otherwise, derive from content fingerprint
  const hash = fnv1a32(fingerprint(t)).toString(36);
  return occurrence === 1 ? `txn_${hash}` : `txn_${hash}_${occurrence}`;
}

/** Assign stable IDs using fingerprint + occurrence count */
export function assignStableIds(
  importTxns: ImportTxnWithTaxonomy[]
): Array<ImportTxnWithTaxonomy & { id: TxnId | string }> {
  const seen = new Map<string, number>();
  return importTxns.map((t) => {
    const fp = fingerprint(t);
    const occ = (seen.get(fp) ?? 0) + 1;
    seen.set(fp, occ);
    return { ...t, id: deriveStableTxnId(t, occ) };
  });
}

/** Filter out transactions whose IDs already exist in the destination list */
export function filterDuplicatesById<T extends { id: string }>(
  items: T[],
  existingIds: Set<string>,
  skipDuplicates: boolean
): { kept: T[]; skipped: number } {
  if (!skipDuplicates) return { kept: items, skipped: 0 };
  const kept: T[] = [];
  let skipped = 0;
  for (const it of items) {
    if (existingIds.has(it.id)) {
      skipped++;
      continue;
    }
    kept.push(it);
  }
  return { kept, skipped };
}

export function finalizeImportTxns(
  importTxns: ImportTxnWithTaxonomy[],
  opts?: { existingIds?: Set<string>; skipDuplicates?: boolean }
): { txns: UnscopedTxn[]; skipped: number } {
  const existingIds = opts?.existingIds ?? new Set<string>();
  const skipDuplicates = opts?.skipDuplicates ?? true;

  const withIds = assignStableIds(importTxns).map((t) => ({
    ...t,
    id: String(t.id), // normalize to string for dedupe lookup
  }));

  const { kept, skipped } = filterDuplicatesById(withIds, existingIds, skipDuplicates);

  const out: UnscopedTxn[] = kept.map((t) => ({
    id: asTxnId(t.id || uid()),
    date: t.date,
    item: t.item,
    description: t.description,
    amount: t.amount,
    categoryId: t.categoryId,
    subCategoryId: t.subCategoryId,
  }));

  return { txns: out, skipped };
}
