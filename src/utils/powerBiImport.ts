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

function normalizeForMatch(value: string | undefined | null): string {
  return normalize(value).toLowerCase().replace(/\s+/g, ' ');
}

function excelSerialDateToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const serial = Number(trimmed);
  if (!Number.isFinite(serial)) return null;
  const date = new Date(Date.UTC(1899, 11, 30));
  date.setUTCDate(date.getUTCDate() + Math.trunc(serial));
  return date.toISOString().slice(0, 10);
}

function parsePowerBiAmount(value: string): number {
  const trimmed = value.trim();
  const isAccountingNegative = trimmed.startsWith('(') && trimmed.endsWith(')');
  const numeric = Number(trimmed.replace(/[^0-9.-]/g, ''));
  return isAccountingNegative ? -numeric : numeric;
}

export function toPowerBiExpenditureActualsRow(
  row: Record<string, string>
): PowerBiExpenditureActualsRow {
  return {
    ledger: normalize(row[POWER_BI_COLUMNS.ledger]),
    fiscalYear: normalize(row[POWER_BI_COLUMNS.fiscalYear]),
    period: normalize(row[POWER_BI_COLUMNS.period]),
    ccAndDescription: normalize(row[POWER_BI_COLUMNS.ccAndDescription]),
    rcAndDescription: normalize(row[POWER_BI_COLUMNS.rcAndDescription]),
    pcAndDescription: normalize(row[POWER_BI_COLUMNS.pcAndDescription]),
    ac: normalize(row[POWER_BI_COLUMNS.ac]),
    expenditureActuals: normalize(row[POWER_BI_COLUMNS.expenditureActuals]),
    journalLineDescription: normalize(
      row[POWER_BI_COLUMNS.journalLineDescription]
    ),
    journalId: normalize(row[POWER_BI_COLUMNS.journalId]),
    referenceNum: normalize(row[POWER_BI_COLUMNS.referenceNum]),
    journalDate: normalize(row[POWER_BI_COLUMNS.journalDate]),
    journalLine: normalize(row[POWER_BI_COLUMNS.journalLine]),
    journalLineRef: normalize(row[POWER_BI_COLUMNS.journalLineRef]),
    postedDate: normalize(row[POWER_BI_COLUMNS.postedDate]),
    unpostSeq: normalize(row[POWER_BI_COLUMNS.unpostSeq]),
    source: normalize(row[POWER_BI_COLUMNS.source]),
    operatorId: normalize(row[POWER_BI_COLUMNS.operatorId]),
    poId: normalize(row[POWER_BI_COLUMNS.poId]),
    vendorId: normalize(row[POWER_BI_COLUMNS.vendorId]),
    vendorName: normalize(row[POWER_BI_COLUMNS.vendorName]),
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
    excelSerialDateToIso(row.postedDate) ??
    excelSerialDateToIso(row.journalDate) ??
    ''
  );
}

export function powerBiAmountCents(row: PowerBiExpenditureActualsRow): number {
  return toCents(parsePowerBiAmount(row.expenditureActuals));
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

function ruleMatches(row: PowerBiExpenditureActualsRow, rule: ImportRule) {
  const haystack = normalizeForMatch(valueForRuleField(row, rule.field));
  const needle = normalizeForMatch(rule.value);
  if (!needle) return false;

  switch (rule.operator) {
    case 'equals':
      return haystack === needle;
    case 'contains':
      return haystack.includes(needle);
    case 'starts_with':
      return haystack.startsWith(needle);
    case 'regex':
      try {
        return new RegExp(rule.value, 'i').test(
          valueForRuleField(row, rule.field)
        );
      } catch {
        return false;
      }
  }
}

export function decidePowerBiImportRule(args: {
  row: PowerBiExpenditureActualsRow;
  rules: ImportRule[];
}): ImportRuleDecision {
  const sortedRules = args.rules
    .filter((rule) => rule.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  for (const rule of sortedRules) {
    if (!ruleMatches(args.row, rule)) continue;
    return {
      action: rule.action,
      matchedRule: rule,
      reason: rule.name,
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
      name: 'Review internal salary transfer cost codes',
      action: 'review',
      field: 'ccAndDescription',
      operator: 'regex',
      value: '^(4041|4141)\\b|salaries trf',
      sortOrder: 30,
      enabled: true,
    },
    {
      companyId,
      name: 'Review suspected salary transfer descriptions',
      action: 'review',
      field: 'journalLineDescription',
      operator: 'regex',
      value: '\\b(sal|salary|salaries|payroll|wages?|suspense|trf)\\b',
      sortOrder: 40,
      enabled: true,
    },
  ];
}
