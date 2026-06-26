import type {
  ImportRule,
  ImportRuleDecision,
  ImportRuleField,
  PowerBiExpenditureActualsRow,
} from '../types';
import { toCents } from './money';

const POWER_BI_COLUMNS = {
  ledger: 'Ledger',
  fiscalYear: 'Fiscal Year',
  period: 'Period',
  ccAndDescription: 'CC and Description',
  rcAndDescription: 'RC and Description',
  pcAndDescription: 'PC and Description',
  ac: 'AC',
  expenditureActuals: 'Expenditure Actuals',
  journalLineDescription: 'Journal Line Description',
  journalId: 'Journal ID',
  referenceNum: 'Reference Num',
  journalDate: 'Journal Date',
  journalLine: 'Journal Line',
  journalLineRef: 'Journal Line Ref',
  postedDate: 'Posted Date',
  unpostSeq: 'Unpost Seq',
  source: 'Source',
  operatorId: 'Operator ID',
  poId: 'PO ID',
  vendorId: 'Vendor ID',
  vendorName: 'Vendor Name',
} as const satisfies Record<
  keyof Omit<PowerBiExpenditureActualsRow, 'raw'>,
  string
>;

function normalize(value: string | undefined | null): string {
  return String(value ?? '').trim();
}

function normalizeColumnName(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function valueForColumn(
  row: Record<string, string>,
  columnName: string
): string {
  const directValue = row[columnName];
  const normalizedDirectValue = normalize(directValue);
  if (normalizedDirectValue) return normalizedDirectValue;

  const targetColumnName = normalizeColumnName(columnName);
  for (const [key, value] of Object.entries(row)) {
    if (key === columnName) continue;
    if (normalizeColumnName(key) === targetColumnName) return normalize(value);
  }

  return normalizedDirectValue;
}

function normalizeForMatch(value: string | undefined | null): string {
  return normalize(value).toLowerCase().replace(/\s+/g, ' ');
}

function splitRuleValues(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((entry) => normalizeForMatch(entry))
    .filter(Boolean);
}

function excelSerialDateToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Excel serial exports are short integer strings. If an 8-digit compact date
  // failed structured parsing, do not reinterpret it as a serial number.
  if (!/^\d{1,6}$/.test(trimmed)) return null;
  const serial = Number(trimmed);
  if (!Number.isFinite(serial)) return null;
  const date = new Date(Date.UTC(1899, 11, 30));
  date.setUTCDate(date.getUTCDate() + Math.trunc(serial));
  return date.toISOString().slice(0, 10);
}

function datePartsToIso(args: {
  year: number;
  month: number;
  day: number;
}): string | null {
  const { year, month, day } = args;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function parseDelimitedDateToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return datePartsToIso({
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    });
  }

  const dayMonthYearMatch = trimmed.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:\b|\s)/
  );
  if (!dayMonthYearMatch) return null;

  const first = Number(dayMonthYearMatch[1]);
  const second = Number(dayMonthYearMatch[2]);
  const rawYear = Number(dayMonthYearMatch[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;

  const [day, month] =
    first > 12
      ? [first, second]
      : second > 12
        ? [second, first]
        : [first, second];

  return datePartsToIso({ year, month, day });
}

function parseCompactDateToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!/^\d{8}$/.test(trimmed)) return null;

  const firstFour = Number(trimmed.slice(0, 4));
  if (firstFour >= 1900 && firstFour <= 2100) {
    return datePartsToIso({
      year: firstFour,
      month: Number(trimmed.slice(4, 6)),
      day: Number(trimmed.slice(6, 8)),
    });
  }

  return datePartsToIso({
    year: Number(trimmed.slice(4, 8)),
    month: Number(trimmed.slice(2, 4)),
    day: Number(trimmed.slice(0, 2)),
  });
}

function parsePowerBiDateToIso(value: string): string | null {
  return (
    parseDelimitedDateToIso(value) ??
    parseCompactDateToIso(value) ??
    excelSerialDateToIso(value)
  );
}

function parsePowerBiAmount(value: string): number {
  const trimmed = value.trim();
  const isAccountingNegative = trimmed.startsWith('(') && trimmed.endsWith(')');
  const normalized = trimmed.replace(/[^0-9.-]/g, '');
  if (!/[0-9]/.test(normalized)) return Number.NaN;
  const numeric = Number(normalized);
  return isAccountingNegative ? -numeric : numeric;
}

function isActualLedger(value: string): boolean {
  return /^actuals?$/i.test(value.trim());
}

export function toPowerBiExpenditureActualsRow(
  row: Record<string, string>
): PowerBiExpenditureActualsRow {
  return {
    ledger: valueForColumn(row, POWER_BI_COLUMNS.ledger),
    fiscalYear: valueForColumn(row, POWER_BI_COLUMNS.fiscalYear),
    period: valueForColumn(row, POWER_BI_COLUMNS.period),
    ccAndDescription: valueForColumn(row, POWER_BI_COLUMNS.ccAndDescription),
    rcAndDescription: valueForColumn(row, POWER_BI_COLUMNS.rcAndDescription),
    pcAndDescription: valueForColumn(row, POWER_BI_COLUMNS.pcAndDescription),
    ac: valueForColumn(row, POWER_BI_COLUMNS.ac),
    expenditureActuals: valueForColumn(
      row,
      POWER_BI_COLUMNS.expenditureActuals
    ),
    journalLineDescription: valueForColumn(
      row,
      POWER_BI_COLUMNS.journalLineDescription
    ),
    journalId: valueForColumn(row, POWER_BI_COLUMNS.journalId),
    referenceNum: valueForColumn(row, POWER_BI_COLUMNS.referenceNum),
    journalDate: valueForColumn(row, POWER_BI_COLUMNS.journalDate),
    journalLine: valueForColumn(row, POWER_BI_COLUMNS.journalLine),
    journalLineRef: valueForColumn(row, POWER_BI_COLUMNS.journalLineRef),
    postedDate: valueForColumn(row, POWER_BI_COLUMNS.postedDate),
    unpostSeq: valueForColumn(row, POWER_BI_COLUMNS.unpostSeq),
    source: valueForColumn(row, POWER_BI_COLUMNS.source),
    operatorId: valueForColumn(row, POWER_BI_COLUMNS.operatorId),
    poId: valueForColumn(row, POWER_BI_COLUMNS.poId),
    vendorId: valueForColumn(row, POWER_BI_COLUMNS.vendorId),
    vendorName: valueForColumn(row, POWER_BI_COLUMNS.vendorName),
    raw: row,
  };
}

