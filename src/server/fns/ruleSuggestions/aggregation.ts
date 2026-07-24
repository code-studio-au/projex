import { sql, type Kysely } from 'kysely';

import type {
  CompanyDefaultMappingRuleId,
  RuleSuggestionAcceptanceAction,
  RuleSuggestionType,
} from '../../../types';
import {
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  type CompanyId,
} from '../../../types';
import { uid } from '../../../utils/id';
import {
  buildRuleSuggestionMatchTextOptions,
  calculateRuleSuggestionConfidence,
  normalizeRuleSuggestionPatternText,
} from '../../../utils/ruleSuggestions';
import type { DB } from '../../db/schema';

const DISMISSAL_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const DISMISSAL_REOPEN_SAMPLE_DELTA = 3;

export type SuggestionKey = {
  companyId: CompanyId;
  suggestionType: RuleSuggestionType;
  sourceRuleId: CompanyDefaultMappingRuleId | null;
  patternTextNormalized: string;
  companyDefaultSubCategoryId: ReturnType<typeof asCompanyDefaultSubCategoryId>;
};

export type ExistingSignalRow = {
  id: string;
  project_id: string;
  txn_public_id: string;
  company_id: string;
  suggestion_type: RuleSuggestionType;
  source_rule_id: string | null;
  pattern_text_normalized: string;
  company_default_sub_category_id: string;
};

export function buildSuggestionKey(row: {
  company_id: string;
  suggestion_type: RuleSuggestionType;
  source_rule_id: string | null;
  pattern_text_normalized: string;
  company_default_sub_category_id: string;
}): SuggestionKey {
  return {
    companyId: row.company_id as CompanyId,
    suggestionType: row.suggestion_type,
    sourceRuleId: row.source_rule_id
      ? asCompanyDefaultMappingRuleId(row.source_rule_id)
      : null,
    patternTextNormalized: row.pattern_text_normalized,
    companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(
      row.company_default_sub_category_id
    ),
  };
}

export function suggestionKeysEqual(
  a: SuggestionKey,
  b: SuggestionKey
): boolean {
  return (
    a.companyId === b.companyId &&
    a.suggestionType === b.suggestionType &&
    a.sourceRuleId === b.sourceRuleId &&
    a.patternTextNormalized === b.patternTextNormalized &&
    a.companyDefaultSubCategoryId === b.companyDefaultSubCategoryId
  );
}

function suggestionLockKey(key: SuggestionKey): string {
  return [
    key.companyId,
    key.suggestionType,
    key.sourceRuleId ?? '',
    key.patternTextNormalized,
    key.companyDefaultSubCategoryId,
  ].join('\u001f');
}

export async function lockSuggestionKeys(
  db: Kysely<DB>,
  keys: readonly SuggestionKey[]
): Promise<void> {
  const lockKeys = Array.from(new Set(keys.map(suggestionLockKey))).sort();
  for (const lockKey of lockKeys) {
    await sql`
      select pg_advisory_xact_lock(
        hashtextextended(${`rule-suggestion:${lockKey}`}, 0)
      )
    `.execute(db);
  }
}

