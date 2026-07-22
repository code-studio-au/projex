import type {
  ImportRule,
  ImportRuleAction,
  ImportRuleField,
  ImportRuleOperator,
} from '../types';

export const importRuleActionOptions: Array<{
  value: ImportRuleAction;
  label: string;
}> = [
  { value: 'exclude', label: 'Exclude' },
  { value: 'review', label: 'Send to project review' },
  { value: 'import', label: 'Import' },
];

export const importRuleFieldOptions: Array<{
  value: ImportRuleField;
  label: string;
}> = [
  { value: 'ledger', label: 'Ledger' },
  { value: 'source', label: 'Source' },
  { value: 'journalId', label: 'Journal ID' },
  { value: 'journalLineDescription', label: 'Journal Line Description' },
  { value: 'ccAndDescription', label: 'CC and Description' },
  { value: 'vendorName', label: 'Vendor Name' },
  { value: 'poId', label: 'PO ID' },
  { value: 'referenceNum', label: 'Reference Num' },
  { value: 'anyText', label: 'Any source text' },
];

export const importRuleOperatorOptions: Array<{
  value: ImportRuleOperator;
  label: string;
}> = [
  { value: 'equals', label: 'Equals' },
  { value: 'equals_any', label: 'Equals any of' },
  { value: 'contains', label: 'Contains' },
  { value: 'contains_any', label: 'Contains any of' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'starts_with_any', label: 'Starts with any of' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'ends_with_any', label: 'Ends with any of' },
];

function optionValue<T extends string>(
  options: Array<{ value: T }>,
  value: string | null
): T | null {
  return options.some((option) => option.value === value) ? (value as T) : null;
}

export const toImportRuleAction = (value: string | null) =>
  optionValue(importRuleActionOptions, value);

export const toImportRuleField = (value: string | null) =>
  optionValue(importRuleFieldOptions, value);

export const toImportRuleOperator = (value: string | null) =>
  optionValue(importRuleOperatorOptions, value);

export function nextImportRuleSortOrder(rules: ImportRule[]) {
  return rules.length
    ? Math.max(...rules.map((rule) => rule.sortOrder)) + 10
    : 10;
}

export function canMoveImportRule(args: {
  rules: ImportRule[];
  index: number;
  direction: -1 | 1;
  scope: 'company' | 'project';
}) {
  const rule = args.rules[args.index];
  const target = args.rules[args.index + args.direction];
  if (!rule || !target) return false;
  return args.scope === 'company' || target.syncStatus === rule.syncStatus;
}
