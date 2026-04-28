import type { ImportTxnWithTaxonomy, Txn, TxnId } from '../types';
import { asTxnId } from '../types';
import { uid } from './id';
import { toCents } from './money';

type UnscopedTxn = Omit<Txn, 'companyId' | 'projectId'>;

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
  let cur = '';
  let row: string[] = [];
  let inQuotes = false;

  const pushCell = () => {
    row.push(cur);
    cur = '';
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

    if (ch === ',') {
      pushCell();
      continue;
    }

    if (ch === '\n') {
      pushCell();
      rows.push(row);
      row = [];
      continue;
    }

    if (ch === '\r') {
      // ignore CR; LF handles row end
      continue;
    }

    cur += ch;
  }

  // final cell
  pushCell();
  // final row if any content
  if (row.length > 1 || row.some((c) => c.trim() !== '')) rows.push(row);

  if (!rows.length) return [];

  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (const r of rows.slice(1)) {
    if (r.every((c) => c.trim() === '')) continue;
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++)
      obj[headers[i]] = (r[i] ?? '').trim();
    out.push(obj);
  }
  return out;
}

export function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, '');
}

export function rowsToImportTxns(
  rows: Record<string, string>[]
): ImportTxnWithTaxonomy[] {
  return rows.map((r) => {
    const map: Record<string, string> = {};
    for (const k of Object.keys(r)) map[normalizeHeader(k)] = r[k];

    const externalId =
      map['id'] ||
      map['transactionid'] ||
      map['txn_id'] ||
      map['reference'] ||
      '';

    const date =
      map['date'] || map['transactiondate'] || map['posteddate'] || '';
    const description = map['description'] || map['memo'] || '';
    const item =
      map['item'] || map['merchant'] || map['payee'] || description || '';
    const amountRaw = map['amount'] || map['debit'] || '';
    const amountParsed =
      Number(String(amountRaw).replace(/[^0-9.-]/g, '')) || 0;
    const amountCents = Math.abs(toCents(amountParsed));

    return {
      externalId: externalId.trim() || undefined, // optional (many CSVs won't have it)
      date,
      item,
      description,
      amountCents,
      category: map['category'] || '',
      subcategory: map['subcategory'] || '',
    };
  });
}

/** Normalize text so tiny differences don't change IDs */
function normText(s: string) {
  return (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[’‘]/g, "'");
}

function normAmountCents(cents: number) {
  // Use a stable integer representation for fingerprinting.
  return String(Math.round(Number(cents || 0)));
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

function fingerprint(
  t: Pick<
    ImportTxnWithTaxonomy,
    'date' | 'item' | 'description' | 'amountCents'
  >
) {
  return [
    t.date || '',
    normAmountCents(t.amountCents),
    normText(t.item),
    normText(t.description),
  ].join('|');
}

export /**
 * Derives a deterministic ID string from stable row fields.
 *
 * This is used to avoid re-import duplicates when the same bank export is imported multiple times.
 * The returned value is a plain string; branding to `TxnId` should happen at the object boundary.
 */
function deriveStableTxnId(
  t: Pick<
    ImportTxnWithTaxonomy,
    'id' | 'externalId' | 'date' | 'item' | 'description' | 'amountCents'
  >,
  occurrence = 1
): TxnId | string {
  // Prefer external/bank-provided reference for deterministic local IDs.
  if (t.externalId && String(t.externalId).trim()) {
    const hash = fnv1a32(String(t.externalId).trim().toLowerCase()).toString(
      36
    );
    return occurrence === 1
      ? `txn_ext_${hash}`
      : `txn_ext_${hash}_${occurrence}`;
  }
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

function dedupeKeyForTxn(t: { id: string; externalId?: string }) {
  const ext = (t.externalId ?? '').trim();
  return ext ? `external:${ext}` : `id:${t.id}`;
}

/** Filter out transactions whose dedupe keys already exist in the destination list */
export function filterDuplicatesByKey<
  T extends { id: string; externalId?: string },
>(
  items: T[],
  existingKeys: Set<string>,
  skipDuplicates: boolean
): { kept: T[]; skipped: number } {
  if (!skipDuplicates) return { kept: items, skipped: 0 };
  const kept: T[] = [];
  let skipped = 0;
  for (const it of items) {
    const key = dedupeKeyForTxn(it);
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }
    existingKeys.add(key);
    kept.push(it);
  }
  return { kept, skipped };
}

export function finalizeImportTxns(
  importTxns: ImportTxnWithTaxonomy[],
  opts?: { existingKeys?: Set<string>; skipDuplicates?: boolean }
): { txns: UnscopedTxn[]; skipped: number } {
  const existingKeys = new Set(opts?.existingKeys ?? []);
  const skipDuplicates = opts?.skipDuplicates ?? true;

  const withIds = assignStableIds(importTxns).map((t) => ({
    ...t,
    id: String(t.id), // normalize to string for dedupe lookup
    externalId: t.externalId?.trim() || undefined,
  }));

  const { kept, skipped } = filterDuplicatesByKey(
    withIds,
    existingKeys,
    skipDuplicates
  );

  const out: UnscopedTxn[] = kept.map((t) => ({
    id: asTxnId(t.id || uid()),
    externalId: t.externalId,
    date: t.date,
    item: t.item,
    description: t.description,
    amountCents: t.amountCents,
    categoryId: t.categoryId,
    subCategoryId: t.subCategoryId,
  }));

  return { txns: out, skipped };
}