export function powerBiExternalId(row: PowerBiExpenditureActualsRow): string {
  return [row.journalId, row.journalLine, row.journalLineRef]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(':');
}

export function powerBiTransactionDate(
  row: PowerBiExpenditureActualsRow
): string {
  return (
    parsePowerBiDateToIso(row.journalDate) ??
    parsePowerBiDateToIso(row.postedDate) ??
    ''
  );
}

export function powerBiAmountCents(row: PowerBiExpenditureActualsRow): number {
  const amount = parsePowerBiAmount(row.expenditureActuals);
  return Number.isFinite(amount) ? toCents(amount) : Number.NaN;
}

export function powerBiItem(row: PowerBiExpenditureActualsRow): string {
  return row.vendorName || row.journalLineDescription || row.journalId;
}

export function powerBiDescription(row: PowerBiExpenditureActualsRow): string {
  return [
    row.journalLineDescription,
    row.ccAndDescription,
    row.source ? `Source: ${row.source}` : '',
    row.referenceNum ? `Reference: ${row.referenceNum}` : '',
    row.poId ? `PO: ${row.poId}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}

function valueForRuleField(
  row: PowerBiExpenditureActualsRow,
  field: ImportRuleField
): string {
  switch (field) {
    case 'ledger':
      return row.ledger;
    case 'source':
      return row.source;
    case 'journalId':
      return row.journalId;
    case 'journalLineDescription':
      return row.journalLineDescription;
    case 'ccAndDescription':
      return row.ccAndDescription;
    case 'vendorName':
      return row.vendorName;
    case 'poId':
      return row.poId;
    case 'referenceNum':
      return row.referenceNum;
    case 'anyText':
      return Object.values(row.raw).join(' ');
  }
}

export function matchesPowerBiImportRule(
  row: PowerBiExpenditureActualsRow,
  rule: Pick<ImportRule, 'field' | 'operator' | 'value'>
) {
  const haystack = normalizeForMatch(valueForRuleField(row, rule.field));
  const needle = normalizeForMatch(rule.value);
  const needles = splitRuleValues(rule.value);
  if (!needle) return false;

  switch (rule.operator) {
    case 'equals':
      return haystack === needle;
    case 'equals_any':
      return needles.some((candidate) => haystack === candidate);
    case 'contains':
      return haystack.includes(needle);
    case 'contains_any':
      return needles.some((candidate) => haystack.includes(candidate));
    case 'starts_with':
      return haystack.startsWith(needle);
    case 'starts_with_any':
      return needles.some((candidate) => haystack.startsWith(candidate));
    case 'ends_with':
      return haystack.endsWith(needle);
    case 'ends_with_any':
      return needles.some((candidate) => haystack.endsWith(candidate));
  }
}

export function decidePowerBiImportRule(args: {
  row: PowerBiExpenditureActualsRow;
  rules: ImportRule[];
}): ImportRuleDecision {
  // Preserve the caller-provided rule order. Preview loaders already prepare
  // project-local rules ahead of inherited company rules, and re-sorting here
  // by sort order alone would lose that precedence.
  for (const rule of args.rules.filter((rule) => rule.enabled)) {
    if (!matchesPowerBiImportRule(args.row, rule)) continue;
    return {
      action: rule.action,
      matchedRule: rule,
      reason: rule.name,
    };
  }

  if (!isActualLedger(args.row.ledger)) {
    return {
      action: 'exclude',
      reason: 'Ledger is not ACTUAL/ACTUALS',
    };
  }

  return {
    action: 'import',
    reason: 'No import rule matched',
  };
}

export function defaultPowerBiImportRules(
  companyId: ImportRule['companyId']
): Array<Omit<ImportRule, 'id' | 'createdAt' | 'updatedAt'>> {
  return [
    {
      companyId,
      scope: 'company',
      name: 'Exclude SAL payroll source',
      action: 'exclude',
      field: 'source',
      operator: 'equals',
      value: 'SAL',
      sortOrder: 10,
      enabled: true,
    },
    {
      companyId,
      scope: 'company',
      name: 'Exclude EXA unacquitted Concur source',
      action: 'exclude',
      field: 'source',
      operator: 'equals',
      value: 'EXA',
      sortOrder: 20,
      enabled: true,
    },
    {
      companyId,
      scope: 'company',
      name: 'Review internal salary transfer cost codes',
      action: 'review',
      field: 'ccAndDescription',
      operator: 'contains_any',
      value: '4041,4141,salaries trf',
      sortOrder: 30,
      enabled: true,
    },
    {
      companyId,
      scope: 'company',
      name: 'Review suspected salary transfer descriptions',
      action: 'review',
      field: 'journalLineDescription',
      operator: 'contains_any',
      value: 'sal,salary,salaries,payroll,wage,wages,suspense,trf',
      sortOrder: 40,
      enabled: true,
    },
  ];
}
