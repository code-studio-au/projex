import type {
  ImportPreviewRow,
  ImportRuleAction,
  ImportRuleField,
  ImportRuleOperator,
} from '../types';
import { toPowerBiExpenditureActualsRow } from './powerBiImport';

type ImportRuleDraft = {
  name: string;
  action: ImportRuleAction;
  field: ImportRuleField;
  operator: ImportRuleOperator;
  value: string;
};

const GENERIC_POWERBI_SOURCES = new Set(['EXP']);

function normalizeRuleValue(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function titleCaseToken(value: string): string {
  return value
    .toLowerCase()
    .split(/[\s/_-]+/)
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(' ');
}

function compactRuleLabel(value: string): string {
  const normalized = normalizeRuleValue(value);
  if (!normalized) return 'matching rows';
  if (normalized.length <= 48) return normalized;
  return `${normalized.slice(0, 45).trimEnd()}...`;
}

function buildExcludeRuleDraft(args: {
  field: ImportRuleField;
  operator: ImportRuleOperator;
  value: string;
  label: string;
}): ImportRuleDraft {
  return {
    name: `Exclude ${args.label}`,
    action: 'exclude',
    field: args.field,
    operator: args.operator,
    value: args.value,
  };
}

export function suggestImportExclusionRuleFromPreviewRow(
  row: ImportPreviewRow
): ImportRuleDraft | null {
  const rawRow = row.rawSourceRow
    ? toPowerBiExpenditureActualsRow(row.rawSourceRow)
    : null;

  const source = normalizeRuleValue(rawRow?.source);
  if (source && !GENERIC_POWERBI_SOURCES.has(source.toUpperCase())) {
    return buildExcludeRuleDraft({
      field: 'source',
      operator: 'equals',
      value: source,
      label: `${titleCaseToken(source)} source`,
    });
  }

  const vendorName = normalizeRuleValue(rawRow?.vendorName);
  if (vendorName) {
    return buildExcludeRuleDraft({
      field: 'vendorName',
      operator: 'equals',
      value: vendorName,
      label: `${compactRuleLabel(vendorName)} vendor rows`,
    });
  }

  const poId = normalizeRuleValue(rawRow?.poId);
  if (poId) {
    return buildExcludeRuleDraft({
      field: 'poId',
      operator: 'equals',
      value: poId,
      label: `PO ${compactRuleLabel(poId)}`,
    });
  }

  const referenceNum = normalizeRuleValue(rawRow?.referenceNum);
  if (referenceNum) {
    return buildExcludeRuleDraft({
      field: 'referenceNum',
      operator: 'equals',
      value: referenceNum,
      label: `reference ${compactRuleLabel(referenceNum)}`,
    });
  }

  const journalId = normalizeRuleValue(rawRow?.journalId);
  if (journalId) {
    return buildExcludeRuleDraft({
      field: 'journalId',
      operator: 'equals',
      value: journalId,
      label: `journal ${compactRuleLabel(journalId)}`,
    });
  }

  const item = normalizeRuleValue(row.item);
  if (item) {
    return buildExcludeRuleDraft({
      field: 'journalLineDescription',
      operator: 'contains',
      value: item,
      label: `${compactRuleLabel(item)} rows`,
    });
  }

  const description = normalizeRuleValue(rawRow?.journalLineDescription);
  if (description) {
    return buildExcludeRuleDraft({
      field: 'journalLineDescription',
      operator: 'contains',
      value: description,
      label: `${compactRuleLabel(description)} rows`,
    });
  }

  return null;
}