export async function refreshSuggestionAggregate(
  db: Kysely<DB>,
  key: SuggestionKey
): Promise<void> {
  const signals = await db
    .selectFrom('rule_suggestion_signals as sig')
    .innerJoin('txns as t', (join) =>
      join
        .onRef('sig.project_id', '=', 't.project_id')
        .onRef('sig.txn_public_id', '=', 't.public_id')
    )
    .select([
      'sig.id',
      'sig.company_id',
      'sig.project_id',
      'sig.source_rule_id',
      'sig.pattern_basis',
      'sig.pattern_text_raw',
      'sig.pattern_text_normalized',
      'sig.company_default_category_id',
      'sig.company_default_sub_category_id',
      'sig.created_at',
      'sig.updated_at',
      't.txn_date',
    ])
    .where('sig.company_id', '=', key.companyId)
    .where('sig.suggestion_type', '=', key.suggestionType)
    .where('sig.pattern_text_normalized', '=', key.patternTextNormalized)
    .where(
      'sig.company_default_sub_category_id',
      '=',
      key.companyDefaultSubCategoryId
    )
    .where(({ eb }) =>
      key.sourceRuleId
        ? eb('sig.source_rule_id', '=', key.sourceRuleId)
        : eb('sig.source_rule_id', 'is', null)
    )
    .orderBy('sig.created_at', 'asc')
    .execute();

  if (signals.length === 0) {
    await db
      .deleteFrom('rule_suggestions')
      .where('company_id', '=', key.companyId)
      .where('suggestion_type', '=', key.suggestionType)
      .where('pattern_text_normalized', '=', key.patternTextNormalized)
      .where(
        'company_default_sub_category_id',
        '=',
        key.companyDefaultSubCategoryId
      )
      .where(({ eb }) =>
        key.sourceRuleId
          ? eb('source_rule_id', '=', key.sourceRuleId)
          : eb('source_rule_id', 'is', null)
      )
      .where('status', '=', 'open')
      .execute();
    return;
  }

  const sampleCount = signals.length;
  const firstSignal = signals[0]!;
  const lastSignal = signals[signals.length - 1]!;
  const now = new Date().toISOString();
  const distinctTxnDateCount = new Set(signals.map((signal) => signal.txn_date))
    .size;
  const distinctProjectCount = new Set(
    signals.map((signal) => signal.project_id)
  ).size;
  const patternBasis = firstSignal.pattern_basis;
  const confidenceScore = calculateRuleSuggestionConfidence({
    sampleCount,
    distinctTxnDateCount,
    distinctProjectCount,
    patternBasis,
  });
  const matchTextOptions = buildRuleSuggestionMatchTextOptions({
    normalizedPattern: key.patternTextNormalized,
    rawPatterns: signals.map((signal) => signal.pattern_text_raw),
  });
  const sourceRule = key.sourceRuleId
    ? await db
        .selectFrom('company_default_mapping_rules')
        .select(['id', 'match_text'])
        .where('company_id', '=', key.companyId)
        .where('id', '=', key.sourceRuleId)
        .executeTakeFirst()
    : null;
  const recommendedAction: RuleSuggestionAcceptanceAction =
    key.suggestionType === 'create_rule'
      ? 'create_rule'
      : sourceRule &&
          normalizeRuleSuggestionPatternText(sourceRule.match_text) ===
            key.patternTextNormalized
        ? 'update_existing'
        : 'create_narrower';

  const existing = await db
    .selectFrom('rule_suggestions')
    .select(['id', 'status', 'dismissed_at', 'dismissed_sample_count'])
    .where('company_id', '=', key.companyId)
    .where('suggestion_type', '=', key.suggestionType)
    .where('pattern_text_normalized', '=', key.patternTextNormalized)
    .where(
      'company_default_sub_category_id',
      '=',
      key.companyDefaultSubCategoryId
    )
    .where(({ eb }) =>
      key.sourceRuleId
        ? eb('source_rule_id', '=', key.sourceRuleId)
        : eb('source_rule_id', 'is', null)
    )
    .executeTakeFirst();

  const dismissalAgeMs = existing?.dismissed_at
    ? Date.now() - Date.parse(existing.dismissed_at)
    : Number.POSITIVE_INFINITY;
  const shouldRemainDismissed =
    existing?.status === 'dismissed' &&
    dismissalAgeMs < DISMISSAL_COOLDOWN_MS &&
    sampleCount <
      Number(existing.dismissed_sample_count ?? 0) +
        DISMISSAL_REOPEN_SAMPLE_DELTA;

  const nextValues = {
    source_rule_id: key.sourceRuleId,
    pattern_basis: patternBasis,
    proposed_match_text: matchTextOptions.proposedMatchText,
    match_text_alternatives: matchTextOptions.alternatives,
    company_default_category_id: firstSignal.company_default_category_id,
    company_default_sub_category_id:
      firstSignal.company_default_sub_category_id,
    sample_count: sampleCount,
    distinct_txn_date_count: distinctTxnDateCount,
    distinct_project_count: distinctProjectCount,
    confidence_score: confidenceScore,
    recommended_action: recommendedAction,
    first_seen_at: firstSignal.created_at,
    last_seen_at: lastSignal.updated_at,
    updated_at: now,
  };
  const reopenedValues = {
    ...nextValues,
    status: 'open' as const,
    accepted_rule_id: null,
    accepted_action: null,
    accepted_at: null,
    accepted_by_user_id: null,
    dismissed_reason: null,
    dismissed_sample_count: null,
    dismissed_at: null,
    dismissed_by_user_id: null,
  };

  if (existing) {
    await db
      .updateTable('rule_suggestions')
      .set(shouldRemainDismissed ? nextValues : reopenedValues)
      .where('id', '=', existing.id)
      .execute();
    return;
  }

  await db
    .insertInto('rule_suggestions')
    .values({
      id: uid('rsug'),
      company_id: key.companyId,
      status: 'open',
      suggestion_type: key.suggestionType,
      source_rule_id: key.sourceRuleId,
      pattern_basis: patternBasis,
      pattern_text_normalized: key.patternTextNormalized,
      proposed_match_text: matchTextOptions.proposedMatchText,
      match_text_alternatives: matchTextOptions.alternatives,
      company_default_category_id: firstSignal.company_default_category_id,
      company_default_sub_category_id:
        firstSignal.company_default_sub_category_id,
      sample_count: sampleCount,
      distinct_txn_date_count: distinctTxnDateCount,
      distinct_project_count: distinctProjectCount,
      confidence_score: confidenceScore,
      recommended_action: recommendedAction,
      first_seen_at: firstSignal.created_at,
      last_seen_at: lastSignal.updated_at,
      accepted_rule_id: null,
      accepted_action: null,
      accepted_at: null,
      accepted_by_user_id: null,
      dismissed_reason: null,
      dismissed_sample_count: null,
      dismissed_at: null,
      dismissed_by_user_id: null,
      created_at: now,
      updated_at: now,
    })
    .execute();
}
