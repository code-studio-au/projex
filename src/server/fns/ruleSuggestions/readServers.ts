import type { RuleSuggestionsListResult } from '../../../api/types';
import type { Txn } from '../../../types';
import {
  asCompanyDefaultCategoryId,
  asCompanyDefaultMappingRuleId,
  asCompanyDefaultSubCategoryId,
  asRuleSuggestionId,
  type CompanyId,
  type ProjectId,
  type UserId,
} from '../../../types';
import {
  MIN_RULE_SUGGESTION_SAMPLE_COUNT,
  ruleSuggestionConfidenceLevel,
  ruleSuggestionConfidenceReasons,
} from '../../../utils/ruleSuggestions';
import { omitUndefinedProperties } from '../../../utils/optionalProperties';
import { requireAuthorized } from '../../auth/authorize';
import { getDb } from '../../db/db';
import {
  assertContextProvided,
  requireServerUserId,
  type ServerFnContextInput,
  withServerBoundary,
} from '../runtime';

async function requireCompanyViewContext(
  context: ServerFnContextInput,
  companyId: CompanyId
) {
  const db = getDb();
  const userId = await requireServerUserId(context);
  await requireAuthorized({ db, userId, action: 'company:view', companyId });
  return { db };
}

export async function listRuleSuggestionsServer(args: {
  context: ServerFnContextInput;
  companyId: CompanyId;
}): Promise<RuleSuggestionsListResult> {
  return withServerBoundary(async () => {
    assertContextProvided(args.context);
    const { db } = await requireCompanyViewContext(
      args.context,
      args.companyId
    );

    const suggestions = await db
      .selectFrom('rule_suggestions')
      .selectAll()
      .where('company_id', '=', args.companyId)
      .where('status', '=', 'open')
      .where('sample_count', '>=', MIN_RULE_SUGGESTION_SAMPLE_COUNT)
      .orderBy('last_seen_at', 'desc')
      .orderBy('sample_count', 'desc')
      .execute();

    if (suggestions.length === 0) return [];

    const evidenceRows = await db
      .selectFrom('rule_suggestions as rs')
      .innerJoin('rule_suggestion_signals as sig', (join) =>
        join
          .onRef('rs.company_id', '=', 'sig.company_id')
          .onRef('rs.suggestion_type', '=', 'sig.suggestion_type')
          .onRef(
            'rs.pattern_text_normalized',
            '=',
            'sig.pattern_text_normalized'
          )
          .onRef(
            'rs.company_default_sub_category_id',
            '=',
            'sig.company_default_sub_category_id'
          )
          .on((eb) =>
            eb.or([
              eb('rs.source_rule_id', '=', eb.ref('sig.source_rule_id')),
              eb.and([
                eb('rs.source_rule_id', 'is', null),
                eb('sig.source_rule_id', 'is', null),
              ]),
            ])
          )
      )
      .innerJoin('txns as t', (join) =>
        join
          .onRef('sig.project_id', '=', 't.project_id')
          .onRef('sig.txn_public_id', '=', 't.public_id')
      )
      .innerJoin('projects as p', 'p.id', 'sig.project_id')
      .select([
        'rs.id as suggestion_id',
        'sig.txn_public_id',
        'sig.project_id',
        'p.name as project_name',
        'p.currency',
        't.item',
        't.description',
        't.amount_cents',
        't.txn_date',
        'sig.created_at',
      ])
      .where(
        'rs.id',
        'in',
        suggestions.map((suggestion) => suggestion.id)
      )
      .orderBy('sig.created_at', 'desc')
      .execute();

    const evidenceBySuggestion = new Map<
      string,
      RuleSuggestionsListResult[number]['evidence']
    >();
    for (const row of evidenceRows) {
      const evidence = evidenceBySuggestion.get(row.suggestion_id) ?? [];
      if (evidence.length >= 3) continue;
      evidence.push({
        txnId: row.txn_public_id as Txn['id'],
        projectId: row.project_id as ProjectId,
        item: row.item,
        description: row.description,
        amountCents: Number(row.amount_cents),
        projectName: row.project_name,
        currency: row.currency,
        txnDate: row.txn_date,
        createdAt: row.created_at,
      });
      evidenceBySuggestion.set(row.suggestion_id, evidence);
    }

    const sourceRuleIds = Array.from(
      new Set(
        suggestions
          .map((suggestion) => suggestion.source_rule_id)
          .filter((ruleId): ruleId is string => Boolean(ruleId))
      )
    );
    const sourceRules =
      sourceRuleIds.length === 0
        ? []
        : await db
            .selectFrom('company_default_mapping_rules')
            .selectAll()
            .where('company_id', '=', args.companyId)
            .where('id', 'in', sourceRuleIds)
            .execute();
    const sourceRuleById = new Map(
      sourceRules.map((rule) => [
        rule.id,
        {
          id: asCompanyDefaultMappingRuleId(rule.id),
          companyId: rule.company_id as CompanyId,
          matchText: rule.match_text,
          companyDefaultCategoryId: asCompanyDefaultCategoryId(
            rule.company_default_category_id
          ),
          companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(
            rule.company_default_sub_category_id
          ),
          sortOrder: rule.sort_order,
          createdAt: rule.created_at,
          updatedAt: rule.updated_at,
        },
      ])
    );

    return suggestions.map((row) =>
      omitUndefinedProperties({
        id: asRuleSuggestionId(row.id),
        companyId: row.company_id as CompanyId,
        status: row.status,
        suggestionType: row.suggestion_type,
        sourceRuleId: row.source_rule_id
          ? asCompanyDefaultMappingRuleId(row.source_rule_id)
          : undefined,
        patternBasis: row.pattern_basis,
        patternTextNormalized: row.pattern_text_normalized,
        proposedMatchText: row.proposed_match_text,
        matchTextAlternatives: row.match_text_alternatives,
        companyDefaultCategoryId: asCompanyDefaultCategoryId(
          row.company_default_category_id
        ),
        companyDefaultSubCategoryId: asCompanyDefaultSubCategoryId(
          row.company_default_sub_category_id
        ),
        sampleCount: row.sample_count,
        distinctTxnDateCount: row.distinct_txn_date_count,
        distinctProjectCount: row.distinct_project_count,
        confidenceScore: row.confidence_score,
        confidence: ruleSuggestionConfidenceLevel(row.confidence_score),
        confidenceReasons: ruleSuggestionConfidenceReasons({
          sampleCount: row.sample_count,
          distinctTxnDateCount: row.distinct_txn_date_count,
          distinctProjectCount: row.distinct_project_count,
          patternBasis: row.pattern_basis,
        }),
        recommendedAction: row.recommended_action,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        acceptedRuleId: row.accepted_rule_id
          ? asCompanyDefaultMappingRuleId(row.accepted_rule_id)
          : undefined,
        acceptedAction: row.accepted_action ?? undefined,
        acceptedAt: row.accepted_at ?? undefined,
        acceptedByUserId: row.accepted_by_user_id
          ? (row.accepted_by_user_id as UserId)
          : undefined,
        dismissedAt: row.dismissed_at ?? undefined,
        dismissedReason: row.dismissed_reason ?? undefined,
        dismissedByUserId: row.dismissed_by_user_id
          ? (row.dismissed_by_user_id as UserId)
          : undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        evidence: evidenceBySuggestion.get(row.id) ?? [],
        sourceRule: row.source_rule_id
          ? sourceRuleById.get(row.source_rule_id)
          : undefined,
      })
    );
  });
}
